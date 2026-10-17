import { MemoryCrm } from '../evals/memoryCrm';
import { runAgentTurn, type AgentLLM } from '../services/agentLoop';
import { buildChatSystemPrompt } from '../services/chatPrompt';
import { deepseekService as defaultService, DeepSeekService } from '../services/deepseekService';
import { ToolDispatcher } from '../tools/dispatcher';
import { VOICE_AGENT_TOOLS } from '../tools/registry';
import { parseJsonObject, type BuyerLlm } from './llm';
import type { Persona } from './types';

export interface ConversationTurn {
  role: 'buyer' | 'agent';
  text: string;
}

/** Fixed for every self-test run: converse is never about a specific client's own brand voice. */
const AGENT_PROMPT_INPUT = {
  companyName: 'GrowthOS',
  activeAccount: 'Buyer Lab self-test',
  coreOffering: 'Autonomous voice-first growth operating system for founders and agencies',
  toneLabel: 'Tactical Operator'
};

/**
 * Anna's side of the conversation: the real tool-calling agent, thinking off. `isFallback` is
 * passed through unchanged so `runAgentTurn` (and `runConversation`) can stop rather than treat
 * a fallback as a real reply.
 */
export function createConverseAgentLlm(apiKey: string | undefined, service: Pick<DeepSeekService, 'createCompletion'> = defaultService): AgentLLM {
  return async (req) => {
    const c = await service.createCompletion({
      apiKey,
      temperature: 0.4,
      max_tokens: 400,
      thinking: 'disabled',
      messages: req.messages as any,
      tools: req.tools as any
    });
    return { content: c.content ?? '', tool_calls: c.tool_calls, isFallback: c.isFallback, model: c.model };
  };
}

function buildBuyerTurnPrompt(persona: Persona, history: ConversationTurn[]): { system: string; user: string } {
  const system =
    'You role-play one specific buyer in a short live chat with a growth-consulting agent named Anna. Stay in character; you are exactly as skeptical or as trusting as your persona describes. You reply with a single JSON object and nothing else.';
  const transcript = history.length
    ? history.map((t) => `${t.role === 'buyer' ? 'You' : 'Anna'}: ${t.text}`).join('\n')
    : '(the conversation has not started yet — send an opening message)';
  const user = [
    `Your persona (JSON): ${JSON.stringify({ archetype: persona.archetype, ...persona.spec })}`,
    `Conversation so far:\n${transcript}`,
    'Task: say your next message to Anna, as this buyer. Ask about the thing you actually care about, per your goals, constraints and reason you might not buy. 1-3 sentences, natural chat, no markdown.',
    'Return JSON: {"message":"..."}'
  ].join('\n\n');
  return { system, user };
}

export const MAX_CONVERSE_TURNS = 3;

/**
 * Runs up to MAX_CONVERSE_TURNS buyer/agent exchanges over a FRESH, isolated CRM constructed
 * inside this call — never the production crmStore, never shared across calls. Stops early
 * (returning whatever transcript exists so far) if the buyer LLM fails or answers empty, or if
 * the agent turn is a fallback.
 */
export async function runConversation(persona: Persona, buyerLlm: BuyerLlm, agentLlm: AgentLLM): Promise<ConversationTurn[]> {
  const crm = new MemoryCrm();
  const dispatcher = new ToolDispatcher(crm, { startContentJob: () => undefined });
  const systemPrompt = buildChatSystemPrompt(AGENT_PROMPT_INPUT);
  const history: ConversationTurn[] = [];
  const agentHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let turn = 0; turn < MAX_CONVERSE_TURNS; turn++) {
    const prompt = buildBuyerTurnPrompt(persona, history);
    let buyerMessage = '';
    try {
      const res = await buyerLlm({ system: prompt.system, user: prompt.user, maxTokens: 400 });
      const parsed = parseJsonObject(res.content);
      buyerMessage = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    } catch {
      break;
    }
    if (!buyerMessage) break;
    history.push({ role: 'buyer', text: buyerMessage });
    agentHistory.push({ role: 'user', content: buyerMessage });

    const agentTurn = await runAgentTurn({
      systemPrompt,
      history: agentHistory,
      tools: VOICE_AGENT_TOOLS,
      dispatch: (n, a) => dispatcher.dispatch(n, a),
      llm: agentLlm,
      temperature: 0.4
    });
    if (agentTurn.isFallback || !agentTurn.reply) break;
    history.push({ role: 'agent', text: agentTurn.reply });
    agentHistory.push({ role: 'assistant', content: agentTurn.reply });
  }
  return history;
}

export function transcriptText(turns: ConversationTurn[]): string {
  return turns.map((t) => `${t.role === 'buyer' ? 'Buyer' : 'Anna'}: ${t.text}`).join('\n');
}
