import type { Citation, Stage } from "./contract.js";

/**
 * Plug-in points a host implements. The factory never imports a model SDK
 * or a search client: standalone users bring their own API keys, and
 * AgenticOS supplies adapters over its Hermes agents and research tools.
 */
export interface RunnerRequest {
  stage: Stage;
  system: string;
  prompt: string;
}

export interface RunnerResult {
  text: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Cost of this call in USD, if the host knows it. Used for the budget cap. */
  usd?: number;
}

export interface AgentRunner {
  run(request: RunnerRequest): Promise<RunnerResult>;
}

/** Returns real, fetched sources only. Returning nothing is valid and is reported, never faked. */
export interface ResearchProvider {
  research(query: string): Promise<Array<Omit<Citation, "id">>>;
}
