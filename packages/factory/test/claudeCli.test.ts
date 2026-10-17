import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeCliRunner, type ClaudeCliOptions } from "../src/index.js";

const FAKE = `
import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const stdin = readFileSync(0, "utf8");
const mode = process.env.FAKE_MODE ?? "ok";
if (mode === "slow") { setTimeout(() => {}, 10000); }
else if (mode === "notjson") { console.log("hello"); }
else if (mode === "error") { console.log(JSON.stringify({ is_error: true, subtype: "error_max_budget", result: "over budget" })); process.exit(1); }
else if (mode === "crash") { console.error("boom"); process.exit(2); }
else {
  console.log(JSON.stringify({
    type: "result", is_error: false, result: JSON.stringify({ args, stdin }), total_cost_usd: 0.0123,
    usage: { input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 20, output_tokens: 7 },
    modelUsage: { "claude-test-1": {} },
  }));
}
`;

let dir: string;
let script: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "reforge-claude-"));
  script = path.join(dir, "fake-claude.mjs");
  await writeFile(script, FAKE, "utf8");
});
afterEach(async () => {
  delete process.env.FAKE_MODE;
  await rm(dir, { recursive: true, force: true });
});

const runner = (extra: ClaudeCliOptions = {}) =>
  new ClaudeCliRunner({ bin: process.execPath, prefixArgs: [script], cwd: dir, ...extra });
const request = { stage: "draft" as const, system: "SYS", prompt: "PROMPT TEXT" };

describe("ClaudeCliRunner", () => {
  it("sends the prompt on stdin with isolation flags, and maps cost and usage", async () => {
    const result = await runner().run(request);
    const seen = JSON.parse(result.text) as { args: string[]; stdin: string };

    expect(seen.stdin).toBe("PROMPT TEXT");
    expect(seen.args.join(" ")).not.toContain("PROMPT TEXT");
    const at = (flag: string) => seen.args[seen.args.indexOf(flag) + 1];
    expect(seen.args).toEqual(expect.arrayContaining(["-p", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]));
    expect(at("--tools")).toBe("");
    expect(at("--system-prompt")).toBe("SYS");
    expect(at("--model")).toBe("sonnet");
    expect(at("--setting-sources")).toBe("project");
    expect(at("--output-format")).toBe("json");
    expect(seen.args).not.toContain("--bare");

    expect(result).toMatchObject({ model: "claude-test-1", inputTokens: 125, outputTokens: 7, usd: 0.0123 });
  });

  it("passes a chosen model and a per-call budget", async () => {
    const seen = JSON.parse((await runner({ model: "haiku", maxBudgetUsd: 0.25 }).run(request)).text) as { args: string[] };
    expect(seen.args[seen.args.indexOf("--model") + 1]).toBe("haiku");
    expect(seen.args[seen.args.indexOf("--max-budget-usd") + 1]).toBe("0.25");
  });

  it("reports failures clearly instead of returning empty text", async () => {
    process.env.FAKE_MODE = "notjson";
    await expect(runner().run(request)).rejects.toThrow(/did not return JSON/);
    process.env.FAKE_MODE = "error";
    await expect(runner().run(request)).rejects.toThrow(/claude CLI failed \(error_max_budget\): over budget/);
    process.env.FAKE_MODE = "crash";
    await expect(runner().run(request)).rejects.toThrow(/did not return JSON \(exit 2\): boom/);
    process.env.FAKE_MODE = "slow";
    await expect(runner({ timeoutMs: 300 }).run(request)).rejects.toThrow(/timed out/);
    await expect(runner({ bin: path.join(dir, "no-such-binary"), prefixArgs: [] }).run(request)).rejects.toThrow(/could not start/);
  });
});
