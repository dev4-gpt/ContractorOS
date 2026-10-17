import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_NAMESPACE } from "./vaultStore.js";

const execFileAsync = promisify(execFile);

export type Exec = (
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: Exec = async (cmd, args, opts) => {
  const result = await execFileAsync(cmd, args, { ...opts, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

/** Same file types and size cap AgenticOS stages for Graphify. */
const SOURCE_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv", ".html", ".htm", ".pdf", ".docx", ".rtf"]);
/** Folders and files that are never document sources (generated output, logs, our own bookkeeping). */
const SKIP_NAMES = new Set([
  "node_modules", "graphify-out", "Graphify", "Runs", "Suppression.md",
]);
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export interface GraphifyOptions {
  vaultRoot: string;
  /** Staged corpus and graph output. Keep it outside the vault. Not AgenticOS's folder: its stage step wipes it. */
  workDir?: string;
  bin?: string;
  model?: string;
  /** Where the Obsidian export goes. Defaults to "<vault>/Agentic OS/Content OS/Graphify". */
  exportDir?: string;
  maxSourceBytes?: number;
  exec?: Exec;
}

export interface StageResult {
  files: number;
  bytes: number;
  /** sha256 over the sorted "path:sha256" lines of every staged file. */
  digest: string;
}

export interface BuildResult {
  skipped: boolean;
  stage: StageResult;
}

async function fileSha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * Document understanding for PDFs and Word files through the Graphify CLI,
 * the same tool AgenticOS uses. Builds only when the staged content changed.
 * Quality depends on the local model (default qwen3.5:4b); test on real documents.
 */
export class GraphifyIndex {
  readonly workDir: string;
  readonly corpusDir: string;
  readonly graphPath: string;
  private readonly bin: string;
  private readonly model: string;
  private readonly exportDir: string;
  private readonly maxBytes: number;
  private readonly exec: Exec;

  constructor(private readonly options: GraphifyOptions) {
    this.workDir = options.workDir ?? path.join(os.homedir(), ".reforge", "graphify");
    this.corpusDir = path.join(this.workDir, "corpus");
    this.graphPath = path.join(this.workDir, "graphify-out", "graph.json");
    this.bin = options.bin ?? path.join(os.homedir(), ".local", "bin", "graphify");
    this.model = options.model ?? process.env.GRAPHIFY_OLLAMA_MODEL ?? "qwen3.5:4b";
    this.exportDir = options.exportDir ?? path.join(options.vaultRoot, DEFAULT_NAMESPACE, "Graphify");
    this.maxBytes = options.maxSourceBytes ?? DEFAULT_MAX_BYTES;
    this.exec = options.exec ?? defaultExec;
  }

  private env(): NodeJS.ProcessEnv {
    const local = path.join(os.homedir(), ".local", "bin");
    return {
      ...process.env,
      PATH: `${local}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`,
      OLLAMA_BASE_URL: process.env.GRAPHIFY_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY ?? "local",
      OLLAMA_MODEL: this.model,
      GRAPHIFY_MAX_RETRIES: process.env.GRAPHIFY_MAX_RETRIES ?? "0",
      GRAPHIFY_OLLAMA_NUM_CTX: process.env.GRAPHIFY_OLLAMA_NUM_CTX ?? "8192",
      GRAPHIFY_MAX_OUTPUT_TOKENS: process.env.GRAPHIFY_MAX_OUTPUT_TOKENS ?? "768",
      GRAPHIFY_DISABLE_THINKING: process.env.GRAPHIFY_DISABLE_THINKING ?? "true",
    };
  }

  private run(args: string[], timeout: number) {
    return this.exec(this.bin, args, { cwd: this.workDir, env: this.env(), timeout });
  }

  /** Copy eligible vault files into the corpus folder and fingerprint them. */
  async stage(): Promise<StageResult> {
    await rm(this.corpusDir, { recursive: true, force: true });
    await mkdir(this.corpusDir, { recursive: true });
    const lines: string[] = [];
    let bytes = 0;

    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".") || SKIP_NAMES.has(entry.name)) continue;
        const source = path.join(dir, entry.name);
        const relative = path.join(rel, entry.name);
        if (entry.isDirectory()) {
          await walk(source, relative);
          continue;
        }
        if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
        const info = await stat(source);
        if (info.size <= 0 || info.size > this.maxBytes) continue;
        const destination = path.join(this.corpusDir, relative);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(source, destination);
        lines.push(`${relative}:${await fileSha256(source)}`);
        bytes += info.size;
      }
    };

    await walk(this.options.vaultRoot, "");
    lines.sort();
    const digest = createHash("sha256").update(lines.join("\n")).digest("hex");
    const result = { files: lines.length, bytes, digest };
    await writeFile(
      path.join(this.workDir, "corpus-manifest.json"),
      JSON.stringify({ ...result, updatedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
    return result;
  }

  private digestFile(): string {
    return path.join(this.workDir, "built-digest.txt");
  }

  /** Stage, then extract, cluster and export, unless nothing changed since the last build. */
  async build(opts: { force?: boolean } = {}): Promise<BuildResult> {
    if (!existsSync(this.bin)) throw new Error("Graphify is not installed. Run: uv tool install graphifyy");
    await mkdir(this.workDir, { recursive: true });
    const stage = await this.stage();
    if (stage.files === 0) throw new Error("No supported source documents were found in the vault.");
    if (!opts.force && existsSync(this.graphPath)) {
      const last = await readFile(this.digestFile(), "utf8").catch(() => "");
      if (last.trim() === stage.digest) return { skipped: true, stage };
    }
    await mkdir(this.exportDir, { recursive: true });
    await this.run([
      "extract", this.corpusDir,
      "--out", this.workDir,
      "--backend", "ollama",
      "--model", this.model,
      "--max-concurrency", "1",
      "--token-budget", process.env.GRAPHIFY_TOKEN_BUDGET ?? "2500",
      "--api-timeout", "120",
    ], 15 * 60_000);
    await this.run(["cluster-only", this.workDir, "--no-label", "--no-viz"], 90_000);
    await this.run(["export", "obsidian", "--graph", this.graphPath, "--dir", this.exportDir], 90_000);
    await writeFile(this.digestFile(), stage.digest, "utf8");
    return { skipped: false, stage };
  }

  /** Ask a question of a built graph. Pass `graphPath` to query another graph, such as AgenticOS's. */
  async query(question: string, opts: { graphPath?: string } = {}): Promise<string> {
    const q = question.trim().slice(0, 500);
    if (!q) throw new Error("question is required");
    const graph = opts.graphPath ?? this.graphPath;
    if (!existsSync(graph)) throw new Error("Build the Graphify index before querying it.");
    await mkdir(this.workDir, { recursive: true });
    const result = await this.run(["query", q, "--graph", graph], 45_000);
    return `${result.stdout}\n${result.stderr}`.trim();
  }
}
