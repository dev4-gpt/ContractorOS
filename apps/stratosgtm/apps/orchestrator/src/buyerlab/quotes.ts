const MARKS: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u00A0': ' '
};

/** Collapse whitespace and unify typographic quotes and dashes. Case is preserved. */
export function normalizeText(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201C\u201D\u2013\u2014\u00A0]/g, (c) => MARKS[c])
    .replace(/\s+/g, ' ')
    .trim();
}

/** A quote shorter than this proves nothing ("the", "our"). */
export const MIN_QUOTE_CHARS = 12;

/** A quote must contain at least this many alphanumeric characters to be meaningful (not just dividers or punctuation). */
export const MIN_QUOTE_ALNUM_CHARS = 6;

/** True only when `quote` appears verbatim in `sourceText` (after normalisation). A paraphrase fails. */
export function verifyQuote(quote: string, sourceText: string): boolean {
  const q = normalizeText(quote);
  if (q.length < MIN_QUOTE_CHARS) return false;
  // Count alphanumeric characters (Unicode-aware)
  const alnumCount = (q.match(/[\p{L}\p{N}]/gu) || []).length;
  if (alnumCount < MIN_QUOTE_ALNUM_CHARS) return false;
  return normalizeText(sourceText).includes(q);
}
