import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AuditEntry, CostEntry, CostLedger } from "./types.js";
import { DEFAULT_NAMESPACE } from "./vaultStore.js";

const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

export type RunLogLine =
  | ({ type: "audit" } & AuditEntry)
  | ({ type: "cost" } & CostEntry);

export function runLogDir(root: string, namespaceDir = DEFAULT_NAMESPACE): string {
  return path.join(root, namespaceDir, "Runs");
}

/**
 * Append-only audit trail and cost ledger, one JSONL file per run.
 * Never log API keys or personal data in `detail` or `note`.
 * (.jsonl is not picked up by the AgenticOS vault search, which only indexes .json.)
 */
export class RunLog implements CostLedger {
  constructor(private readonly dir: string, private readonly now: () => Date = () => new Date()) {}

  private file(runId: string): string {
    if (!RUN_ID_RE.test(runId)) throw new Error(`invalid run id: ${runId}`);
    return path.join(this.dir, `${runId}.jsonl`);
  }

  private async append(runId: string, line: RunLogLine): Promise<void> {
    const file = this.file(runId);
    await mkdir(this.dir, { recursive: true });
    await appendFile(file, JSON.stringify(line) + "\n", "utf8");
  }

  async audit(entry: Omit<AuditEntry, "ts"> & { ts?: string }): Promise<void> {
    await this.append(entry.runId, { type: "audit", ...entry, ts: entry.ts ?? this.now().toISOString() });
  }

  async record(entry: Omit<CostEntry, "ts"> & { ts?: string }): Promise<void> {
    await this.append(entry.runId, { type: "cost", ...entry, ts: entry.ts ?? this.now().toISOString() });
  }

  async entries(runId: string): Promise<RunLogLine[]> {
    let text: string;
    try {
      text = await readFile(this.file(runId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const lines: RunLogLine[] = [];
    for (const raw of text.split("\n")) {
      if (!raw.trim()) continue;
      try {
        lines.push(JSON.parse(raw) as RunLogLine);
      } catch {
        // skip a torn or corrupt line instead of failing the whole run
      }
    }
    return lines;
  }

  async total(runId: string): Promise<{ usd: number; inputTokens: number; outputTokens: number; entries: number }> {
    const totals = { usd: 0, inputTokens: 0, outputTokens: 0, entries: 0 };
    for (const line of await this.entries(runId)) {
      if (line.type !== "cost") continue;
      totals.entries += 1;
      totals.usd += line.usd ?? 0;
      totals.inputTokens += line.inputTokens ?? 0;
      totals.outputTokens += line.outputTokens ?? 0;
    }
    return totals;
  }

  /** True once spend reaches the cap. Callers should stop starting new paid steps. */
  async budgetExceeded(runId: string, maxUsd: number): Promise<boolean> {
    return (await this.total(runId)).usd >= maxUsd;
  }
}
