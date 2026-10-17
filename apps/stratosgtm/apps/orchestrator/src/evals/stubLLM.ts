import type { AgentLLM, LLMResponse } from '../services/agentLoop';

/**
 * Replays a recorded tool-call script instead of calling a model.
 *
 * This exists so CI can prove the dispatcher, graders and persistence work with
 * no API key. It says NOTHING about any model: every result it produces must be
 * labelled mode:'offline'. It is not a simulation of a model's behaviour, only a
 * fixed sequence of decisions fed through the real tools and real graders.
 */
export interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

export interface TurnScript {
  /** Each inner array is one model round that requests those tool calls. */
  rounds: ScriptedCall[][];
  /** Final text for the turn; may read the runtime system prompt (to build a deliberate leak). */
  reply: string | ((ctx: { systemPrompt: string }) => string);
}

export function createStubLLM(turns: TurnScript[]): AgentLLM {
  let turnIdx = -1;
  let round = 0;
  let userCount = 0;
  let toolId = 0;

  return async (req): Promise<LLMResponse> => {
    const users = req.messages.filter((m) => m.role === 'user').length;
    if (users !== userCount) {
      userCount = users;
      turnIdx = users - 1;
      round = 0;
    }
    const script = turns[turnIdx];
    if (!script) throw new Error(`StubLLM has no script for user turn ${turnIdx + 1}`);

    if (req.tools && round < script.rounds.length) {
      const calls = script.rounds[round++];
      return {
        content: '',
        isFallback: false,
        model: 'stub-llm',
        tool_calls: calls.map((c) => ({
          id: `stub_${++toolId}`,
          type: 'function' as const,
          function: { name: c.name, arguments: JSON.stringify(c.args) }
        }))
      };
    }
    const systemPrompt = req.messages[0]?.role === 'system' ? (req.messages[0] as { content: string }).content : '';
    const reply = typeof script.reply === 'function' ? script.reply({ systemPrompt }) : script.reply;
    return { content: reply, isFallback: false, model: 'stub-llm' };
  };
}
