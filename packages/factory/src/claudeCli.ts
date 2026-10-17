import { spawn } from "node:child_process";
import os from "node:os";
import type { AgentRunner, RunnerRequest, RunnerResult } from "./runner.js";

export interface ClaudeCliOptions {
  /** Model alias or id passed to `--model`. Default "sonnet". */
  model?: string;
  /** The claude executable. Default "claude" (found on PATH). */
  bin?: string;
  /** Arguments placed before the claude flags. For tests that point `bin` at a script. */
  prefixArgs?: string[];
  /** Working folder. Default: the OS temp folder, so no project files or CLAUDE.md are picked up. */
  cwd?: string;
  timeoutMs?: number;
  /** Per-call spend cap in USD, passed to `--max-budget-usd`. */
  maxBudgetUsd?: number;
}

interface CliJson {
  is_error?: boolean;
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
}

/**
 * AgentRunner backed by the `claude` CLI, using the user's existing login (no API key, no download).
 * Each call is an isolated, tool-less completion: tools off, user settings and hooks skipped, no MCP servers,
 * no session saved. `--bare` is not used because it requires an API key and cannot use a login.
 * The prompt travels on stdin, so it never appears in the process list.
 */
export class ClaudeCliRunner implements AgentRunner {
  constructor(private readonly options: ClaudeCliOptions = {}) {}

  async run(request: RunnerRequest): Promise<RunnerResult> {
    const model = this.options.model ?? "sonnet";
    const args = [
      ...(this.options.prefixArgs ?? []),
      "-p",
      "--output-format", "json",
      "--tools", "",
      "--no-session-persistence",
      "--system-prompt", request.system,
      "--setting-sources", "project",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--model", model,
      ...(this.options.maxBudgetUsd !== undefined ? ["--max-budget-usd", String(this.options.maxBudgetUsd)] : []),
    ];
    const { stdout, stderr, code } = await this.exec(args, request.prompt);

    let parsed: CliJson;
    try {
      parsed = JSON.parse(stdout) as CliJson;
    } catch {
      throw new Error(`claude CLI did not return JSON (exit ${code}): ${(stderr || stdout).trim().slice(0, 200)}`);
    }
    if (parsed.is_error || code !== 0) {
      throw new Error(`claude CLI failed (${parsed.subtype ?? `exit ${code}`}): ${(parsed.result ?? stderr).toString().trim().slice(0, 200)}`);
    }
    if (typeof parsed.result !== "string") throw new Error("claude CLI returned no text");
    const usage = parsed.usage ?? {};
    return {
      text: parsed.result,
      model: Object.keys(parsed.modelUsage ?? {})[0] ?? model,
      inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      outputTokens: usage.output_tokens ?? 0,
      usd: parsed.total_cost_usd,
    };
  }

  private exec(args: string[], stdin: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const timeoutMs = this.options.timeoutMs ?? 180_000;
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.bin ?? "claude", args, {
        cwd: this.options.cwd ?? os.tmpdir(),
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`claude CLI timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`could not start claude CLI: ${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(stdin);
    });
  }
}
