import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunLog } from "./audit.js";
import type { Asset, AssetKind, MemoryStore, Source } from "./types.js";

const KINDS = new Set<AssetKind>(["brief", "research", "text", "image", "video", "audio", "web", "document"]);
const EXT_KIND: Record<string, AssetKind> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image",
  ".mp4": "video", ".mov": "video", ".webm": "video",
  ".mp3": "audio", ".wav": "audio", ".m4a": "audio",
  ".pdf": "document", ".docx": "document",
  ".md": "text", ".txt": "text", ".html": "web", ".htm": "web",
};
const TEMP_SUFFIXES = [".partial", ".tmp", ".crdownload"];

interface Meta {
  kind?: AssetKind;
  title?: string;
  parent?: string;
  tool?: string;
  source?: Source;
  tags?: string[];
}

export interface IngestSummary {
  registered: Asset[];
  duplicates: Asset[];
  skipped: Array<{ name: string; reason: string }>;
}

export interface ExchangeOptions {
  /** A file must be this old before it counts as fully synced. Default 5000 ms. */
  settleMs?: number;
  now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMeta(text: string): { meta: Meta } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "invalid metadata json" };
  }
  if (!isRecord(raw)) return { error: "metadata must be an object" };
  const meta: Meta = {};
  if (raw.kind !== undefined) {
    if (typeof raw.kind !== "string" || !KINDS.has(raw.kind as AssetKind)) return { error: "unknown kind" };
    meta.kind = raw.kind as AssetKind;
  }
  for (const key of ["title", "parent", "tool"] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return { error: `${key} must be a string` };
    meta[key] = value;
  }
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || raw.tags.some((t) => typeof t !== "string")) return { error: "tags must be strings" };
    meta.tags = raw.tags as string[];
  }
  if (raw.source !== undefined) {
    const source = raw.source;
    if (!isRecord(source) || typeof source.authorized !== "boolean") return { error: "source.authorized must be a boolean" };
    const parsed: Source = { authorized: source.authorized };
    if (typeof source.url === "string") parsed.url = source.url;
    if (typeof source.license === "string") parsed.license = source.license;
    meta.source = parsed;
  }
  return { meta };
}

async function fileSha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Folder-based exchange for remote workers. Point `root` at a synced folder
 * (Google Drive for Desktop, rclone mount, Syncthing). Layout:
 *   Inbox/      jobs and input files published for workers
 *   Outbox/     results dropped by workers (optional `<file>.meta.json` sidecar)
 *   Processed/  results already registered in memory
 * The Mac-side process is the only writer to the memory store.
 * Workers should write to `<name>.partial` and rename when finished.
 */
export class FolderExchange {
  readonly inbox: string;
  readonly outbox: string;
  readonly processed: string;
  private readonly settleMs: number;
  private readonly now: () => number;

  constructor(root: string, options: ExchangeOptions = {}) {
    this.inbox = path.join(root, "Inbox");
    this.outbox = path.join(root, "Outbox");
    this.processed = path.join(root, "Processed");
    this.settleMs = options.settleMs ?? 5000;
    this.now = options.now ?? Date.now;
  }

  /** Age in ms, never negative: a file stamped slightly ahead of our clock counts as brand new. */
  private age(mtimeMs: number): number {
    return Math.max(0, this.now() - mtimeMs);
  }

  /** Publish a file for workers. Atomic: written to a temp name, then renamed. */
  async publishToInbox(name: string, data: string | Buffer): Promise<string> {
    if (!name || name !== path.basename(name) || name.startsWith(".")) throw new Error(`invalid file name: ${name}`);
    await mkdir(this.inbox, { recursive: true });
    const final = path.join(this.inbox, name);
    const tmp = `${final}.partial`;
    await writeFile(tmp, data);
    await rename(tmp, final);
    return final;
  }

  /** Register finished worker results in memory and move them to Processed/. */
  async ingestOutbox(
    store: MemoryStore,
    opts: { tool?: string; runLog?: RunLog; runId?: string } = {},
  ): Promise<IngestSummary> {
    const summary: IngestSummary = { registered: [], duplicates: [], skipped: [] };
    let entries;
    try {
      entries = await readdir(this.outbox, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return summary;
      throw error;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (!entry.isFile() || name.startsWith(".") || name.endsWith(".meta.json")) continue;
      if (TEMP_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;
      const file = path.join(this.outbox, name);
      const metaFile = `${file}.meta.json`;
      try {
        if (this.age((await stat(file)).mtimeMs) < this.settleMs) {
          summary.skipped.push({ name, reason: "still syncing" });
          continue;
        }
        let meta: Meta = {};
        if (await exists(metaFile)) {
          if (this.age((await stat(metaFile)).mtimeMs) < this.settleMs) {
            summary.skipped.push({ name, reason: "metadata still syncing" });
            continue;
          }
          const parsed = parseMeta(await readFile(metaFile, "utf8"));
          if ("error" in parsed) {
            summary.skipped.push({ name, reason: parsed.error });
            continue;
          }
          meta = parsed.meta;
        }
        const kind = meta.kind ?? EXT_KIND[path.extname(name).toLowerCase()];
        if (!kind) {
          summary.skipped.push({ name, reason: "unknown file type" });
          continue;
        }
        const sha = await fileSha256(file);
        let destName = name;
        if (await exists(path.join(this.processed, destName))) destName = `${sha.slice(0, 8)}-${name}`;
        const { asset, created } = await store.put({
          kind,
          title: meta.title ?? path.basename(name, path.extname(name)),
          sha256: sha,
          uri: `drive:Processed/${destName}`,
          tool: meta.tool ?? opts.tool ?? "worker",
          ...(meta.parent !== undefined ? { parent: meta.parent } : {}),
          ...(meta.source ? { source: meta.source } : {}),
          ...(meta.tags ? { tags: meta.tags } : {}),
        });
        await mkdir(this.processed, { recursive: true });
        await rename(file, path.join(this.processed, destName));
        if (await exists(metaFile)) await rename(metaFile, path.join(this.processed, `${destName}.meta.json`));
        (created ? summary.registered : summary.duplicates).push(asset);
        await opts.runLog?.audit({
          runId: opts.runId ?? "exchange",
          actor: "exchange",
          action: "ingest",
          detail: `${asset.id} ${created ? "new" : "duplicate"}`,
        });
      } catch (error) {
        summary.skipped.push({ name, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return summary;
  }
}
