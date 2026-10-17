const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
  rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D', copy: '\u00A9', middot: '\u00B7', bull: '\u2022'
};

const REPLACEMENT_CHAR = '\uFFFD';

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        const code = parseInt(h, 16);
        if (code <= 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) return REPLACEMENT_CHAR;
        return String.fromCodePoint(code);
      } catch {
        return REPLACEMENT_CHAR;
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        const code = parseInt(d, 10);
        if (code <= 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) return REPLACEMENT_CHAR;
        return String.fromCodePoint(code);
      } catch {
        return REPLACEMENT_CHAR;
      }
    })
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

export interface ExtractedPage {
  title: string;
  headings: string[];
  text: string;
  links: string[];
}

const MAX_HTML_CHARS = 1_000_000;
const MAX_LINKS = 500;
const MAX_HEADINGS = 100;
/** A title or heading longer than this is not a title or heading; only its first characters are kept. */
const MAX_CAPTURE_CHARS = 300;
/** Attribute scanning for href never looks past this many characters of one tag. */
const MAX_ATTR_SCAN_CHARS = 5000;

/** Content of these elements is not visible page text. script and style are additionally raw text (no markup inside). */
const SKIP_ELEMENTS = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'head']);
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr', 'table', 'blockquote', 'pre', 'form', 'fieldset',
  'figure', 'figcaption', 'dl', 'dt', 'dd', 'hr'
]);
const TAG_NAME = /^(\/?)([a-z][a-z0-9]*)/i;
const ANCHOR = /^a\s/i;
const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const RAW_CLOSE: Record<string, RegExp> = { script: /<\/script\b/gi, style: /<\/style\b/gi };

const append = (buf: string, seg: string): string =>
  buf.length >= MAX_CAPTURE_CHARS ? buf : buf + seg.slice(0, MAX_CAPTURE_CHARS - buf.length);
const clean = (raw: string): string => decodeEntities(raw).replace(/\s+/g, ' ').trim();

/**
 * Dependency-free extraction of visible text, headings and links. Raw text only, never a summary.
 *
 * One left-to-right pass: every position is examined a constant number of times, and nothing scans ahead for a
 * matching close tag except the search for the end of a script or style element (which either succeeds and moves
 * past it, or fails once and ends extraction). Titles and headings are captured with state flags while the pass
 * goes by, so a document of unclosed <h1> or <title> tags costs the same as any other document.
 *
 * Deliberate differences from the original regex version, all on malformed input only: an unterminated tag,
 * comment, script or style drops the rest of the document instead of leaking it as text; a new open heading
 * restarts an unfinished one; titles and headings are capped at 300 characters.
 */
export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const s = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
  const n = s.length;

  const textParts: string[] = [];
  const headings: string[] = [];
  const links = new Set<string>();
  let title = '';
  let titleState: 0 | 1 | 2 = 0; // 0 not seen, 1 capturing the first title, 2 done
  let titleBuf = '';
  let headingLevel = ''; // '' when no heading is being captured
  let headingBuf = '';
  let skipping: string | null = null;

  let i = 0;
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt !== i) {
      const seg = s.slice(i, lt === -1 ? n : lt);
      if (titleState === 1) titleBuf = append(titleBuf, seg);
      if (skipping === null) {
        textParts.push(seg);
        if (headingLevel) headingBuf = append(headingBuf, seg);
      }
    }
    if (lt === -1) break;

    if (s.startsWith('<!--', lt)) {
      const close = s.indexOf('-->', lt + 4);
      if (close === -1) break;
      i = close + 3;
      continue;
    }

    const gt = s.indexOf('>', lt + 1);
    if (gt === -1) break; // unterminated tag: drop the rest
    const content = s.slice(lt + 1, gt);
    i = gt + 1;

    const m = TAG_NAME.exec(content);
    if (!m) continue; // <!doctype>, <?xml?>, stray "<"
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();

    if (!closing && (name === 'script' || name === 'style')) {
      const re = RAW_CLOSE[name];
      re.lastIndex = i;
      const cm = re.exec(s);
      if (!cm) break; // unclosed script or style: drop the rest
      const cgt = s.indexOf('>', cm.index);
      if (cgt === -1) break;
      i = cgt + 1;
      continue;
    }

    if (name === 'title') {
      if (!closing) {
        if (titleState !== 2) {
          titleState = 1;
          titleBuf = '';
        }
      } else if (titleState === 1) {
        title = clean(titleBuf);
        titleState = 2;
      }
      continue;
    }

    if (!closing && links.size < MAX_LINKS && ANCHOR.test(content)) {
      const hm = HREF.exec(content.length > MAX_ATTR_SCAN_CHARS ? content.slice(0, MAX_ATTR_SCAN_CHARS) : content);
      if (hm) {
        try {
          const u = new URL(decodeEntities(hm[1] ?? hm[2] ?? ''), baseUrl);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            u.hash = '';
            links.add(u.href);
          }
        } catch {
          /* ignore malformed href */
        }
      }
    }

    if (skipping !== null) {
      if (closing && name === skipping) skipping = null;
      else if (skipping === 'head' && !closing && name === 'body') skipping = null; // a head that was never closed
      continue;
    }
    if (!closing && SKIP_ELEMENTS.has(name)) {
      if (!content.endsWith('/')) skipping = name; // <svg/> holds nothing
      continue;
    }

    if (name.length === 2 && name[0] === 'h' && name[1] >= '1' && name[1] <= '3') {
      const level = name[1];
      if (!closing) {
        if (headings.length < MAX_HEADINGS) {
          headingLevel = level;
          headingBuf = '';
        }
      } else if (headingLevel === level) {
        const text = clean(headingBuf);
        if (text && headings.length < MAX_HEADINGS) headings.push(text);
        headingLevel = '';
        headingBuf = '';
      }
    }
    if (BLOCK_TAGS.has(name)) textParts.push('\n');
  }

  const text = decodeEntities(textParts.join(''))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  return { title, headings, text, links: Array.from(links) };
}
