export interface SlopEvaluationResult {
  scoreOutOf100: number;
  isApproved: boolean;
  detectedCliches: string[];
  suggestedFixes: { original: string; replacement: string }[];
  cleanedText: string;
}

export class AntiSlopGuardrail {
  private static readonly CLICHE_DICTIONARY: { pattern: RegExp; replacement: string; rationale: string }[] = [
    { pattern: /\bin today's fast-paced(?:, digital)? world\b/gi, replacement: 'Today', rationale: 'Trite introductory filler' },
    { pattern: /\bdelve(?:s|d|ing)? into\b/gi, replacement: 'examine', rationale: 'Overused LLM synonym for analyze' },
    { pattern: /\ba testament to\b/gi, replacement: 'proof of', rationale: 'Dramatic pseudo-formal cliché' },
    { pattern: /\bgame-changer(?:s)?\b/gi, replacement: 'major shift', rationale: 'Empty marketing hype' },
    { pattern: /\bunleash(?:ing)? your (?:true )?potential\b/gi, replacement: 'scale your business', rationale: 'Self-help fluff' },
    { pattern: /\ba tapestry of\b/gi, replacement: 'a mix of', rationale: 'Literary cliché never used in business speech' },
    { pattern: /\bbeacon of\b/gi, replacement: 'leader in', rationale: 'Overdramatic filler' },
    { pattern: /\brealm of\b/gi, replacement: 'field of', rationale: 'Stilted academic trope' },
    { pattern: /\bcrucial role\b/gi, replacement: 'direct impact', rationale: 'Passive corporate cliché' },
    { pattern: /\bunlock(?:ing)? the power of\b/gi, replacement: 'leveraging', rationale: 'Infomercial phrasing' },
    { pattern: /\brevolutioniz(?:e|ing|ed)\b/gi, replacement: 'automating', rationale: 'Vague buzzword' },
    { pattern: /\bit(?:'s| is) important to remember that\b/gi, replacement: 'Notice that', rationale: 'Condescending AI throat-clearing' },
    { pattern: /\bfoster(?:ing)? a sense of\b/gi, replacement: 'building', rationale: 'Bureaucratic filler' },
    { pattern: /\bnavigat(?:e|ing) the complexities of\b/gi, replacement: 'managing', rationale: 'Generic corporate trope' },
    { pattern: /\bat the forefront of\b/gi, replacement: 'leading', rationale: 'Inflated hype' },
    { pattern: /\bsynergy\b/gi, replacement: 'alignment', rationale: '1990s corporate buzzword' },
    { pattern: /\bholistic approach\b/gi, replacement: 'complete system', rationale: 'Overused vague claim' }
  ];

  public evaluateCopyQuality(text: string): SlopEvaluationResult {
    const detectedCliches: string[] = [];
    const suggestedFixes: { original: string; replacement: string }[] = [];
    let cleaned = text;

    for (const item of AntiSlopGuardrail.CLICHE_DICTIONARY) {
      const matches = text.match(item.pattern);
      if (matches && matches.length > 0) {
        for (const m of matches) {
          if (!detectedCliches.includes(m.toLowerCase())) {
            detectedCliches.push(m.toLowerCase());
            suggestedFixes.push({ original: m, replacement: item.replacement });
          }
        }
        cleaned = cleaned.replace(item.pattern, item.replacement);
      }
    }

    // Score deduction: 10 points per unique cliché detected
    const score = Math.max(20, 100 - detectedCliches.length * 12);
    const isApproved = score >= 85;

    return {
      scoreOutOf100: score,
      isApproved,
      detectedCliches,
      suggestedFixes,
      cleanedText: cleaned
    };
  }

  public cleanSlop(text: string): string {
    let result = text;
    for (const item of AntiSlopGuardrail.CLICHE_DICTIONARY) {
      result = result.replace(item.pattern, item.replacement);
    }
    return result;
  }
}

export const antiSlopGuardrail = new AntiSlopGuardrail();
