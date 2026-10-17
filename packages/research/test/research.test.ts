import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RunLog, UnsafeHostError, VaultMemoryStore, runLogDir } from "@reforge/core";
import { ContentFactory, createPlan, type AgentRunner, type RunnerRequest } from "@reforge/factory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FetchBlockedError,
  PoliteFetcher,
  WebResearch,
  auditPage,
  htmlToText,
  markdownToText,
  pickEvidence,
  queryTokens,
  splitPassages,
  teardownSite,
} from "../src/index.js";

type Route = { status?: number; type?: string; body?: string; location?: string };
interface Seen { url: string; ua: string }

const PUBLIC = async () => [{ address: "93.184.216.34" }];
const HTML = "text/html; charset=utf-8";

function makeFetch(routes: Record<string, Route>, seen: Seen[] = []): typeof fetch {
  return (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input);
    seen.push({ url, ua: init?.headers?.["User-Agent"] ?? "" });
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    const headers: Record<string, string> = {};
    if (route.type) headers["content-type"] = route.type;
    if (route.location) headers.location = route.location;
    return new Response(route.body ?? "", { status: route.status ?? 200, headers });
  }) as unknown as typeof fetch;
}

function fetcher(routes: Record<string, Route>, seen: Seen[] = [], extra: Record<string, unknown> = {}) {
  return new PoliteFetcher({ fetchImpl: makeFetch(routes, seen), lookup: PUBLIC, minDelayMs: 0, sleep: async () => undefined, ...extra });
}

const ROBOTS_OPEN = { type: "text/plain", body: "User-agent: *\nAllow: /\n" };

describe("PoliteFetcher", () => {
  it("reads robots.txt first, then the page, and identifies itself", async () => {
    const seen: Seen[] = [];
    const f = fetcher({
      "https://example.com/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /private\n" },
      "https://example.com/page": { type: HTML, body: "<p>hello</p>" },
    }, seen);
    const page = await f.fetchPage("https://example.com/page");
    expect(page).toMatchObject({ status: 200, finalUrl: "https://example.com/page", body: "<p>hello</p>", truncated: false });
    expect(seen.map((s) => s.url)).toEqual(["https://example.com/robots.txt", "https://example.com/page"]);
    expect(seen.every((s) => s.ua.startsWith("reforge-research/"))).toBe(true);
  });

  it("does not request a page that robots.txt disallows, and treats an unreadable robots.txt as no", async () => {
    const seen: Seen[] = [];
    const blocked = fetcher({ "https://example.com/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /private\n" } }, seen);
    await expect(blocked.fetchPage("https://example.com/private/x")).rejects.toThrow(/robots\.txt asks/);
    expect(seen.map((s) => s.url)).toEqual(["https://example.com/robots.txt"]);

    const broken = fetcher({ "https://example.com/robots.txt": { status: 500 }, "https://example.com/page": { type: HTML, body: "x" } });
    await expect(broken.fetchPage("https://example.com/page")).rejects.toThrow(FetchBlockedError);
    const missing = fetcher({ "https://example.com/page": { type: HTML, body: "x" } });
    await expect(missing.fetchPage("https://example.com/page")).resolves.toMatchObject({ status: 200 });
  });

  it("refuses non-public hosts, odd schemes, ports and embedded credentials before any request", async () => {
    const seen: Seen[] = [];
    const privateHost = new PoliteFetcher({ fetchImpl: makeFetch({}, seen), lookup: async () => [{ address: "10.0.0.5" }], sleep: async () => undefined });
    await expect(privateHost.fetchPage("https://intranet.example/")).rejects.toThrow(UnsafeHostError);
    const f = fetcher({}, seen);
    await expect(f.fetchPage("ftp://example.com/x")).rejects.toThrow(/http and https/);
    await expect(f.fetchPage("https://example.com:8443/")).rejects.toThrow(/standard web ports/);
    await expect(f.fetchPage("https://user:pw@example.com/")).rejects.toThrow(/credentials/);
    await expect(f.fetchPage("not a url")).rejects.toThrow(/usable web address/);
    expect(seen).toEqual([]);
  });

  it("follows redirects safely: re-checks the address and the new site's robots.txt before requesting it", async () => {
    const seen: Seen[] = [];
    const lookup = async (host: string) => [{ address: host === "internal.example" ? "10.0.0.1" : "93.184.216.34" }];

    const toPrivate = new PoliteFetcher({
      fetchImpl: makeFetch({ "https://example.com/robots.txt": ROBOTS_OPEN, "https://example.com/old": { status: 301, location: "https://internal.example/x" } }, seen),
      lookup, minDelayMs: 0, sleep: async () => undefined,
    });
    await expect(toPrivate.fetchPage("https://example.com/old")).rejects.toThrow(UnsafeHostError);

    seen.length = 0;
    const toForbidden = new PoliteFetcher({
      fetchImpl: makeFetch({
        "https://example.com/robots.txt": ROBOTS_OPEN,
        "https://example.com/old": { status: 302, location: "https://other.example/new" },
        "https://other.example/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /\n" },
        "https://other.example/new": { type: HTML, body: "secret" },
      }, seen),
      lookup, minDelayMs: 0, sleep: async () => undefined,
    });
    await expect(toForbidden.fetchPage("https://example.com/old")).rejects.toThrow(/robots\.txt asks/);
    expect(seen.map((s) => s.url)).not.toContain("https://other.example/new");

    const ok = fetcher({
      "https://example.com/robots.txt": ROBOTS_OPEN,
      "https://example.com/old": { status: 301, location: "/new" },
      "https://example.com/new": { type: HTML, body: "moved" },
    });
    expect(await ok.fetchPage("https://example.com/old")).toMatchObject({ finalUrl: "https://example.com/new", body: "moved" });

    const loop = fetcher({ "https://example.com/robots.txt": ROBOTS_OPEN, "https://example.com/a": { status: 301, location: "/a" } });
    await expect(loop.fetchPage("https://example.com/a")).rejects.toThrow(/too many redirects/);
  });

  it("rejects error pages and non-text content, and caps the body size", async () => {
    const f = fetcher({
      "https://example.com/robots.txt": ROBOTS_OPEN,
      "https://example.com/gone": { status: 404, type: HTML, body: "nope" },
      "https://example.com/pic": { type: "image/png", body: "binary" },
      "https://example.com/big": { type: "text/plain", body: "a".repeat(1000) },
    }, [], { maxBytes: 100 });
    await expect(f.fetchPage("https://example.com/gone")).rejects.toThrow(/answered 404/);
    await expect(f.fetchPage("https://example.com/pic")).rejects.toThrow(/unsupported content type/);
    const big = await f.fetchPage("https://example.com/big");
    expect(big.body).toHaveLength(100);
    expect(big.truncated).toBe(true);
  });

  it("waits between requests to the same host, and longer when robots.txt asks for a crawl delay", async () => {
    const sleeps: number[] = [];
    const base = { sleep: async (ms: number) => { sleeps.push(ms); }, now: () => 1000 };
    const plain = fetcher({ "https://example.com/robots.txt": ROBOTS_OPEN, "https://example.com/p": { type: HTML, body: "x" } }, [], { ...base, minDelayMs: 500 });
    await plain.fetchPage("https://example.com/p");
    expect(sleeps).toEqual([500]);

    sleeps.length = 0;
    const slow = fetcher({
      "https://example.com/robots.txt": { type: "text/plain", body: "User-agent: *\nCrawl-delay: 3\n" },
      "https://example.com/p": { type: HTML, body: "x" },
    }, [], { ...base, minDelayMs: 0 });
    await slow.fetchPage("https://example.com/p");
    expect(sleeps).toEqual([3000]);
  });
});

describe("text tools", () => {
  it("extracts readable text from HTML without scripts or styles, keeping blocks apart", () => {
    const { title, text } = htmlToText(
      "<html><head><title> My  Page </title><style>.a{}</style></head><body><script>var hidden=1</script><nav>skip?</nav><main><h1>Heading</h1><p>First para.</p><p>Second para.</p></main></body></html>",
    );
    expect(title).toBe("My Page");
    expect(text).toBe("Heading\nFirst para.\nSecond para.");
    expect(text).not.toContain("hidden");
  });

  it("extracts readable text from Markdown, dropping images, link targets and badges", () => {
    const { title, text } = markdownToText("# Project\n\n![badge](https://x/y.svg)\n\nSee [the docs](https://docs.example/a) for `code`.\n\n- item one\n- item two");
    expect(title).toBe("Project");
    expect(text).toContain("See the docs for code.");
    expect(text).toContain("item one");
    expect(text).not.toContain("https://");
  });

  it("takes a Markdown title from a real heading, not from a comment inside a code block", () => {
    const md = "Intro text.\n\n```bash\n# macOS\nbrew install thing\n```\n\n# Real Title\n\nBody.";
    expect(markdownToText(md).title).toBe("Real Title");
    expect(markdownToText("```\n# only in code\n```\nno heading").title).toBeUndefined();
    expect(markdownToText(md).text).toContain("brew install thing");
  });

  it("splits text into bounded passages, including very long lines", () => {
    const long = "Sentence number one is here. ".repeat(60).trim();
    const passages = splitPassages(`short line\n${long}`, 200);
    expect(passages.length).toBeGreaterThan(3);
    expect(passages.every((p) => p.length <= 200)).toBe(true);
    expect(passages.join(" ")).toContain("short line");
  });

  it("picks the opening plus the passages that match the question, within the size limit", () => {
    const filler = Array.from({ length: 40 }, (_, i) => `Filler paragraph number ${i} about nothing in particular at all.`);
    filler.splice(30, 0, "Pro costs $29 per month for teams who want pricing clarity.");
    const text = ["Acme builds widgets for everyone.", ...filler].join("\n");
    const evidence = pickEvidence(text, "what is the pricing", { maxChars: 600, passageChars: 150 });
    expect(evidence).toContain("Acme builds widgets");
    expect(evidence).toContain("$29 per month");
    expect(evidence.length).toBeLessThanOrEqual(700);
    expect(pickEvidence("Only text here.", "unrelated question", {})).toBe("Only text here.");
    expect(pickEvidence("", "anything")).toBe("");
    expect(queryTokens("Write a short article explaining the pricing and plans")).toEqual(["pricing", "plans"]);
  });
});

describe("WebResearch", () => {
  const now = () => new Date("2026-10-17T10:00:00.000Z");
  const routes: Record<string, Route> = {
    "https://example.com/robots.txt": ROBOTS_OPEN,
    "https://example.com/about": { type: HTML, body: "<html><head><title>About Acme</title></head><body><h1>About Acme</h1><p>Acme makes widgets. Pricing starts at $29 per month.</p></body></html>" },
    "https://example.com/notes.md": { type: "text/markdown", body: "# Release notes\n\nVersion 2 ships widgets faster." },
    "https://example.com/blank": { type: HTML, body: "<html><body><script>1</script></body></html>" },
  };

  it("turns pages into citations with real evidence, and reports pages it could not use", async () => {
    const errors: Array<[string, string]> = [];
    const research = new WebResearch({
      urls: ["https://example.com/about", "https://example.com/missing", "https://example.com/blank", "https://example.com/notes.md"],
      fetcher: fetcher(routes), now, onError: (url, error) => errors.push([url, error.message]),
    });
    const citations = await research.research("what does Acme charge");
    expect(citations.map((c) => [c.url, c.title])).toEqual([
      ["https://example.com/about", "About Acme"],
      ["https://example.com/notes.md", "Release notes"],
    ]);
    expect(citations[0]!.evidence).toContain("$29 per month");
    expect(citations[0]!.retrievedAt).toBe("2026-10-17T10:00:00.000Z");
    expect(errors.map(([url]) => url)).toEqual(["https://example.com/missing", "https://example.com/blank"]);
    expect(errors[0]![1]).toMatch(/answered 404/);
    expect(errors[1]![1]).toMatch(/no readable text/);
  });

  it("accepts a function that finds the pages, limits sources, and returns nothing rather than inventing", async () => {
    let asked = "";
    const research = new WebResearch({
      urls: async (query) => { asked = query; return ["https://example.com/about", "https://example.com/notes.md"]; },
      fetcher: fetcher(routes), maxSources: 1, now,
    });
    expect(await research.research("pricing question")).toHaveLength(1);
    expect(asked).toBe("pricing question");
    const none = new WebResearch({ urls: ["https://example.com/missing"], fetcher: fetcher(routes), now });
    expect(await none.research("anything")).toEqual([]);
  });
});

describe("auditPage", () => {
  const description = "A framework that turns HTML, CSS and animation into deterministic video files, built so that AI coding agents can use it.";
  const page = `<!doctype html><html lang="en"><head>
<title>HyperFrames: write HTML, render video for agents</title>
<meta name="description" content="${description}">
<meta property="og:image" content="https://example.com/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="https://example.com/">
<meta name="viewport" content="width=device-width">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>
<script>var secretWords = "one two three four five";</script><style>.x{color:red}</style>
</head><body><h1>Main</h1><h2>Sub</h2><p>Hello world words here.</p>
<img src="a.png" alt="A"><img src="b.png"><img src="c.png" alt="">
<a href="/about">About</a> <a href="https://example.com/x">X</a> <a href="https://other.example/y">Y</a> <a href="#top">Top</a> <a href="mailto:a@b.c">mail</a>
</body></html>`;

  it("measures a complete page and scores it with MetaScope's weights", () => {
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
    const audit = auditPage(page, "https://example.com/");
    expect(audit.score).toBe(100);
    expect(audit.checks.every((c) => c.status === "pass")).toBe(true);
    expect(audit.headings).toEqual({ h1: ["Main"], h2: ["Sub"], otherCount: 0 });
    expect(audit.jsonLdTypes).toEqual(expect.arrayContaining(["Organization", "WebSite", "Thing"]));
    expect(audit.content).toEqual({ wordCount: 11, images: 3, imagesMissingAlt: 1, internalLinks: 2, externalLinks: 1 });
    expect(audit.lang).toBe("en");
  });

  it("scores a bare page low and reports only what it measured", () => {
    const audit = auditPage("<html><body><p>hi</p></body></html>", "http://example.com/");
    expect(audit.score).toBe(0);
    const status = (id: string) => audit.checks.find((c) => c.id === id)?.status;
    expect(status("title")).toBe("fail");
    expect(status("h1")).toBe("fail");
    expect(status("https")).toBe("fail");
    expect(status("lang")).toBe("warn");
    expect(audit).not.toHaveProperty("pageSpeed");
    expect(audit).not.toHaveProperty("technicalSeo");
  });

  it("gives partial credit for a title or description that is present but the wrong length", () => {
    const audit = auditPage('<html><head><title>Hi</title><meta name="description" content="short"></head><body></body></html>', "https://example.com/");
    expect(audit.checks.find((c) => c.id === "title")?.status).toBe("warn");
    expect(audit.checks.find((c) => c.id === "description")?.status).toBe("warn");
    expect(audit.score).toBe(10 + 10 + 5);
  });
});

describe("teardownSite", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "reforge-research-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const html = `<!doctype html><html lang="en"><head><title>Acme: widgets for teams that ship</title></head><body>
<h1>Widgets for teams</h1><h2>Why Acme</h2><h2>Pricing</h2>
<a href="/start">Get started</a> <button>Book a demo</button> <a href="/docs">Docs</a>
<p>Pro costs $29 per month for small teams.</p><p>Enterprise is $1,200/mo with support.</p></body></html>`;
  const routes: Record<string, Route> = {
    "https://www.acme.example/robots.txt": ROBOTS_OPEN,
    "https://www.acme.example/": { type: HTML, body: html },
    "https://www.acme.example/notes.md": { type: "text/markdown", body: "# notes" },
  };

  it("writes a research note with the audit, calls to action and verbatim pricing, and records why it was allowed", async () => {
    const store = new VaultMemoryStore(path.join(dir, "vault"));
    const basis = "public marketing page, robots.txt respected, analysis only";
    const result = await teardownSite(store, fetcher(routes), { url: "https://www.acme.example/", basis });

    expect(result.asset).toMatchObject({ kind: "research", title: "Teardown: acme.example", tool: "research" });
    expect(result.asset.source).toMatchObject({ url: "https://www.acme.example/", authorized: false, license: basis });
    expect(result.ctas).toEqual(["Get started", "Book a demo"]);
    expect(result.pricing.join(" | ")).toContain("$29 per month");
    expect(result.pricing.join(" | ")).toContain("$1,200/mo");
    const note = (await store.read(result.asset.id))!.body;
    expect(note).toContain("## Calls to action");
    expect(note).toContain("- Book a demo");
    expect(note).toContain("Reuse authorized: no (analysis only)");
    expect(note).toContain("- H2: Pricing");
    expect(note).toContain("Nothing is inferred");

    const again = await teardownSite(store, fetcher(routes), { url: "https://www.acme.example/", basis });
    expect(again.asset.id).toBe(result.asset.id);
  });

  it("keeps one title line, spaces out nested heading words, trims long headings and puts plan pricing first", async () => {
    const store = new VaultMemoryStore(path.join(dir, "vault"));
    const noisy = `<!doctype html><html lang="en"><head><title>Busy page for real teams today</title></head><body>
<h1>Run on autopilot <span>ChatGPT</span><span>Claude</span><span>Cursor</span></h1><h2>${"Very long heading ".repeat(20)}</h2>
<p>Everyone is quote-tweeting the $1 AI video part of this post and it is quite something to see.</p>
<p>Plans start at $29/month for teams that want more channels and a calendar.</p></body></html>`;
    const routes2: Record<string, Route> = { "https://noisy.example/robots.txt": ROBOTS_OPEN, "https://noisy.example/": { type: HTML, body: noisy } };
    const result = await teardownSite(store, fetcher(routes2), { url: "https://noisy.example/", basis: "test page" });

    expect(result.audit.headings.h1).toEqual(["Run on autopilot ChatGPT Claude Cursor"]);
    const note = (await store.read(result.asset.id))!.body;
    expect(note.match(/# Teardown: noisy\.example/g)).toHaveLength(1);
    const h2Line = note.split("\n").find((line) => line.startsWith("- H2: "))!;
    expect(h2Line.length).toBeLessThanOrEqual(146);
    expect(h2Line.endsWith("…")).toBe(true);
    expect(result.pricing[0]).toContain("$29/month");
    expect(result.pricing[1]).toContain("$1 AI video");
    for (const context of result.pricing) expect(context).toMatch(/^\S/);
  });

  it("marks content reusable only when told, links to a parent, and refuses without a basis, robots permission or HTML", async () => {
    const store = new VaultMemoryStore(path.join(dir, "vault"));
    const parent = (await store.put({ kind: "brief", title: "Competitor scan", body: "Look at Acme", tool: "user" })).asset;
    const reuse = await teardownSite(store, fetcher(routes), { url: "https://www.acme.example/", basis: "own site", reuseAuthorized: true, parent: parent.id });
    expect(reuse.asset.source?.authorized).toBe(true);
    expect((await store.lineage(reuse.asset.id)).map((a) => a.id)).toEqual([parent.id, reuse.asset.id]);

    const seen: Seen[] = [];
    await expect(teardownSite(store, fetcher(routes, seen), { url: "https://www.acme.example/", basis: "  " })).rejects.toThrow(/basis is required/);
    expect(seen).toEqual([]);
    await expect(teardownSite(store, fetcher(routes), { url: "https://www.acme.example/notes.md", basis: "x" })).rejects.toThrow(/needs an HTML page/);

    const closed = fetcher({ "https://www.acme.example/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /\n" } });
    await expect(teardownSite(store, closed, { url: "https://www.acme.example/", basis: "x" })).rejects.toThrow(/robots\.txt asks/);
    expect((await store.search("Teardown")).map((a) => a.id)).toEqual([reuse.asset.id]);
  });
});

describe("WebResearch with the content factory", () => {
  it("gives the factory real, cited evidence that its own checks can verify", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "reforge-research-"));
    try {
      const vault = path.join(dir, "vault");
      const requests: RunnerRequest[] = [];
      const answers = ["Outline", "Acme Pro costs $29 per month [cite-1]."];
      const runner: AgentRunner = { run: async (request) => (requests.push(request), { text: answers.shift() ?? "" }) };
      const research = new WebResearch({
        urls: ["https://example.com/about"],
        fetcher: fetcher({
          "https://example.com/robots.txt": ROBOTS_OPEN,
          "https://example.com/about": { type: HTML, body: "<html><body><h1>Acme</h1><p>Acme Pro costs $29 per month.</p></body></html>" },
        }),
      });
      const factory = new ContentFactory({ runner, research, store: new VaultMemoryStore(vault), runLog: new RunLog(runLogDir(vault)) });
      const run = await factory.run(createPlan({ tenantSlug: "acme", brief: "Explain what Acme Pro costs" }));

      expect(run.status).toBe("awaiting_approval");
      expect(run.citations).toHaveLength(1);
      expect(run.citations[0]!.evidence).toContain("$29 per month");
      expect(requests[0]!.prompt).toContain("$29 per month");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
