/**
 * Real-model smoke test for the content factory with the real research provider.
 *
 *   npx tsx scripts/smoke-factory.ts [model] [url1,url2,...] ["brief"]
 *
 * The model is the `claude` CLI (your existing login; default alias "haiku", the cheapest).
 * Sources are real public pages fetched politely (robots.txt, private-address guard) by WebResearch.
 * Everything is written to a temp folder that is deleted at the end. Expect a few US cents at most.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RunLog, VaultMemoryStore, runLogDir } from "../packages/core/src/index.ts";
import {
  ClaudeCliRunner, ContentFactory, createPlan, defaultChecks, runChecks,
  type AgentRunner, type RunnerRequest,
} from "../packages/factory/src/index.ts";
import { WebResearch } from "../packages/research/src/index.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const model = process.argv[2] ?? "haiku";
  const urls = (process.argv[3] ?? "https://raw.githubusercontent.com/heygen-com/hyperframes/main/README.md").split(",").map((u) => u.trim());
  const brief = process.argv[4] ?? "Write a short article (about 200 words) explaining what the project in the sources is and who it is for. Use only the provided sources.";
  const scratch = await mkdtemp(path.join(os.tmpdir(), "reforge-smoke-factory-"));
  console.log(`model: ${model}\nsources: ${urls.join("\n         ")}\n`);

  try {
    const vault = path.join(scratch, "vault");
    const store = new VaultMemoryStore(vault);
    const runLog = new RunLog(runLogDir(vault));
    const inner = new ClaudeCliRunner({ model, maxBudgetUsd: 0.25 });
    let calls = 0;
    const runner: AgentRunner = { run: (request: RunnerRequest) => (calls += 1, inner.run(request)) };
    const skipped: string[] = [];
    const research = new WebResearch({ urls, onError: (url, error) => skipped.push(`${url}: ${error.message}`) });
    const factory = new ContentFactory({
      runner, research, store, runLog, budgetUsd: 0.5, maxRepairAttempts: 2, stateDir: path.join(scratch, "state"),
    });
    const plan = createPlan({ tenantSlug: "smoke", brief });

    const started = Date.now();
    const run = await factory.run(plan);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const total = await runLog.total(plan.workflowId);

    console.log(`status: ${run.status}${run.error ? `  error: ${run.error}` : ""}`);
    console.log(`time: ${seconds}s  model calls: ${calls}  cost: $${total.usd.toFixed(5)}  tokens in/out: ${total.inputTokens}/${total.outputTokens}`);
    console.log(`sources used: ${run.citations.length}/${urls.length}  repair attempts: ${run.quality?.repairAttempts ?? "n/a"}  quality score: ${run.quality?.score ?? "n/a"}`);
    for (const c of run.citations) console.log(`  [${c.id}] ${c.title} <${c.url}> (${c.evidence.length} chars of evidence)`);
    for (const s of skipped) console.log(`  skipped: ${s}`);
    if (run.quality && run.quality.findings.length) console.log(`findings:\n${run.quality.findings.map((f) => `  - ${f}`).join("\n")}`);

    const finalId = run.assets.drafts.at(-1);
    const finalNote = finalId ? await store.read(finalId) : null;
    const draft = finalNote?.body.replace(/^\n# .*\n\n(Parent: \[\[.*\]\]\n\n)?/, "").trim() ?? "";
    console.log(`\n----- final draft (${draft.length} chars) -----\n${draft}\n----- end -----\n`);

    check("the run ended in a defined state", run.status === "awaiting_approval" || run.status === "failed", run.status);
    check("at least one real source was used", run.citations.length >= 1, `${run.citations.length}`);
    check("cost was recorded and stayed under the cap", total.usd > 0 && total.usd < 0.5, `$${total.usd.toFixed(5)}`);
    check("every stage output has lineage back to the brief",
      !!finalId && (await store.lineage(finalId)).length >= 4 && (await store.lineage(finalId))[0]!.id === run.assets.brief);
    const cited = [...draft.matchAll(/\[cite-(\d+)\]/g)].map((m) => `cite-${m[1]}`);
    check("citation markers in the draft refer to real sources", cited.every((id) => run.citations.some((c) => c.id === id)),
      cited.length ? `${cited.length} marker(s), ${new Set(cited).size} distinct source(s)` : "the model used no [cite-N] markers");
    if (run.status === "awaiting_approval") {
      const verdict = runChecks(defaultChecks, draft, { citations: run.citations });
      check("independent re-check: every figure in the approved draft is sourced", verdict.findings.length === 0, verdict.findings.join("; "));
    } else {
      console.log("NOTE  the run failed quality checks honestly; no draft was offered for approval");
    }

    await factory.publish(plan.workflowId).then(
      () => check("publishing is blocked before approval", false),
      () => check("publishing is blocked before approval", true),
    );
    if (run.status === "awaiting_approval") {
      const before = calls;
      await factory.approve(plan.workflowId, {
        id: "smoke-approval", workflowId: plan.workflowId, tenantSlug: plan.tenantSlug,
        approvedBy: "smoke-test", approvedAt: new Date().toISOString(),
      });
      const delivery = await factory.publish(plan.workflowId);
      check("approved run records a delivery without any further model call", delivery.status === "recorded" && calls === before,
        `${delivery.destination}, no external send`);
    }
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
