import * as cheerio from "cheerio";
import type { Asset, MemoryStore } from "@reforge/core";
import { auditPage, type PageAudit } from "./pageAudit.js";
import type { PoliteFetcher } from "./safeFetch.js";
import { htmlToText } from "./text.js";

export interface TeardownInput {
  url: string;
  /** Why looking at this page is fine, recorded with the result. For example "public marketing page, robots.txt respected, analysis only". */
  basis: string;
  /** True only if the content may be reused (own site, open source, or written permission). Default false: analysis only. */
  reuseAuthorized?: boolean;
  parent?: string;
}

export interface Teardown {
  asset: Asset;
  audit: PageAudit;
  ctas: string[];
  pricing: string[];
}

const CTA_WORDS = /\b(get|start|try|sign|book|buy|contact|demo|download|pricing|free|join|subscribe|request|learn|talk)\b/i;
const PRICE = /(?:\$|€|£)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:\/\s?(?:mo|month|yr|year|user|seat)|per\s+(?:month|year|user|seat)))?/gi;

function callsToAction(html: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: string[] = [];
  $("a[href], button").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (text.length >= 2 && text.length <= 30 && CTA_WORDS.test(text) && !seen.has(key)) {
      seen.add(key);
      out.push(text);
    }
  });
  return out.slice(0, 12);
}

const PLAN_WORDS = /(\/\s?(mo|month|yr|year|user|seat)|per\s+(month|year|user|seat)|\bplans?\b|billed)/i;

function pricingMentions(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(PRICE)) {
    const from = Math.max(0, (match.index ?? 0) - 40);
    const to = (match.index ?? 0) + match[0].length + 40;
    let context = text.slice(from, to).replace(/\s+/g, " ").trim();
    if (from > 0) context = context.replace(/^\S*\s/, ""); // drop a word cut in half at the start
    if (to < text.length) context = context.replace(/\s\S*$/, ""); // and at the end
    if (context && !seen.has(context)) {
      seen.add(context);
      found.push(context);
    }
  }
  // Mentions that read like real plan pricing first; the rest (quotes, testimonials) after. Order is otherwise kept.
  const plan = found.filter((c) => PLAN_WORDS.test(c));
  const other = found.filter((c) => !PLAN_WORDS.test(c));
  return [...plan, ...other].slice(0, 10);
}

/**
 * Reads one public page and writes a research note to shared memory: a search-and-sharing audit, the heading outline,
 * calls to action and verbatim pricing mentions. Only what the page itself says is recorded; nothing is inferred.
 * `basis` is required so every teardown carries the reason it was allowed.
 */
export async function teardownSite(store: MemoryStore, fetcher: PoliteFetcher, input: TeardownInput): Promise<Teardown> {
  if (!input.basis.trim()) throw new Error("basis is required: say why looking at this page is allowed");
  const page = await fetcher.fetchPage(input.url);
  if (!/html/.test(page.contentType)) throw new Error("a teardown needs an HTML page");

  const audit = auditPage(page.body, page.finalUrl);
  const text = htmlToText(page.body).text;
  const ctas = callsToAction(page.body);
  const pricing = pricingMentions(text);
  const host = new URL(page.finalUrl).hostname.replace(/^www\./, "");

  // The store adds the "# Teardown: host" title line itself, so the body starts at the source line.
  const short = (text: string) => (text.length > 140 ? `${text.slice(0, 137)}…` : text);
  const body = [
    `Source: ${page.finalUrl}`,
    `Basis: ${input.basis.trim()}`,
    `Reuse authorized: ${input.reuseAuthorized ? "yes" : "no (analysis only)"}`, "",
    `## Search and sharing audit (score ${audit.score}/100)`,
    ...audit.checks.map((c) => `- [${c.status}] ${c.title}${c.value ? `: "${c.value}"` : ""}: ${c.detail}`), "",
    "## Headings",
    ...(audit.headings.h1.length ? audit.headings.h1.map((h) => `- H1: ${short(h)}`) : ["- (no h1)"]),
    ...audit.headings.h2.slice(0, 12).map((h) => `- H2: ${short(h)}`), "",
    "## Calls to action",
    ...(ctas.length ? ctas.map((c) => `- ${c}`) : ["- (none found)"]), "",
    "## Pricing mentions (verbatim context)",
    ...(pricing.length ? pricing.map((p) => `- "${p}"`) : ["- (none found on this page)"]), "",
    "## Content",
    `- About ${audit.content.wordCount} words, ${audit.content.images} images (${audit.content.imagesMissingAlt} without an alt attribute), ${audit.content.internalLinks} internal and ${audit.content.externalLinks} external links`, "",
    "## Limits",
    "Only what this one page says. Nothing is inferred, and no other pages were read.",
  ].join("\n");

  const { asset } = await store.put({
    kind: "research",
    title: `Teardown: ${host}`,
    body,
    tool: "research",
    tags: ["teardown", host],
    source: { url: page.finalUrl, authorized: input.reuseAuthorized === true, license: input.basis.trim(), retrievedAt: new Date().toISOString() },
    ...(input.parent ? { parent: input.parent } : {}),
  });
  return { asset, audit, ctas, pricing };
}
