if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile();
  } catch {}
}

export interface DeepSeekToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type DeepSeekMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: DeepSeekToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export interface DeepSeekTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface DeepSeekCompletionOptions {
  model?: 'deepseek-chat' | 'deepseek-reasoner' | 'deepseek-flash' | string;
  messages: DeepSeekMessage[];
  /** OpenAI-compatible function tools. When present the model may answer with tool_calls instead of text. */
  tools?: DeepSeekTool[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  /**
   * deepseek-flash reasons by default, and hidden reasoning tokens count against
   * `max_tokens`, so a small budget can come back with empty content. Thinking is
   * therefore off unless a caller asks for it, and a caller that does must budget
   * for the reasoning as well as the reply. Ignored for the legacy chat/reasoner models.
   */
  thinking?: 'enabled' | 'disabled';
  /** Per-call key override — a signed-in caller's own saved key, when they have one. Never written onto the instance; the server key remains this.apiKey for every other call. */
  apiKey?: string;
}

export class DeepSeekService {
  private apiKey: string | undefined;
  private baseUrl: string = 'https://api.deepseek.com/v1';

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
  }

  public isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== 'your_deepseek_api_key_here';
  }

  public async createCompletion(options: DeepSeekCompletionOptions): Promise<{
    content: string;
    /** Present only when the model chose to call tools; `content` is then usually empty. */
    tool_calls?: DeepSeekToolCall[];
    reasoning_content?: string;
    tokens: { prompt: number; completion: number; total: number };
    model: string;
    /**
     * True when no live LLM call produced this content — no key configured, or
     * the API errored. Callers MUST check this before publishing, billing for,
     * or attributing the output to a model. Placeholder text presented as model
     * output is what let fabricated metrics reach real customer accounts.
     */
    isFallback: boolean;
  }> {
    const model = options.model || (process.env.DEEPSEEK_MODEL || 'deepseek-flash');
    const apiKey = options.apiKey || this.apiKey;
    const configured = !!apiKey && apiKey !== 'your_deepseek_api_key_here';

    if (!configured) {
      console.log(`[DeepSeek Service] No active API key found, generating high-fidelity fallback response using ${model}.`);
      return this.generateFallback(options);
    }

    const supportsThinkingToggle = model !== 'deepseek-reasoner' && model !== 'deepseek-chat';

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
          max_tokens: options.max_tokens ?? 2000,
          ...(supportsThinkingToggle ? { thinking: { type: options.thinking ?? 'disabled' } } : {}),
          ...(model !== 'deepseek-reasoner' ? { temperature: options.temperature ?? 0.3 } : {}),
          ...(model !== 'deepseek-reasoner' && options.response_format ? { response_format: options.response_format } : {})
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DeepSeek API Error] HTTP ${response.status}:`, errorText);
        return this.generateFallback(options);
      }

      const data = (await response.json()) as any;
      const choice = data.choices[0];

      if (!choice.message.content && !choice.message.tool_calls?.length) {
        console.warn(
          `[DeepSeek] empty reply from ${model} (finish_reason=${choice.finish_reason ?? 'unknown'}, max_tokens=${options.max_tokens ?? 2000}); the token budget may be too small for this model.`
        );
      }

      return {
        content: choice.message.content ?? '',
        ...(Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0
          ? { tool_calls: choice.message.tool_calls as DeepSeekToolCall[] }
          : {}),
        reasoning_content: choice.message.reasoning_content,
        tokens: {
          prompt: data.usage?.prompt_tokens || 150,
          completion: data.usage?.completion_tokens || 350,
          total: data.usage?.total_tokens || 500
        },
        model: data.model || model,
        isFallback: false
      };
    } catch (err: any) {
      console.error('[DeepSeek Exception]', err.message);
      return this.generateFallback(options);
    }
  }

  /**
   * Placeholder output for when no live model call happened.
   *
   * This must never contain invented metrics, named customers, testimonials, or
   * claimed results. A previous version fabricated specifics ("Marcus added $42k
   * MRR in 60 days") and a `reasoning_content` string asserting that DeepSeek-R1
   * had reasoned about it. With ENABLE_REAL_PUBLISHING=true that content could be
   * auto-posted to a customer's real accounts as their own marketing — a
   * deceptive-endorsement problem, not just a bug.
   *
   * Structure is preserved so downstream JSON.parse callers keep working, but
   * every field is unmistakably a placeholder.
   */
  private generateFallback(options: DeepSeekCompletionOptions) {
    const userPrompt = String(options.messages[options.messages.length - 1]?.content || '');
    const NOTICE =
      'PLACEHOLDER — generated without a live model call because DEEPSEEK_API_KEY is unset or the API was unreachable. Not for publication.';

    if (options.response_format?.type === 'json_object' || userPrompt.includes('JSON')) {
      return {
        content: JSON.stringify({
          _fallbackNotice: NOTICE,
          thesis: '[Placeholder thesis — configure DEEPSEEK_API_KEY to generate real content.]',
          targetAudience: '[Placeholder audience]',
          twitterThread: [
            `1/ ${NOTICE}`,
            '2/ [Placeholder post — no model output available.]'
          ],
          newsletter: {
            subjectLine: '[Placeholder subject line]',
            previewText: NOTICE,
            bodyMarkdown: `### Placeholder\n\n${NOTICE}`,
            callToAction: '[Placeholder call to action]'
          },
          webinarScript: {
            hook: '[Placeholder hook]',
            coreProblem: '[Placeholder problem statement]',
            valueProposition: '[Placeholder value proposition]',
            offerClose: '[Placeholder close]'
          }
        }),
        // No reasoning happened, so no reasoning is reported.
        tokens: { prompt: 0, completion: 0, total: 0 },
        model: 'fallback:none',
        isFallback: true
      };
    }

    return {
      content:
        'I can’t generate a full response right now — the language model isn’t configured on this server. Set DEEPSEEK_API_KEY to enable live replies.',
      tokens: { prompt: 0, completion: 0, total: 0 },
      model: 'fallback:none',
      isFallback: true
    };
  }
}

export const deepseekService = new DeepSeekService();
