/**
 * HTML escaping for values interpolated into compiled markup.
 *
 * Anything reaching these helpers may be attacker-controlled: Instatic node
 * props arrive from POST /api/instatic/patch-node, and page metadata from
 * POST /api/instatic/generate. The compiled output is served as text/html.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/** Escapes text content and quoted attribute values. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);
}

/**
 * Escapes a URL for an href/src attribute, rejecting script-bearing schemes.
 * Returns '' for anything that isn't http(s), mailto, tel, or root-relative,
 * so a rejected URL renders as an inert attribute rather than an active one.
 */
export function escapeUrl(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  // Drop everything outside printable ASCII before scheme-matching. Removes the
  // embedded whitespace/control chars that keep "java\tscript:" live in some parsers.
  const normalized = raw.replace(/[^!-~]/g, '').toLowerCase();
  const isSafe =
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('mailto:') ||
    normalized.startsWith('tel:') ||
    normalized.startsWith('/') ||
    normalized.startsWith('#');
  if (!isSafe) return '';
  return escapeHtml(raw);
}

/** Escapes a value for a CSS declaration, dropping delimiters that break out of the rule. */
export function escapeCssValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[<>"';{}()\\]/g, '');
}
