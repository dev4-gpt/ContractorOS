import * as cheerio from "cheerio";

export interface PageText {
  title?: string;
  text: string;
}

const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, div, section, article, tr, blockquote, pre, br";

function tidy(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Readable text from HTML: scripts, styles and embedded media removed, block elements kept on their own lines. */
export function htmlToText(html: string): PageText {
  const $ = cheerio.load(html);
  const title =
    ($("title").first().text() || $('meta[property="og:title"]').attr("content") || $("h1").first().text() || "")
      .replace(/\s+/g, " ")
      .trim() || undefined;
  $("script, style, noscript, svg, template, iframe").remove();
  const selector = $("main").length ? "main" : $("article").length ? "article" : "body";
  const root = $(selector).first();
  root.find(BLOCKS).each((_, element) => {
    $(element).after("\n");
  });
  return { title, text: tidy(root.text()) };
}

/** Readable text from Markdown or plain text: images, link targets, HTML tags and list markers removed. */
export function markdownToText(markdown: string): PageText {
  // A "# comment" line inside a code block is not a heading, so look for the title outside fenced code.
  const title = markdown.replace(/```[\s\S]*?```/g, "").match(/^\s{0,3}#\s+(.+)$/m)?.[1]?.replace(/\s+/g, " ").trim();
  const text = markdown
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[`*]/g, "")
    .replace(/(^|\s)_+(?=\S)/g, "$1")
    .replace(/(?<=\S)_+(?=\s|$)/g, "")
    .replace(/[>|]/g, " ");
  return { title, text: tidy(text) };
}

export function pageText(body: string, contentType: string): PageText {
  return /html/.test(contentType) ? htmlToText(body) : markdownToText(body);
}

/** Groups lines into passages of at most `maxChars`; a longer line is split at sentence ends, then hard-cut. */
export function splitPassages(text: string, maxChars = 500): string[] {
  const units: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (line.length <= maxChars) {
      units.push(line);
      continue;
    }
    let current = "";
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      if ((current + " " + sentence).trim().length > maxChars && current) {
        units.push(current);
        current = sentence;
      } else {
        current = (current + " " + sentence).trim();
      }
      while (current.length > maxChars) {
        units.push(current.slice(0, maxChars));
        current = current.slice(maxChars);
      }
    }
    if (current) units.push(current);
  }
  const passages: string[] = [];
  let buffer = "";
  for (const unit of units) {
    if (buffer && buffer.length + 1 + unit.length > maxChars) {
      passages.push(buffer);
      buffer = unit;
    } else {
      buffer = buffer ? `${buffer} ${unit}` : unit;
    }
  }
  if (buffer) passages.push(buffer);
  return passages;
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "what", "who", "how", "are", "use", "using", "only", "from",
  "about", "write", "short", "article", "explain", "explaining", "into", "your", "their", "provided", "source",
]);

export function queryTokens(query: string): string[] {
  const tokens = query.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  return [...new Set(tokens)].filter((token) => !STOP.has(token));
}

/**
 * Evidence for a question: the page's opening passage (what it says about itself) plus the passages that match the
 * question best, in page order, within `maxChars`. With no matches it falls back to the opening of the page.
 */
export function pickEvidence(text: string, query: string, opts: { maxChars?: number; passageChars?: number } = {}): string {
  const maxChars = opts.maxChars ?? 3000;
  const passages = splitPassages(text, Math.min(opts.passageChars ?? 500, maxChars));
  if (passages.length === 0) return "";
  const tokens = queryTokens(query);
  const chosen = new Set<number>();
  let used = 0;
  const take = (index: number): void => {
    if (chosen.has(index)) return;
    const length = passages[index]!.length + 3;
    if (used + length > maxChars) return;
    chosen.add(index);
    used += length;
  };
  take(0);
  const ranked = passages
    .map((passage, index) => ({ index, hits: tokens.filter((token) => passage.toLowerCase().includes(token)).length }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.index - b.index);
  for (const entry of ranked) take(entry.index);
  if (chosen.size <= 1) for (let index = 1; index < passages.length; index += 1) take(index);
  return [...chosen].sort((a, b) => a - b).map((index) => passages[index]).join(" … ");
}
