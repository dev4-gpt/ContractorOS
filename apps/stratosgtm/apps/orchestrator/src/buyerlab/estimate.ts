import { MAX_PROMPT_SOURCE_CHARS, selectSourcesFor } from './prompts';
import type { Persona, Source } from './types';

export interface RunEstimate {
  calls: number;
  approxInputTokens: number;
  approxOutputTokens: number;
  usdUpperBound: number;
  note: string;
}

const OVERHEAD_TOKENS = 1200; // persona, rules and schema around the sources
const OUTPUT_TOKENS_PER_CALL = 2500; // max_tokens cap for a reaction call; measured mean was ~1,641 (13,128 output tokens over 8 calls in Veloce prototype)
const USD_PER_M_INPUT = 0.3; // deepseek-flash upper list price
const USD_PER_M_OUTPUT = 1.2;

/** Shown before a run starts. One call per persona; each persona is billed for what it may see. */
export function estimateRun(sources: Source[], personas: Persona[]): RunEstimate {
  let input = 0;
  for (const p of personas) {
    const chars = Math.min(MAX_PROMPT_SOURCE_CHARS, selectSourcesFor(sources, p.surfaces).reduce((n, s) => n + s.text.length, 0));
    input += Math.ceil(chars / 4) + OVERHEAD_TOKENS;
  }
  const output = personas.length * OUTPUT_TOKENS_PER_CALL;
  return {
    calls: personas.length,
    approxInputTokens: input,
    approxOutputTokens: output,
    usdUpperBound: (input * USD_PER_M_INPUT + output * USD_PER_M_OUTPUT) / 1e6,
    note: 'Upper bound at deepseek-flash list prices for the buyer reactions (one model call per buyer, at most 2,500 output tokens each). Inferring the panel is a separate call. Billed to your own key unless the owner granted you the server keys.'
  };
}
