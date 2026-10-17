import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Asset, MemoryStore, RunLog } from "@reforge/core";
import { defaultChecks, runChecks, type Check } from "./checks.js";
import {
  canPublish,
  stageSystemPrompt,
  type Approval,
  type Citation,
  type DeliveryRecord,
  type FactoryPlan,
  type QualityReport,
  type RunStatus,
  type Stage,
} from "./contract.js";
import type { AgentRunner, ResearchProvider } from "./runner.js";

const WORKFLOW_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,99}$/;

export interface FactoryDeps {
  runner: AgentRunner;
  research?: ResearchProvider;
  store: MemoryStore;
  runLog: RunLog;
  /** Defaults to: at least one citation, and every figure must be sourced. */
  checks?: readonly Check[];
  /** How many times the runner may be asked to repair a failing draft. Default 2. */
  maxRepairAttempts?: number;
  /** Stop starting paid steps once spend reaches this many USD. */
  budgetUsd?: number;
  /** Where run state is saved (`<workflowId>.run`). Omit to keep state in memory only. */
  stateDir?: string;
  now?: () => Date;
}

export interface FactoryRun {
  plan: FactoryPlan;
  status: RunStatus;
  citations: Citation[];
  assets: { brief?: string; research?: string; outline?: string; drafts: string[]; quality?: string };
  quality?: QualityReport;
  approval?: Approval;
  delivery?: DeliveryRecord;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

function shortTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 60);
}

function validCitation(c: Omit<Citation, "id">): boolean {
  try {
    const url = new URL(c.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  } catch {
    return false;
  }
  return c.evidence.trim().length > 0 && Number.isFinite(Date.parse(c.retrievedAt));
}

function citationsText(citations: readonly Citation[]): string {
  if (citations.length === 0) return "(no sources available)";
  return citations
    .map((c) => `[${c.id}] ${c.title ?? c.url} <${c.url}>\nEvidence: ${c.evidence}`)
    .join("\n\n");
}

/**
 * Runs a brief through research, outline, draft and a verify-and-repair loop,
 * then stops at a human approval gate. Every stage output is saved to memory
 * with lineage. Nothing is ever sent: `publish` only records a delivery.
 */
export class ContentFactory {
  private readonly runs = new Map<string, FactoryRun>();

  constructor(private readonly deps: FactoryDeps) {}

  private nowIso(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private statePath(workflowId: string): string | null {
    if (!this.deps.stateDir || !WORKFLOW_RE.test(workflowId)) return null;
    return path.join(this.deps.stateDir, `${workflowId}.run`);
  }

  private async save(run: FactoryRun): Promise<void> {
    run.updatedAt = this.nowIso();
    this.runs.set(run.plan.workflowId, run);
    const file = this.statePath(run.plan.workflowId);
    if (!file) return;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(run, null, 2), "utf8");
  }

  async get(workflowId: string): Promise<FactoryRun | null> {
    const cached = this.runs.get(workflowId);
    if (cached) return cached;
    const file = this.statePath(workflowId);
    if (!file) return null;
    try {
      const run = JSON.parse(await readFile(file, "utf8")) as FactoryRun;
      this.runs.set(workflowId, run);
      return run;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async mustGet(workflowId: string): Promise<FactoryRun> {
    const run = await this.get(workflowId);
    if (!run) throw new Error(`unknown workflow: ${workflowId}`);
    return run;
  }

  private audit(run: FactoryRun, action: string, detail?: string): Promise<void> {
    return this.deps.runLog.audit({ runId: run.plan.workflowId, actor: "factory", action, detail });
  }

  /** One paid runner call, with the budget checked first and the cost recorded after. */
  private async call(run: FactoryRun, stage: Stage, prompt: string): Promise<string> {
    const runId = run.plan.workflowId;
    const { budgetUsd, runLog } = this.deps;
    if (budgetUsd !== undefined && (await runLog.budgetExceeded(runId, budgetUsd))) {
      throw new Error(`budget of $${budgetUsd} exceeded before stage ${stage}`);
    }
    const result = await this.deps.runner.run({ stage, system: stageSystemPrompt(run.plan, stage), prompt });
    await runLog.record({
      runId,
      provider: "runner",
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      usd: result.usd,
    });
    const text = result.text.trim();
    if (!text) throw new Error(`runner returned no text for stage ${stage}`);
    await this.audit(run, `stage:${stage}`, "ok");
    return text;
  }

  /** Run a plan. A completed or in-progress workflow is returned as is; a failed one is retried. */
  async run(plan: FactoryPlan): Promise<FactoryRun> {
    const existing = await this.get(plan.workflowId);
    if (existing && existing.status !== "failed") return existing;
    const created = this.nowIso();
    const run: FactoryRun = {
      plan, status: "queued", citations: [], assets: { drafts: [] }, createdAt: created, updatedAt: created,
    };
    try {
      await this.execute(run);
    } catch (error) {
      run.status = "failed";
      run.error = error instanceof Error ? error.message : String(error);
      await this.audit(run, "failed", run.error).catch(() => undefined);
    }
    await this.save(run);
    return run;
  }

  private async execute(run: FactoryRun): Promise<void> {
    const { plan } = run;
    const { store } = this.deps;
    const tag = plan.workflowId;
    run.status = "running";
    await this.save(run);
    await this.audit(run, "start", plan.contentType);

    const brief = (await store.put({
      kind: "brief", title: `Brief: ${shortTitle(plan.brief)}`, body: plan.brief, tool: "user", tags: [tag, "brief"],
    })).asset;
    run.assets.brief = brief.id;

    // Research: real sources only. No provider, or nothing found, is recorded as such.
    let found: Array<Omit<Citation, "id">> = [];
    if (this.deps.research) found = await this.deps.research.research(plan.brief);
    const valid = found.filter(validCitation);
    run.citations = valid.map((c, index) => ({ ...c, id: `cite-${index + 1}` }));
    await this.audit(run, "stage:research", `${run.citations.length} source(s), ${found.length - valid.length} rejected`);
    const researchBody = run.citations.length
      ? run.citations.map((c) => `- [${c.id}] ${c.title ?? c.url} <${c.url}> (retrieved ${c.retrievedAt})\n  Evidence: ${c.evidence}`).join("\n")
      : "No sources were found.";
    const research = (await store.put({
      kind: "research", title: `Sources: ${shortTitle(plan.brief)}`, body: researchBody, tool: "research",
      parent: brief.id, tags: [tag, "sources"],
    })).asset;
    run.assets.research = research.id;
    const sources = citationsText(run.citations);

    const outline = await this.call(
      run, "plan",
      `Brief:\n${plan.brief}\n\nSources:\n${sources}\n\nProduce a structured outline for this ${plan.contentType}.`,
    );
    const outlineAsset = (await store.put({
      kind: "text", title: `Outline: ${shortTitle(plan.brief)}`, body: outline, tool: "runner",
      parent: research.id, tags: [tag, "outline"],
    })).asset;
    run.assets.outline = outlineAsset.id;

    let draft = await this.call(
      run, "draft",
      `Brief:\n${plan.brief}\n\nSources:\n${sources}\n\nOutline:\n${outline}\n\n` +
        `Write the full ${plan.contentType}. Cite sources inline as [cite-N]. Use only facts found in the sources.`,
    );
    let draftAsset: Asset = (await store.put({
      kind: "text", title: `Draft: ${shortTitle(plan.brief)}`, body: draft, tool: "runner",
      parent: outlineAsset.id, tags: [tag, "draft"],
    })).asset;
    run.assets.drafts = [draftAsset.id];
    await this.audit(run, "stage:assets", "skipped: no media provider configured");
    await this.save(run);

    // Verify, then ask the runner to repair, up to a fixed number of attempts.
    const checks = this.deps.checks ?? defaultChecks;
    const maxRepairs = this.deps.maxRepairAttempts ?? 2;
    const ctx = { citations: run.citations };
    let result = runChecks(checks, draft, ctx);
    let attempts = 0;
    while (result.findings.length > 0 && attempts < maxRepairs) {
      attempts += 1;
      draft = await this.call(
        run, "quality",
        `The draft below failed these checks:\n${result.findings.map((f) => `- ${f}`).join("\n")}\n\n` +
          `Return the full corrected draft only. Remove or correct any claim the sources do not support.\n\n` +
          `Sources:\n${sources}\n\nDraft:\n${draft}`,
      );
      draftAsset = (await store.put({
        kind: "text", title: `Draft (repair ${attempts}): ${shortTitle(plan.brief)}`, body: draft, tool: "runner",
        parent: draftAsset.id, tags: [tag, "draft", "repair"],
      })).asset;
      run.assets.drafts.push(draftAsset.id);
      result = runChecks(checks, draft, ctx);
    }

    const passed = result.findings.length === 0;
    const score = result.totalChecks === 0 ? 100 : Math.round((100 * result.passedChecks) / result.totalChecks);
    const reportBody = [
      "# Quality report", "",
      `Passed: ${passed ? "yes" : "no"}`, `Score: ${score}`, `Repair attempts: ${attempts}`,
      `Citations: ${run.citations.length}`, "",
      passed ? "No findings." : "Findings:", ...result.findings.map((f) => `- ${f}`),
    ].join("\n");
    const reportAsset = (await store.put({
      kind: "text", title: `Quality report: ${shortTitle(plan.brief)}`, body: reportBody, tool: "factory",
      parent: draftAsset.id, tags: [tag, "quality-report"],
    })).asset;
    run.assets.quality = reportAsset.id;
    run.quality = {
      id: reportAsset.id, workflowId: plan.workflowId, passed, score, citationCount: run.citations.length,
      findings: result.findings, repairAttempts: attempts, checkedAt: this.nowIso(),
    };
    if (passed) {
      run.status = "awaiting_approval";
      await this.audit(run, "stage:quality", `passed after ${attempts} repair(s)`);
    } else {
      run.status = "failed";
      run.error = `quality checks failed after ${attempts} repair attempt(s): ${result.findings.join("; ")}`;
      await this.audit(run, "stage:quality", `failed: ${result.findings.length} finding(s)`);
    }
  }

  /** Record a human approval. It must name this exact workflow and tenant. */
  async approve(workflowId: string, approval: Approval): Promise<FactoryRun> {
    const run = await this.mustGet(workflowId);
    if (run.status !== "awaiting_approval") throw new Error(`run is ${run.status}, not awaiting approval`);
    if (!canPublish(run.plan, approval)) throw new Error("approval does not match this workflow");
    run.approval = approval;
    run.status = "approved";
    await this.audit(run, "approved", approval.id);
    await this.save(run);
    return run;
  }

  /** Record that the approved draft was delivered. Never sends anything itself. */
  async publish(workflowId: string, destination = "manual"): Promise<DeliveryRecord> {
    const run = await this.mustGet(workflowId);
    const finalDraft = run.assets.drafts.at(-1);
    if (run.status !== "approved" || !run.approval || !canPublish(run.plan, run.approval) || !finalDraft) {
      throw new Error("not approved: publishing is blocked");
    }
    const record: DeliveryRecord = {
      id: `delivery-${createHash("sha256").update(`${workflowId}|${run.approval.id}`).digest("hex").slice(0, 12)}`,
      workflowId, destination, status: "recorded", approvalId: run.approval.id, assetId: finalDraft,
    };
    run.delivery = record;
    run.status = "published";
    await this.audit(run, "delivery-recorded", `${destination} (no external send)`);
    await this.save(run);
    return record;
  }
}
