import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FolderExchange,
  GraphifyIndex,
  RunLog,
  VaultMemoryStore,
  runLogDir,
  type Exec,
} from "../src/index.js";

let base: string;
beforeEach(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), "reforge-adapters-"));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(file: string, content: string | Buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

describe("GraphifyIndex", () => {
  function setup() {
    const vault = path.join(base, "vault");
    const workDir = path.join(base, "work");
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const exec: Exec = async (cmd, args, opts) => {
      calls.push({ cmd, args });
      if (args[0] === "cluster-only") {
        await put(path.join(opts.cwd ?? workDir, "graphify-out", "graph.json"), "{}");
      }
      return { stdout: args[0] === "query" ? "answer\n" : "", stderr: "" };
    };
    const index = new GraphifyIndex({
      vaultRoot: vault, workDir, bin: process.execPath, model: "test-model",
      maxSourceBytes: 15, exec,
    });
    return { vault, workDir, calls, index };
  }

  it("stages only eligible documents", async () => {
    const { vault, index } = setup();
    await put(path.join(vault, "Notes", "a.md"), "alpha");
    await put(path.join(vault, "Docs", "b.pdf"), "%PDF-1.4 fake");
    await put(path.join(vault, ".obsidian", "x.md"), "skip");
    await put(path.join(vault, "Graphify", "y.md"), "skip");
    await put(path.join(vault, "Runs", "z.md"), "skip");
    await put(path.join(vault, "Agentic OS", "Content OS", "Suppression.md"), "skip");
    await put(path.join(vault, "big.txt"), "this is too large");
    await put(path.join(vault, "empty.md"), "");
    await put(path.join(vault, "image.png"), "png");

    const stage = await index.stage();
    expect(stage.files).toBe(2);
    expect(existsSync(path.join(index.corpusDir, "Notes", "a.md"))).toBe(true);
    expect(existsSync(path.join(index.corpusDir, "Docs", "b.pdf"))).toBe(true);
    for (const skipped of ["x.md", "y.md", "z.md", "Suppression.md", "big.txt", "empty.md", "image.png"]) {
      expect(existsSync(path.join(index.corpusDir, skipped))).toBe(false);
    }
  });

  it("builds in order, then skips when nothing changed", async () => {
    const { vault, calls, index } = setup();
    await put(path.join(vault, "a.md"), "alpha");

    const first = await index.build();
    expect(first.skipped).toBe(false);
    expect(calls.map((c) => c.args[0])).toEqual(["extract", "cluster-only", "export"]);
    expect(calls[0]!.args).toEqual(expect.arrayContaining([index.corpusDir, "--backend", "ollama", "--model", "test-model"]));
    expect(calls[2]!.args.slice(0, 2)).toEqual(["export", "obsidian"]);

    expect((await index.build()).skipped).toBe(true);
    expect(calls).toHaveLength(3);

    await put(path.join(vault, "a.md"), "alpha changed");
    expect((await index.build()).skipped).toBe(false);
    expect(calls).toHaveLength(6);
    expect((await index.build({ force: true })).skipped).toBe(false);
    expect(calls).toHaveLength(9);
  });

  it("uses another backend without an ollama model name unless one is given", async () => {
    const { vault, workDir, calls } = setup();
    await put(path.join(vault, "a.md"), "alpha");
    const exec: Exec = async (cmd, args, opts) => {
      calls.push({ cmd, args });
      if (args[0] === "cluster-only") await put(path.join(opts.cwd ?? workDir, "graphify-out", "graph.json"), "{}");
      return { stdout: "", stderr: "" };
    };
    const base = { vaultRoot: vault, workDir, bin: process.execPath, maxSourceBytes: 15, exec };

    await new GraphifyIndex({ ...base, backend: "claude-cli" }).build();
    const extract = calls.find((c) => c.args[0] === "extract")!.args;
    expect(extract[extract.indexOf("--backend") + 1]).toBe("claude-cli");
    expect(extract).not.toContain("--model");

    calls.length = 0;
    await new GraphifyIndex({ ...base, backend: "claude-cli", model: "haiku" }).build({ force: true });
    const withModel = calls.find((c) => c.args[0] === "extract")!.args;
    expect(withModel[withModel.indexOf("--model") + 1]).toBe("haiku");
  });

  it("queries a built graph and reports setup problems", async () => {
    const { vault, index } = setup();
    await put(path.join(vault, "a.md"), "alpha");
    await expect(index.query("what is alpha?")).rejects.toThrow(/Build the Graphify index/);
    await index.build();
    expect(await index.query("what is alpha?")).toBe("answer");
    await expect(index.query("   ")).rejects.toThrow(/question is required/);

    const missing = new GraphifyIndex({ vaultRoot: vault, workDir: path.join(base, "w2"), bin: path.join(base, "nope") });
    await expect(missing.build()).rejects.toThrow(/not installed/);
    const empty = new GraphifyIndex({
      vaultRoot: path.join(base, "empty-vault"), workDir: path.join(base, "w3"), bin: process.execPath,
    });
    await expect(empty.build()).rejects.toThrow(/No supported source documents/);
  });
});

describe("FolderExchange", () => {
  function setup(settleMs = 0) {
    const root = path.join(base, "drive");
    const store = new VaultMemoryStore(path.join(base, "vault"));
    const exchange = new FolderExchange(root, { settleMs });
    return { root, store, exchange };
  }

  it("publishes atomically and rejects unsafe names", async () => {
    const { exchange } = setup();
    const file = await exchange.publishToInbox("job-1.json", '{"task":"image"}');
    expect(await readFile(file, "utf8")).toBe('{"task":"image"}');
    expect(existsSync(`${file}.partial`)).toBe(false);
    for (const bad of ["../x", ".hidden", "", "a/b"]) {
      await expect(exchange.publishToInbox(bad, "x")).rejects.toThrow(/invalid file name/);
    }
  });

  it("registers a result with its sidecar and moves it to Processed", async () => {
    const { exchange, store } = setup();
    await put(path.join(exchange.outbox, "hero.png"), "img1");
    await put(
      path.join(exchange.outbox, "hero.png.meta.json"),
      JSON.stringify({ title: "Hero", tool: "z-image", tags: ["a"], source: { url: "https://example.com", authorized: true } }),
    );
    const summary = await exchange.ingestOutbox(store);
    expect(summary.registered).toHaveLength(1);
    const asset = summary.registered[0]!;
    expect(asset).toMatchObject({ kind: "image", title: "Hero", tool: "z-image", uri: "drive:Processed/hero.png" });
    expect(await store.get(asset.id)).not.toBeNull();
    expect(existsSync(path.join(exchange.outbox, "hero.png"))).toBe(false);
    expect(existsSync(path.join(exchange.processed, "hero.png"))).toBe(true);
    expect(existsSync(path.join(exchange.processed, "hero.png.meta.json"))).toBe(true);

    await put(path.join(exchange.outbox, "hero-copy.png"), "img1");
    const again = await exchange.ingestOutbox(store);
    expect(again.registered).toHaveLength(0);
    expect(again.duplicates).toHaveLength(1);
    expect(existsSync(path.join(exchange.processed, "hero-copy.png"))).toBe(true);
  });

  it("skips unfinished, unknown or invalid results and leaves them in place", async () => {
    const { exchange, store } = setup();
    await put(path.join(exchange.outbox, "half.png.partial"), "x");
    await put(path.join(exchange.outbox, "mystery.xyz"), "x");
    await put(path.join(exchange.outbox, "bad-kind.png"), "b1");
    await put(path.join(exchange.outbox, "bad-kind.png.meta.json"), JSON.stringify({ kind: "nope" }));
    await put(path.join(exchange.outbox, "bad-json.png"), "b2");
    await put(path.join(exchange.outbox, "bad-json.png.meta.json"), "{broken");
    await put(path.join(exchange.outbox, "orphan.png"), "b3");
    await put(path.join(exchange.outbox, "orphan.png.meta.json"), JSON.stringify({ parent: "text-0000000000000000" }));
    await put(path.join(exchange.outbox, "unauth.png"), "b4");
    await put(path.join(exchange.outbox, "unauth.png.meta.json"), JSON.stringify({ source: { url: "https://example.com" } }));

    const summary = await exchange.ingestOutbox(store);
    expect(summary.registered).toHaveLength(0);
    const reasons = Object.fromEntries(summary.skipped.map((s) => [s.name, s.reason]));
    expect(reasons["mystery.xyz"]).toBe("unknown file type");
    expect(reasons["bad-kind.png"]).toBe("unknown kind");
    expect(reasons["bad-json.png"]).toBe("invalid metadata json");
    expect(reasons["orphan.png"]).toMatch(/parent asset not found/);
    expect(reasons["unauth.png"]).toBe("source.authorized must be a boolean");
    expect(reasons["half.png.partial"]).toBeUndefined();
    expect(existsSync(path.join(exchange.outbox, "orphan.png"))).toBe(true);
  });

  it("waits for files that are still syncing", async () => {
    const { exchange, store } = setup(60_000);
    await put(path.join(exchange.outbox, "fresh.png"), "f1");
    const summary = await exchange.ingestOutbox(store);
    expect(summary.skipped).toEqual([{ name: "fresh.png", reason: "still syncing" }]);
    expect(existsSync(path.join(exchange.outbox, "fresh.png"))).toBe(true);
  });

  it("keeps both files when a different result already has the same name, and audits", async () => {
    const { root, exchange, store } = setup();
    await put(path.join(exchange.processed, "hero.png"), "old content");
    await put(path.join(exchange.outbox, "hero.png"), "new content");
    const log = new RunLog(runLogDir(path.join(base, "vault")));
    const summary = await exchange.ingestOutbox(store, { runLog: log, runId: "ex-1" });
    expect(summary.registered).toHaveLength(1);
    expect(summary.registered[0]!.uri).toMatch(/^drive:Processed\/[0-9a-f]{8}-hero\.png$/);
    expect(await readFile(path.join(root, "Processed", "hero.png"), "utf8")).toBe("old content");
    const audit = (await log.entries("ex-1")).filter((l) => l.type === "audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "ingest" });
  });
});
