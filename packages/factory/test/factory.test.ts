import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RunLog, VaultMemoryStore, runLogDir } from "@reforge/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ContentFactory,
  canPublish,
  createPlan,
  type AgentRunner,
  type Approval,
  type FactoryPlan,
  type FactoryDeps,
  type ResearchProvider,
  type RunnerRequest,
  type RunnerResult,
} from "../src/index.js";

class FakeRunner implements AgentRunner {
  calls: RunnerRequest[] = [];
  constructor(private readonly responses: Array<string | RunnerResult>) {}
  async run(request: RunnerRequest): Promise<RunnerResult> {
    this.calls.push(request);
    const next = this.responses.shift();
    if (next === undefined) throw new Error("no more scripted responses");
    return typeof next === "string" ? { text: next } : next;
  }
}

function researchWith(evidence: string): ResearchProvider {
  return {
    research: async () => [
      { url: "https://example.com/study", title: "Study", retrievedAt: "2026-10-16T10:00:00.000Z", evidence },
    ],
  };
}

function approvalFor(plan: FactoryPlan): Approval {
  return {
    id: "appr-1", workflowId: plan.workflowId, tenantSlug: plan.tenantSlug,
    approvedBy: "Owner", approvedAt: "2026-10-16T12:00:00.000Z",
  };
}

let base: string;
beforeEach(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), "reforge-factory-"));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function setup(runner: AgentRunner, extra: Partial<FactoryDeps> = {}) {
  const vault = path.join(base, "vault");
  const store = new VaultMemoryStore(vault);
  const runLog = new RunLog(runLogDir(vault));
  const factory = new ContentFactory({ runner, store, runLog, ...extra });
  const plan = createPlan({ tenantSlug: "acme", brief: "Explain why fast replies win more leads" });
  return { store, runLog, factory, plan };
}

describe("createPlan", () => {
  it("derives a stable workflow id from the request", () => {
    const a = createPlan({ tenantSlug: "acme", brief: "Explain why fast replies win more leads" });
    const b = createPlan({ tenantSlug: "acme", brief: "Explain why fast replies win more leads" });
    expect(a.workflowId).toBe(b.workflowId);
    expect(a.workflowId).toMatch(/^content-acme-[0-9a-f]{12}$/);
    expect(a.autoPublish).toBe(false);
    expect(a.stages).toHaveLength(8);
    const others = [
      createPlan({ tenantSlug: "acme", brief: "Explain why slow replies lose more leads" }),
      createPlan({ tenantSlug: "acme", brief: "Explain why fast replies win more leads", idempotencyKey: "second" }),
      createPlan({ tenantSlug: "acme", brief: "Explain why fast replies win more leads", contentType: "email" }),
    ];
    for (const other of others) expect(other.workflowId).not.toBe(a.workflowId);
  });

  it("cleans control characters and rejects invalid input", () => {
    const plan = createPlan({ tenantSlug: "acme", brief: "Explain\u0000 why\nfast replies win" });
    expect(plan.brief).not.toMatch(/[\u0000-\u001f]/);
    expect(() => createPlan({ tenantSlug: "Bad Slug", brief: "long enough brief here" })).toThrow(/tenantSlug/);
    expect(() => createPlan({ tenantSlug: "acme", brief: "short" })).toThrow(/too short/);
    expect(() => createPlan({ tenantSlug: "acme", brief: "long enough brief here", contentType: "podcast" as never })).toThrow(/contentType/);
    expect(() => createPlan({ tenantSlug: "acme", brief: "long enough brief here", idempotencyKey: "bad key!" })).toThrow(/idempotencyKey/);
    expect(() => createPlan({ tenantSlug: "acme", brief: "long enough brief here", workflowId: "../x" })).toThrow(/workflowId/);
  });
});

describe("canPublish", () => {
  it("accepts only a complete approval for this workflow and tenant", () => {
    const plan = createPlan({ tenantSlug: "acme", brief: "Explain why fast replies win more leads" });
    const good = approvalFor(plan);
    expect(canPublish(plan, good)).toBe(true);
    expect(canPublish(plan, null)).toBe(false);
    expect(canPublish(plan, { ...good, workflowId: "content-acme-000000000000" })).toBe(false);
    expect(canPublish(plan, { ...good, tenantSlug: "other" })).toBe(false);
    expect(canPublish(plan, { ...good, approvedBy: " " })).toBe(false);
    expect(canPublish(plan, { ...good, approvedAt: "not a date" })).toBe(false);
    expect(canPublish(plan, { ...good, id: "" })).toBe(false);
  });
});

describe("ContentFactory", () => {
  const evidence = "Replying within 5 minutes lifted conversions by 21x in the study.";
  const meta = { model: "m", inputTokens: 10, outputTokens: 5, usd: 0.01 };

  it("runs brief to approval gate with lineage, sources and cost", async () => {
    const runner = new FakeRunner([
      { text: "Outline: intro, evidence", ...meta },
      { text: "Fast replies matter: conversions rose 21x [cite-1].", ...meta },
    ]);
    const { store, runLog, factory, plan } = setup(runner, { research: researchWith(evidence) });
    const run = await factory.run(plan);

    expect(run.status).toBe("awaiting_approval");
    expect(run.quality).toMatchObject({ passed: true, score: 100, repairAttempts: 0, citationCount: 1 });
    expect(run.citations[0]).toMatchObject({ id: "cite-1", url: "https://example.com/study" });
    expect(runner.calls.map((c) => c.stage)).toEqual(["plan", "draft"]);
    for (const call of runner.calls) expect(call.system).toContain("Never publish");
    const chain = await store.lineage(run.assets.drafts[0]!);
    expect(chain.map((a) => a.id)).toEqual([run.assets.brief, run.assets.research, run.assets.outline, run.assets.drafts[0]]);
    const total = await runLog.total(plan.workflowId);
    expect(total.entries).toBe(2);
    expect(total.usd).toBeCloseTo(0.02);
    const actions = (await runLog.entries(plan.workflowId)).flatMap((l) => (l.type === "audit" ? [l.action] : []));
    expect(actions).toEqual(expect.arrayContaining(["start", "stage:research", "stage:plan", "stage:draft", "stage:assets", "stage:quality"]));
  });

  it("asks the runner to repair an unsourced figure and records both drafts", async () => {
    const runner = new FakeRunner([
      "Outline",
      "Leads convert 340% better.",
      "Leads convert at 42% when replied to fast [cite-1].",
    ]);
    const { store, factory, plan } = setup(runner, { research: researchWith("Replies within 5 minutes converted at 42%.") });
    const run = await factory.run(plan);

    expect(run.status).toBe("awaiting_approval");
    expect(run.quality?.repairAttempts).toBe(1);
    expect(runner.calls.map((c) => c.stage)).toEqual(["plan", "draft", "quality"]);
    expect(runner.calls[2]!.prompt).toContain("[unsourced-figures]");
    expect(runner.calls[2]!.prompt).toContain("340%");
    expect(run.assets.drafts).toHaveLength(2);
    expect((await store.lineage(run.assets.drafts[1]!)).map((a) => a.id)).toContain(run.assets.drafts[0]);
  });

  it("fails honestly when repairs do not fix the draft", async () => {
    const runner = new FakeRunner(["Outline", "Leads convert 340% better.", "Still 340% better."]);
    const { store, factory, plan } = setup(runner, {
      research: researchWith("Replies within 5 minutes converted at 42%."), maxRepairAttempts: 1,
    });
    const run = await factory.run(plan);

    expect(run.status).toBe("failed");
    expect(run.quality).toMatchObject({ passed: false, repairAttempts: 1 });
    expect(run.quality?.findings.join(" ")).toContain("340%");
    expect(run.error).toMatch(/quality checks failed/);
    expect(await store.get(run.assets.quality!)).not.toBeNull();
  });

  it("does not invent sources when no research provider is configured", async () => {
    const runner = new FakeRunner(["Outline", "A draft without numbers."]);
    const { store, factory, plan } = setup(runner, { maxRepairAttempts: 0 });
    const run = await factory.run(plan);

    expect(run.citations).toEqual([]);
    expect(run.status).toBe("failed");
    expect(run.quality?.findings[0]).toContain("[citations]");
    const note = await store.read(run.assets.research!);
    expect(note?.body).toContain("No sources were found.");
  });

  it("rejects malformed sources from a research provider", async () => {
    const runner = new FakeRunner(["Outline", "Draft [cite-1]."]);
    const research: ResearchProvider = {
      research: async () => [
        { url: "javascript:alert(1)", retrievedAt: "2026-10-16T10:00:00.000Z", evidence: "x" },
        { url: "https://example.com/a", retrievedAt: "not a date", evidence: "x" },
        { url: "https://example.com/b", retrievedAt: "2026-10-16T10:00:00.000Z", evidence: "  " },
        { url: "https://example.com/ok", retrievedAt: "2026-10-16T10:00:00.000Z", evidence: "Real evidence." },
      ],
    };
    const { factory, plan } = setup(runner, { research });
    const run = await factory.run(plan);
    expect(run.citations.map((c) => c.url)).toEqual(["https://example.com/ok"]);
  });

  it("stops starting paid steps once the budget is reached", async () => {
    const runner = new FakeRunner([{ text: "Outline", usd: 0.5 }, { text: "Draft 21x", usd: 0.5 }]);
    const { factory, plan } = setup(runner, { research: researchWith(evidence), budgetUsd: 0.4 });
    const run = await factory.run(plan);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/budget/);
    expect(runner.calls).toHaveLength(1);
  });

  it("blocks publishing until a matching human approval exists, and never calls the runner", async () => {
    const runner = new FakeRunner(["Outline", "Fast replies matter: conversions rose 21x [cite-1]."]);
    const { factory, plan } = setup(runner, { research: researchWith(evidence) });
    const run = await factory.run(plan);
    expect(runner.calls).toHaveLength(2);

    await expect(factory.publish(plan.workflowId)).rejects.toThrow(/not approved/);
    await expect(
      factory.approve(plan.workflowId, { ...approvalFor(plan), workflowId: "content-acme-000000000000" }),
    ).rejects.toThrow(/does not match/);

    expect((await factory.approve(plan.workflowId, approvalFor(plan))).status).toBe("approved");
    const record = await factory.publish(plan.workflowId);
    expect(record).toMatchObject({
      status: "recorded", destination: "manual", approvalId: "appr-1", assetId: run.assets.drafts.at(-1),
    });
    expect((await factory.get(plan.workflowId))?.status).toBe("published");
    await expect(factory.approve(plan.workflowId, approvalFor(plan))).rejects.toThrow(/not awaiting approval/);
    expect(runner.calls).toHaveLength(2);
  });

  it("returns the existing run for the same plan and keeps state across instances", async () => {
    const stateDir = path.join(base, "state");
    const runner = new FakeRunner(["Outline", "Fast replies matter: conversions rose 21x [cite-1]."]);
    const first = setup(runner, { research: researchWith(evidence), stateDir });
    await first.factory.run(first.plan);
    const again = await first.factory.run(first.plan);
    expect(again.status).toBe("awaiting_approval");
    expect(runner.calls).toHaveLength(2);

    const emptyRunner = new FakeRunner([]);
    const second = setup(emptyRunner, { stateDir });
    expect((await second.factory.get(first.plan.workflowId))?.status).toBe("awaiting_approval");
    expect((await second.factory.run(first.plan)).status).toBe("awaiting_approval");
    expect(emptyRunner.calls).toHaveLength(0);
  });
});
