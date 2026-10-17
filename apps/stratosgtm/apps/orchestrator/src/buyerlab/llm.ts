import { deepseekService as defaultService, DeepSeekService } from '../services/deepseekService';

export interface BuyerLlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
}
export interface BuyerLlmResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}
export type BuyerLlm = (req: BuyerLlmRequest) => Promise<BuyerLlmResult>;

/** No live model answered (no key, or the API errored). Never shown as a result. */
export class LlmUnavailableError extends Error {
  constructor() {
    super('The language model is unavailable.');
    this.name = 'LlmUnavailableError';
  }
}
/** The model answered, but not with usable JSON. */
export class LlmOutputError extends Error {
  constructor(message = 'The model returned an unusable answer.') {
    super(message);
    this.name = 'LlmOutputError';
  }
}

/**
 * JSON-mode chat completion through the production DeepSeek service. `apiKey` is the
 * caller's own key when they have one; undefined means the server key. Thinking is off
 * (the service default): hidden reasoning tokens count against max_tokens and can leave
 * the reply empty.
 */
export function createBuyerLlm(apiKey?: string, service: Pick<DeepSeekService, 'createCompletion'> = defaultService): BuyerLlm {
  return async (req) => {
    const c = await service.createCompletion({
      apiKey,
      temperature: 0.4,
      max_tokens: req.maxTokens ?? 2500,
      response_format: { type: 'json_object' },
      thinking: 'disabled',
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user }
      ]
    });
    if (c.isFallback) throw new LlmUnavailableError();
    if (!c.content || !c.content.trim()) throw new LlmOutputError('The model returned an empty answer.');
    return { content: c.content, promptTokens: c.tokens.prompt, completionTokens: c.tokens.completion, model: c.model };
  };
}

/** Parses a model answer into a JSON object, tolerating a code fence or surrounding prose. */
export function parseJsonObject(text: string): Record<string, unknown> {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const attempt = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  let value = attempt(stripped);
  if (value === undefined) {
    const first = stripped.indexOf('{');
    const last = stripped.lastIndexOf('}');
    if (first >= 0 && last > first) value = attempt(stripped.slice(first, last + 1));
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new LlmOutputError();
  return value as Record<string, unknown>;
}
