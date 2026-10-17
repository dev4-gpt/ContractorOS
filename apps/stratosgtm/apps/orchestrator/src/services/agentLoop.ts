import type { FlatToolDefinition } from '@voice-os/shared';

/**
 * Provider-neutral tool-calling agent turn.
 *
 * Extracted from /api/voice/chat so the exact same loop runs in production (text
 * chat) and in the eval harness. The model is injected as `llm`, the tool
 * executor as `dispatch`; this file imports no singletons and no I/O.
 *
 * Scope note: this loop drives the DeepSeek text model. The live voice path uses
 * AssemblyAI's own function calling, whose underlying model is not selectable.
 * Anything measured through this loop is a text-mode proxy for tool selection,
 * not a measurement of the voice model.
 */

export const MAX_AGENT_ITERATIONS = 4;

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type LLMMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: LLMToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export interface LLMTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LLMRequest {
  messages: LLMMessage[];
  /** Omitted on the final iteration to force a plain-text answer. */
  tools?: LLMTool[];
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  tool_calls?: LLMToolCall[];
  /** True when no live model produced this (no key, API error). Never a real answer. */
  isFallback: boolean;
  model?: string;
}

export type AgentLLM = (req: LLMRequest) => Promise<LLMResponse>;

export interface ExecutedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  latencyMs: number;
  failed: boolean;
}

export interface AgentTurnResult {
  reply: string;
  toolCalls: ExecutedToolCall[];
  /** True if any model call was a fallback; `reply` is then empty and must not be attributed to a model. */
  isFallback: boolean;
  /** Model id reported by the provider on the last call, if any. */
  model?: string;
  iterations: number;
}

export interface AgentTurnInput {
  systemPrompt: string;
  /** Conversation so far, ending with the user's latest message. */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: FlatToolDefinition[];
  dispatch: (name: string, args: Record<string, any>) => Promise<Record<string, any>>;
  llm: AgentLLM;
  temperature?: number;
}

export function toLLMTools(tools: FlatToolDefinition[]): LLMTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters as unknown as Record<string, unknown> }
  }));
}

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const messages: LLMMessage[] = [
    { role: 'system', content: input.systemPrompt },
    ...input.history.map((h) => ({ role: h.role, content: h.content }) as LLMMessage)
  ];
  const llmTools = toLLMTools(input.tools);
  const executed: ExecutedToolCall[] = [];
  let model: string | undefined;

  for (let i = 1; i <= MAX_AGENT_ITERATIONS; i++) {
    const lastIteration = i === MAX_AGENT_ITERATIONS;
    const res = await input.llm({
      messages,
      tools: lastIteration || llmTools.length === 0 ? undefined : llmTools,
      temperature: input.temperature
    });
    model = res.model ?? model;

    if (res.isFallback) {
      return { reply: '', toolCalls: executed, isFallback: true, model, iterations: i };
    }

    const calls = res.tool_calls ?? [];
    if (calls.length === 0 || lastIteration) {
      return { reply: (res.content || '').trim(), toolCalls: executed, isFallback: false, model, iterations: i };
    }

    messages.push({ role: 'assistant', content: res.content || null, tool_calls: calls });

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      let result: Record<string, unknown>;
      let failed = false;
      const started = Date.now();
      try {
        const parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('arguments must be a JSON object');
        }
        args = parsed;
        result = await input.dispatch(call.function.name, args);
        failed = result?.status === 'error';
      } catch (err: any) {
        failed = true;
        result = { status: 'error', message: `Tool call failed: ${err?.message || 'unknown error'}` };
      }
      executed.push({ name: call.function.name, args, result, latencyMs: Date.now() - started, failed });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  // Unreachable: the last iteration always returns above.
  return { reply: '', toolCalls: executed, isFallback: false, model, iterations: MAX_AGENT_ITERATIONS };
}
