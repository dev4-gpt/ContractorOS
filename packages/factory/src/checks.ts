import type { Citation } from "./contract.js";

/** Deterministic checks run on a draft. A check returns one finding per problem; none means it passed. */
export interface CheckContext {
  citations: readonly Citation[];
}

export interface Check {
  id: string;
  run(draft: string, ctx: CheckContext): string[];
}

/** Percentages, multipliers ("10x") and money ("$2,997", "$114k"). */
const STAT_RE = /\$\s?\d[\d,]*(?:\.\d+)?\s?[kKmMbB]?|\d+(?:\.\d+)?\s?(?:%|x\b|×)/g;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").replace(/,/g, "");
}

export function citationCheck(min = 1): Check {
  return {
    id: "citations",
    run: (_draft, ctx) =>
      ctx.citations.length >= min ? [] : [`needs at least ${min} cited source(s), found ${ctx.citations.length}`],
  };
}

/** Every figure in the draft must appear in the evidence of some citation. */
export function unsourcedStatsCheck(): Check {
  return {
    id: "unsourced-figures",
    run: (draft, ctx) => {
      const evidence = normalize(ctx.citations.map((c) => c.evidence).join(" "));
      const unsupported = new Set<string>();
      for (const match of draft.matchAll(STAT_RE)) {
        if (!evidence.includes(normalize(match[0]))) unsupported.add(match[0].trim());
      }
      return [...unsupported].map((figure) => `figure "${figure}" is not supported by any cited source`);
    },
  };
}

export function maxLineLengthCheck(max: number): Check {
  return {
    id: `max-line-${max}`,
    run: (draft) =>
      draft
        .split("\n")
        .map((line, index) => ({ length: line.length, number: index + 1 }))
        .filter((line) => line.length > max)
        .map((line) => `line ${line.number} is ${line.length} characters (limit ${max})`),
  };
}

export function forbiddenPhrasesCheck(phrases: readonly string[]): Check {
  return {
    id: "forbidden-phrases",
    run: (draft) => {
      const lower = draft.toLowerCase();
      return phrases.filter((phrase) => lower.includes(phrase.toLowerCase())).map((phrase) => `contains forbidden phrase "${phrase}"`);
    },
  };
}

export const defaultChecks: readonly Check[] = [citationCheck(1), unsourcedStatsCheck()];

export function runChecks(
  checks: readonly Check[],
  draft: string,
  ctx: CheckContext,
): { findings: string[]; passedChecks: number; totalChecks: number } {
  const findings: string[] = [];
  let passedChecks = 0;
  for (const check of checks) {
    const found = check.run(draft, ctx);
    if (found.length === 0) passedChecks += 1;
    for (const finding of found) findings.push(`[${check.id}] ${finding}`);
  }
  return { findings, passedChecks, totalChecks: checks.length };
}
