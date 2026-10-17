import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Asset, AssetInput, MemoryStore, PutResult } from "./types.js";

/** Same folder layout the AgenticOS vault uses, so both products share one memory. */
export const DEFAULT_NAMESPACE = path.join("Agentic OS", "Content OS");

const ID_RE = /^[a-z]+-[0-9a-f]{16}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const MAX_LINEAGE_DEPTH = 50;

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(normalizeText(text)).digest("hex");
}

/** Stable form of a URL so the same page always maps to the same key. */
export function canonicalUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || key === "fbclid" || key === "gclid") url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const out = url.toString();
  return url.pathname === "/" ? out : out.replace(/\/(\?|$)/, "$1");
}

function toNote(asset: Asset, body: string): string {
  const fields: Array<[string, unknown]> = [
    ["id", asset.id], ["kind", asset.kind], ["title", asset.title], ["sha256", asset.sha256],
    ["uri", asset.uri], ["parent", asset.parent], ["tool", asset.tool], ["source", asset.source],
    ["tags", asset.tags], ["created", asset.created],
  ];
  const head = fields
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  const parts = ["---", ...head, "---", "", `# ${asset.title}`, ""];
  if (asset.parent) parts.push(`Parent: [[${asset.parent}]]`, "");
  if (body) parts.push(body);
  return parts.join("\n") + "\n";
}

function parseNote(text: string, relPath: string): { asset: Asset; body: string } | null {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const raw: Record<string, unknown> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const split = line.indexOf(": ");
    if (split < 0) continue;
    try {
      raw[line.slice(0, split)] = JSON.parse(line.slice(split + 2));
    } catch {
      return null;
    }
  }
  const { id, kind, title, sha256, tool, created } = raw;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (typeof kind !== "string" || typeof title !== "string" || typeof tool !== "string") return null;
  if (typeof sha256 !== "string" || typeof created !== "string") return null;
  const asset: Asset = {
    id, kind: kind as Asset["kind"], title, sha256, tool, created, path: relPath,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
  };
  if (typeof raw.uri === "string") asset.uri = raw.uri;
  if (typeof raw.parent === "string") asset.parent = raw.parent;
  if (raw.source && typeof raw.source === "object") asset.source = raw.source as Asset["source"];
  return { asset, body: text.slice(end + 5) };
}

function isTransient(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EAGAIN" || code === "EBUSY" || code === "EINTR";
}

/** Write via a temp file and rename; retry the iCloud-style transient errors. */
async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeFile(tmp, content, "utf8");
      await rename(tmp, file);
      return;
    } catch (error) {
      if (!isTransient(error) || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}

export interface VaultStoreOptions {
  /** Folder inside the vault root. Defaults to "Agentic OS/Content OS". */
  namespaceDir?: string;
  now?: () => Date;
}

/**
 * Markdown-note MemoryStore. One note per asset, named `<kind>-<hash16>.md`,
 * so identical content maps to the same file (the dedupe rule).
 * Assumes a single writer process; workers hand results to it through a queue.
 */
export class VaultMemoryStore implements MemoryStore {
  private readonly assetsDir: string;
  private readonly rel: string;
  private readonly now: () => Date;

  constructor(private readonly root: string, options: VaultStoreOptions = {}) {
    this.rel = path.join(options.namespaceDir ?? DEFAULT_NAMESPACE, "Assets");
    this.assetsDir = path.join(root, this.rel);
    this.now = options.now ?? (() => new Date());
  }

  async put(input: AssetInput): Promise<PutResult> {
    if (!input.title.trim()) throw new Error("title is required");
    if (!input.tool.trim()) throw new Error("tool is required");
    let hash: string;
    if (input.sha256 !== undefined) {
      if (!HASH_RE.test(input.sha256)) throw new Error("sha256 must be 64 hex characters");
      hash = input.sha256;
    } else if (input.body !== undefined) {
      hash = sha256Hex(input.body);
    } else {
      throw new Error("either body or sha256 is required");
    }
    const id = `${input.kind}-${hash.slice(0, 16)}`;
    const existing = await this.get(id);
    if (existing) return { asset: existing, created: false };

    if (input.parent !== undefined && !(await this.get(input.parent))) {
      throw new Error(`parent asset not found: ${input.parent}`);
    }
    const asset: Asset = {
      id, kind: input.kind, title: input.title.trim(), sha256: hash, tool: input.tool.trim(),
      tags: input.tags ?? [], created: this.now().toISOString(), path: path.join(this.rel, `${id}.md`),
    };
    if (input.uri !== undefined) asset.uri = input.uri;
    if (input.parent !== undefined) asset.parent = input.parent;
    if (input.source) {
      asset.source = { ...input.source };
      if (input.source.url) asset.source.url = canonicalUrl(input.source.url);
    }
    await writeAtomic(path.join(this.root, asset.path), toNote(asset, input.body ?? ""));
    return { asset, created: true };
  }

  async read(id: string): Promise<{ asset: Asset; body: string } | null> {
    if (!ID_RE.test(id)) throw new Error(`invalid asset id: ${id}`);
    const relPath = path.join(this.rel, `${id}.md`);
    let text: string;
    try {
      text = await readFile(path.join(this.root, relPath), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return parseNote(text, relPath);
  }

  async get(id: string): Promise<Asset | null> {
    return (await this.read(id))?.asset ?? null;
  }

  private async all(): Promise<Array<{ asset: Asset; body: string }>> {
    let names: string[];
    try {
      names = await readdir(this.assetsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const out: Array<{ asset: Asset; body: string }> = [];
    for (const name of names) {
      if (!name.endsWith(".md") || !ID_RE.test(name.slice(0, -3))) continue;
      const note = await this.read(name.slice(0, -3));
      if (note) out.push(note);
    }
    return out;
  }

  async findByHash(sha256: string): Promise<Asset | null> {
    return (await this.all()).find((n) => n.asset.sha256 === sha256)?.asset ?? null;
  }

  async findBySourceUrl(url: string): Promise<Asset | null> {
    let key: string;
    try {
      key = canonicalUrl(url);
    } catch {
      return null;
    }
    const matches = (await this.all())
      .filter((n) => n.asset.source?.url === key)
      .sort((a, b) => b.asset.created.localeCompare(a.asset.created));
    return matches[0]?.asset ?? null;
  }

  async search(query: string, limit = 20): Promise<Asset[]> {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const scored: Array<{ asset: Asset; score: number }> = [];
    for (const { asset, body } of await this.all()) {
      const title = asset.title.toLowerCase();
      const text = body.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (title.includes(token)) score += 3;
        if (text.includes(token)) score += 1;
      }
      if (score > 0) scored.push({ asset, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.asset);
  }

  async lineage(id: string): Promise<Asset[]> {
    const chain: Asset[] = [];
    const seen = new Set<string>();
    let current = await this.get(id);
    while (current) {
      if (seen.has(current.id) || chain.length >= MAX_LINEAGE_DEPTH) {
        throw new Error("lineage is cyclic or too deep");
      }
      seen.add(current.id);
      chain.unshift(current);
      current = current.parent ? await this.get(current.parent) : null;
    }
    return chain;
  }
}
