import * as cheerio from "cheerio";
import { htmlToText } from "./text.js";

export type CheckStatus = "pass" | "warn" | "fail";

export interface AuditCheck {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
  value?: string;
}

export interface PageAudit {
  url: string;
  title: string;
  description: string;
  canonical: string;
  robotsMeta: string;
  lang: string;
  openGraph: { title: string; description: string; image: string };
  twitter: { card: string; title: string; description: string; image: string };
  headings: { h1: string[]; h2: string[]; otherCount: number };
  jsonLdTypes: string[];
  https: boolean;
  hasViewport: boolean;
  content: { wordCount: number; images: number; imagesMissingAlt: number; internalLinks: number; externalLinks: number };
  checks: AuditCheck[];
  /** 0-100, from MetaScope's weights: title 20, description 20, social image 15, Twitter card 10, canonical 10, schema 10, https 5, viewport 5, heading structure 5. */
  score: number;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

function lengthStatus(length: number, min: number, max: number): CheckStatus {
  return length >= min && length <= max ? "pass" : length > 0 ? "warn" : "fail";
}

function collectTypes(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => collectTypes(child, into));
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    for (const t of Array.isArray(type) ? type : type ? [type] : []) if (typeof t === "string") into.add(t);
    if (record["@graph"]) collectTypes(record["@graph"], into);
  }
}

/**
 * Audits one HTML page for search and sharing basics. Everything reported is measured from the HTML given;
 * page speed and robots.txt are not checked here, so they are not reported.
 */
export function auditPage(html: string, url: string): PageAudit {
  const $ = cheerio.load(html);
  const pageUrl = new URL(url);
  const meta = (selector: string) => clean($(selector).first().attr("content") ?? "");

  const title = clean($("title").first().text() || meta('meta[property="og:title"]'));
  const description = meta('meta[name="description"]');
  const canonical = clean($('link[rel="canonical"]').first().attr("href") ?? "");
  const openGraph = { title: meta('meta[property="og:title"]'), description: meta('meta[property="og:description"]'), image: meta('meta[property="og:image"]') };
  const twitter = {
    card: meta('meta[name="twitter:card"]'), title: meta('meta[name="twitter:title"]'),
    description: meta('meta[name="twitter:description"]'), image: meta('meta[name="twitter:image"]'),
  };

  // Put a space between nested elements so animated or styled words do not run together.
  const spaced = (el: Parameters<typeof $>[0]) => {
    const copy = $(el).clone();
    copy.find("*").after(" ");
    return clean(copy.text());
  };
  const headingTexts = (selector: string) => $(selector).map((_, el) => spaced(el)).get().filter(Boolean);
  const h1 = headingTexts("h1");
  const h2 = headingTexts("h2");
  const otherCount = $("h3, h4, h5, h6").length;

  const types = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectTypes(JSON.parse($(el).text()), types);
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  const hasSchema = $('script[type="application/ld+json"]').length > 0;

  const images = $("img");
  const imagesMissingAlt = images.filter((_, el) => $(el).attr("alt") === undefined).length;
  const host = pageUrl.hostname.replace(/^www\./, "");
  let internalLinks = 0;
  let externalLinks = 0;
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    try {
      const target = new URL(href, pageUrl);
      if (target.protocol !== "http:" && target.protocol !== "https:") return;
      if (target.hostname.replace(/^www\./, "") === host) internalLinks += 1;
      else externalLinks += 1;
    } catch {
      /* skip unparseable links */
    }
  });

  const text = htmlToText(html).text;
  const wordCount = text ? text.split(/\s+/).length : 0;
  const https = pageUrl.protocol === "https:";
  const hasViewport = $('meta[name="viewport"]').length > 0;
  const lang = clean($("html").attr("lang") ?? "");
  const headingStructure = h1.length === 1 && h2.length + otherCount > 0;

  const titleStatus = lengthStatus(title.length, 30, 60);
  const descriptionStatus = lengthStatus(description.length, 120, 160);
  const checks: AuditCheck[] = [
    {
      id: "title", status: titleStatus, title: "Page title", value: title,
      detail: title.length === 0 ? "No title tag found" : title.length < 30 ? "Title is short (under 30 characters)" : title.length > 60 ? "Title is long (over 60 characters)" : "Title length is good",
    },
    {
      id: "description", status: descriptionStatus, title: "Meta description", value: description,
      detail: description.length === 0 ? "No meta description found" : description.length < 120 ? "Description is short (under 120 characters)" : description.length > 160 ? "Description is long (over 160 characters)" : "Description length is good",
    },
    { id: "og_image", status: openGraph.image ? "pass" : "fail", title: "Open Graph image", value: openGraph.image, detail: openGraph.image ? "og:image found" : "No og:image tag; link previews will be plain" },
    { id: "canonical", status: canonical ? "pass" : "warn", title: "Canonical URL", value: canonical, detail: canonical ? "Canonical link found" : "No canonical link specified" },
    { id: "twitter_card", status: twitter.card ? "pass" : "fail", title: "Twitter card", value: twitter.card, detail: twitter.card ? "twitter:card found" : "No twitter:card tag" },
    { id: "schema", status: hasSchema ? "pass" : "fail", title: "Structured data", value: [...types].join(", "), detail: hasSchema ? "JSON-LD found" : "No JSON-LD structured data" },
    { id: "h1", status: h1.length === 1 ? "pass" : h1.length === 0 ? "fail" : "warn", title: "Main heading", detail: `${h1.length} h1 element(s)` },
    { id: "viewport", status: hasViewport ? "pass" : "warn", title: "Mobile viewport", detail: hasViewport ? "viewport meta tag found" : "No viewport meta tag" },
    { id: "https", status: https ? "pass" : "fail", title: "HTTPS", detail: https ? "Page is served over https" : "Page is not served over https" },
    { id: "lang", status: lang ? "pass" : "warn", title: "Page language", value: lang, detail: lang ? `lang="${lang}"` : "No lang attribute on <html>" },
  ];

  let score = 0;
  score += titleStatus === "pass" ? 20 : title ? 10 : 0;
  score += descriptionStatus === "pass" ? 20 : description ? 10 : 0;
  score += openGraph.image ? 15 : 0;
  score += twitter.card ? 10 : 0;
  score += canonical ? 10 : 0;
  score += hasSchema ? 10 : 0;
  score += https ? 5 : 0;
  score += hasViewport ? 5 : 0;
  score += headingStructure ? 5 : 0;

  return {
    url, title, description, canonical, robotsMeta: meta('meta[name="robots"]'), lang, openGraph, twitter,
    headings: { h1, h2, otherCount }, jsonLdTypes: [...types], https, hasViewport,
    content: { wordCount, images: images.length, imagesMissingAlt, internalLinks, externalLinks },
    checks, score: Math.min(score, 100),
  };
}
