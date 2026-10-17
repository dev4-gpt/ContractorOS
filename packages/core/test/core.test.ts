import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RunLog,
  Suppression,
  VaultMemoryStore,
  canonicalUrl,
  runLogDir,
  suppressionFile,
} from "../src/index.js";

const NOW = () => new Date("2026-10-16T12:00:00.000Z");
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "reforge-core-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("VaultMemoryStore", () => {
  it("returns the existing asset when the same content is put twice", async () => {
    const store = new VaultMemoryStore(root, { now: NOW });
    const first = await store.put({ kind: "text", title: "Post", body: "Hello world", tool: "hermes" });
    const second = await store.put({ kind: "text", title: "Other title", body: "Hello world\r\n", tool: "hermes" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.asset.id).toBe(first.asset.id);
    const different = await store.put({ kind: "text", title: "Post", body: "Hello there", tool: "hermes" });
    expect(different.asset.id).not.toBe(first.asset.id);
  });

  it("stores externally held files by hash and rejects bad input", async () => {
    const store = new VaultMemoryStore(root, { now: NOW });
    const sha = "a".repeat(64);
    const { asset } = await store.put({ kind: "image", title: "Hero", sha256: sha, uri: "drive:file-123", tool: "z-image" });
    expect(asset.id).toBe("image-aaaaaaaaaaaaaaaa");
    expect(asset.uri).toBe("drive:file-123");
    await expect(store.put({ kind: "text", title: "x", tool: "t" })).rejects.toThrow(/body or sha256/);
    await expect(store.put({ kind: "text", title: "x", sha256: "nope", tool: "t" })).rejects.toThrow(/64 hex/);
    await expect(store.put({ kind: "text", title: " ", body: "b", tool: "t" })).rejects.toThrow(/title/);
  });

  it("finds assets by canonical source url", async () => {
    const store = new VaultMemoryStore(root, { now: NOW });
    await store.put({
      kind: "web", title: "Competitor page", body: "<html>", tool: "rea",
      source: { url: "https://Example.com/post/?utm_source=x#frag", authorized: true },
    });
    expect(canonicalUrl("https://Example.com/post/?utm_source=x#frag")).toBe("https://example.com/post");
    expect((await store.findBySourceUrl("https://example.com/post"))?.title).toBe("Competitor page");
    expect(await store.findBySourceUrl("https://example.com/other")).toBeNull();
    expect(await store.findBySourceUrl("not a url")).toBeNull();
  });

  it("builds lineage and links parents with a wikilink", async () => {
    const store = new VaultMemoryStore(root, { now: NOW });
    const a = (await store.put({ kind: "brief", title: "Brief", body: "a", tool: "user" })).asset;
    const b = (await store.put({ kind: "text", title: "Draft", body: "b", tool: "hermes", parent: a.id })).asset;
    const c = (await store.put({ kind: "text", title: "Final", body: "c", tool: "hermes", parent: b.id })).asset;
    expect((await store.lineage(c.id)).map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    const note = await readFile(path.join(root, c.path), "utf8");
    expect(note.startsWith("---\n")).toBe(true);
    expect(note).toContain(`Parent: [[${b.id}]]`);
    await expect(
      store.put({ kind: "text", title: "Orphan", body: "d", tool: "t", parent: "text-0000000000000000" }),
    ).rejects.toThrow(/parent asset not found/);
  });

  it("rejects ids that could escape the store and ignores corrupt notes", async () => {
    const store = new VaultMemoryStore(root, { now: NOW });
    await expect(store.get("../../etc/passwd")).rejects.toThrow(/invalid asset id/);
    const { asset } = await store.put({ kind: "text", title: "Keep", body: "keep", tool: "t" });
    await writeFile(path.join(root, path.dirname(asset.path), "text-ffffffffffffffff.md"), "not a note", "utf8");
    expect((await store.search("keep")).map((x) => x.id)).toEqual([asset.id]);
  });

  it("searches titles and bodies, titles weighted higher", async () => {
    const store = new VaultMemoryStore(root, { now: NOW });
    await store.put({ kind: "text", title: "Pricing guide", body: "about money", tool: "t" });
    await store.put({ kind: "text", title: "Other", body: "pricing appears in the body", tool: "t" });
    const hits = await store.search("pricing");
    expect(hits.map((h) => h.title)).toEqual(["Pricing guide", "Other"]);
    expect(await store.search("   ")).toEqual([]);
  });
});

describe("Suppression", () => {
  it("blocks every identifier of an opted-out business and stores only hashes", async () => {
    const list = new Suppression(suppressionFile(root), NOW);
    const added = await list.addContact({ email: "Info@Acme.example", website: "https://www.acme.example/contact", phone: "+1 (555) 010-2222" });
    expect(added).toEqual(["email", "domain", "phone"]);
    expect(await list.addContact({ email: "info@acme.example" })).toEqual([]);

    expect((await list.check({ email: "INFO@acme.example" })).blocked).toBe(true);
    expect((await list.check({ email: "sales@acme.example" })).matches).toEqual(["domain"]);
    expect((await list.check({ website: "acme.example" })).matches).toEqual(["domain"]);
    expect((await list.check({ phone: "15550102222" })).matches).toEqual(["phone"]);
    expect((await list.check({ email: "someone@other.example", phone: "999999999" })).blocked).toBe(false);

    const text = await readFile(suppressionFile(root), "utf8");
    expect(text).not.toContain("acme.example");
    expect(text).not.toContain("5550102222");
  });

  it("never blocks shared mail domains and rejects malformed identifiers", async () => {
    const list = new Suppression(suppressionFile(root), NOW);
    await expect(list.add("domain", "gmail.com")).rejects.toThrow(/shared mail domain/);
    await list.add("email", "one@gmail.com");
    expect((await list.check({ email: "two@gmail.com" })).blocked).toBe(false);
    expect((await list.check({ email: "one@gmail.com" })).blocked).toBe(true);
    await expect(list.add("email", "no-at-sign")).rejects.toThrow(/not an email/);
    await expect(list.add("phone", "12")).rejects.toThrow(/not a phone/);
  });
});

describe("RunLog", () => {
  it("totals cost, enforces a budget, and skips corrupt lines", async () => {
    const dir = runLogDir(root);
    const log = new RunLog(dir, NOW);
    await log.record({ runId: "run-1", provider: "openrouter", model: "m", inputTokens: 100, outputTokens: 50, usd: 0.02 });
    await log.record({ runId: "run-1", provider: "openrouter", inputTokens: 10, usd: 0.04 });
    await log.audit({ runId: "run-1", actor: "factory", action: "stage:draft", detail: "ok" });
    await writeFile(path.join(dir, "run-1.jsonl"), (await readFile(path.join(dir, "run-1.jsonl"), "utf8")) + "{broken\n", "utf8");

    const total = await log.total("run-1");
    expect(total.entries).toBe(2);
    expect(total.inputTokens).toBe(110);
    expect(total.outputTokens).toBe(50);
    expect(total.usd).toBeCloseTo(0.06);
    expect(await log.budgetExceeded("run-1", 0.05)).toBe(true);
    expect(await log.budgetExceeded("run-1", 1)).toBe(false);
    expect((await log.entries("run-1")).filter((l) => l.type === "audit")).toHaveLength(1);
    expect((await log.entries("missing-run"))).toEqual([]);
    await expect(log.audit({ runId: "../bad", actor: "x", action: "y" })).rejects.toThrow(/invalid run id/);
  });
});
