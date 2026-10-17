/**
 * Real-data smoke test for @reforge/core.
 *
 *   npx tsx scripts/smoke-real.ts <vault-dir> <file> [<file>...]
 *
 * The vault is only read (a before/after snapshot proves it). Every write goes to a
 * temporary folder that is deleted at the end. Output is counts and hashes, never note text.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FolderExchange, GraphifyIndex, VaultMemoryStore, sha256Hex } from "../packages/core/src/index.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function* files(dir: string): AsyncGenerator<{ abs: string; rel: string; size: number; mtime: number }> {
  async function* go(current: string, rel: string): AsyncGenerator<{ abs: string; rel: string; size: number; mtime: number }> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      const r = path.join(rel, entry.name);
      if (entry.isDirectory()) yield* go(abs, r);
      else if (entry.isFile()) {
        const info = await stat(abs);
        yield { abs, rel: r, size: info.size, mtime: info.mtimeMs };
      }
    }
  }
  yield* go(dir, "");
}

/** Hash of every file's path, size and mtime, hidden files included. */
async function snapshot(dir: string): Promise<string> {
  const lines: string[] = [];
  for await (const f of files(dir)) lines.push(`${f.rel}|${f.size}|${f.mtime}`);
  return createHash("sha256").update(lines.sort().join("\n")).digest("hex");
}

const DOC_EXT = new Set([".md", ".txt", ".json", ".csv", ".html", ".htm", ".pdf", ".docx", ".rtf"]);
const SKIP = new Set(["node_modules", "graphify-out", "Graphify", "Runs", "Suppression.md"]);

/** Independent re-statement of the staging rules, used to cross-check GraphifyIndex.stage(). */
async function expectedEligible(vault: string) {
  const list: Array<{ abs: string; rel: string; size: number }> = [];
  for await (const f of files(vault)) {
    const parts = f.rel.split(path.sep);
    if (parts.some((p) => p.startsWith(".") || SKIP.has(p))) continue;
    if (!DOC_EXT.has(path.extname(f.rel).toLowerCase())) continue;
    if (f.size <= 0 || f.size > 25 * 1024 * 1024) continue;
    list.push(f);
  }
  return { list, files: list.length, bytes: list.reduce((n, f) => n + f.size, 0) };
}

const shasum = (file: string) => execFileSync("shasum", ["-a", "256", file], { encoding: "utf8" }).split(" ")[0]!;
const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim();

async function main() {
  const [vaultArg, ...docArgs] = process.argv.slice(2);
  if (!vaultArg || docArgs.length === 0) {
    console.error("usage: npx tsx scripts/smoke-real.ts <vault-dir> <file> [<file>...]");
    process.exit(2);
  }
  const vault = path.resolve(vaultArg);
  const docs = docArgs.map((d) => path.resolve(d));
  for (const p of [vault, ...docs]) if (!existsSync(p)) throw new Error(`not found: ${p}`);
  const scratch = await mkdtemp(path.join(os.tmpdir(), "reforge-smoke-"));
  console.log(`scratch: ${scratch}\n`);

  try {
    const before = await snapshot(vault);

    console.log("== 1. Graphify staging on the real vault (read-only)");
    const index = new GraphifyIndex({ vaultRoot: vault, workDir: path.join(scratch, "graphify") });
    const t0 = Date.now();
    const s1 = await index.stage();
    const expected = await expectedEligible(vault);
    check("stage count and bytes match an independent count", s1.files === expected.files && s1.bytes === expected.bytes,
      `staged ${s1.files} files / ${s1.bytes} bytes in ${Date.now() - t0} ms; independent ${expected.files} / ${expected.bytes}`);
    check("staging is deterministic", (await index.stage()).digest === s1.digest);
    let identical = 0;
    for (const f of expected.list) {
      const copy = path.join(index.corpusDir, f.rel);
      if (existsSync(copy) && (await readFile(copy)).equals(await readFile(f.abs))) identical += 1;
    }
    check("every staged copy is byte-identical to its source", identical === expected.files, `${identical}/${expected.files}`);

    console.log("\n== 2. Real graphify CLI query on the vault's existing graph (copied to scratch)");
    const graphSource = process.env.REFORGE_SMOKE_GRAPH ?? path.join(vault, "graphify-out", "graph.json");
    if (existsSync(graphSource)) {
      const copyDir = path.join(scratch, "graph-copy", "graphify-out");
      await mkdir(copyDir, { recursive: true });
      await copyFile(graphSource, path.join(copyDir, "graph.json"));
      try {
        const answer = await index.query("what is this vault about?", { graphPath: path.join(copyDir, "graph.json") });
        check("query returns text from the real CLI", answer.length > 0, `${answer.length} chars, ${answer.split("\n").length} lines`);
      } catch (error) {
        check("query returns text from the real CLI", false, error instanceof Error ? error.message.slice(0, 160) : String(error));
      }
    } else {
      console.log("SKIP  no graphify-out/graph.json in this vault");
    }

    console.log("\n== 3. Memory store with real notes");
    const store = new VaultMemoryStore(path.join(scratch, "vault-notes"));
    const candidates = expected.list
      .filter((f) => f.rel.endsWith(".md") && !/(^|\/)(Journal|Memories)\//.test(f.rel.split(path.sep).join("/")))
      .sort((a, b) => a.rel.localeCompare(b.rel))
      .slice(0, 8);
    const registered: Array<{ id: string; title: string; body: string; first: boolean }> = [];
    const seen = new Map<string, string>();
    for (const f of candidates) {
      const body = await readFile(f.abs, "utf8");
      if (!normalize(body)) continue;
      const title = path.basename(f.rel, ".md");
      const hash = sha256Hex(body);
      const earlier = seen.get(hash);
      const first = await store.put({ kind: "text", title, body, tool: "smoke" });
      const second = await store.put({ kind: "text", title: `${title} again`, body, tool: "smoke" });
      const note = await store.read(first.asset.id);
      // A byte-identical copy of an earlier real note must resolve to that note's asset.
      const ok = first.created === (earlier === undefined) && (earlier === undefined || first.asset.id === earlier) &&
        !second.created && second.asset.id === first.asset.id &&
        (await store.findByHash(hash))?.id === first.asset.id &&
        !!note && note.body.includes(normalize(body));
      check(`put / dedupe / read-back: note ${registered.length + 1}`, ok,
        `${normalize(body).length} chars${earlier === undefined ? "" : ", byte-identical to an earlier note, deduplicated"}`);
      seen.set(hash, first.asset.id);
      registered.push({ id: first.asset.id, title, body, first: earlier === undefined });
    }
    check("at least one real note was exercised", registered.length > 0, `${registered.length} notes`);
    console.log(`INFO  ${registered.length - seen.size} byte-identical duplicate note(s) among ${registered.length} real notes`);
    const unique = registered.filter((r) => r.first);
    const token = unique.flatMap((r) => r.title.split(/[^A-Za-z]+/)).find((w) => w.length >= 6)?.toLowerCase();
    if (token) {
      const hits = await store.search(token);
      const expectedHits = unique.filter((r) => r.title.toLowerCase().includes(token) || normalize(r.body).toLowerCase().includes(token)).length;
      check("search result count equals an independent substring count", hits.length === expectedHits, `${hits.length} vs ${expectedHits} for one title word`);
    }

    console.log("\n== 4. Exchange with real documents");
    const driveRoot = path.join(scratch, "drive");
    const exchange = new FolderExchange(driveRoot, { settleMs: 0 });
    const docStore = new VaultMemoryStore(path.join(scratch, "vault-docs"));
    const drop = async () => {
      await mkdir(exchange.outbox, { recursive: true });
      for (const d of docs) await copyFile(d, path.join(exchange.outbox, path.basename(d)));
    };
    await drop();
    const hashes = docs.map(shasum);
    const distinct = new Set(hashes).size;
    const first = await exchange.ingestOutbox(docStore);
    check("all documents ingested, none skipped", first.skipped.length === 0 && first.registered.length + first.duplicates.length === docs.length,
      `${first.registered.length} new, ${first.duplicates.length} duplicate, ${first.skipped.length} skipped`);
    check("one asset per distinct file content", first.registered.length === distinct, `${distinct} distinct`);
    let hashOk = 0;
    for (const [i, d] of docs.entries()) {
      const asset = await docStore.findByHash(hashes[i]!);
      const moved = path.join(exchange.processed, asset ? asset.uri!.replace("drive:Processed/", "") : "");
      const expectedKind = path.extname(d).toLowerCase() === ".pdf" ? "document" : "text";
      if (asset && asset.sha256 === hashes[i] && asset.kind === expectedKind && existsSync(moved) && shasum(moved) === hashes[i]) hashOk += 1;
    }
    check("each asset hash matches shasum; moved copy is identical", hashOk === docs.length, `${hashOk}/${docs.length}`);
    await drop();
    const again = await exchange.ingestOutbox(docStore);
    check("re-dropping the same files creates no new assets", again.registered.length === 0 && again.duplicates.length === docs.length,
      `${again.registered.length} new, ${again.duplicates.length} duplicate`);

    check("the real vault was not modified", (await snapshot(vault)) === before);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("smoke test crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
