import { EVAL_TASKS } from './tasks';
import { summarizeTask, summarizeSuite } from './runner';
import type { SuiteResult, TrialResult, Verdict } from './types';

/**
 * Validates a run posted by CI and rebuilds every aggregate from its trials.
 *
 * The poster's own totals, rates, intervals, notes and model labels are ignored:
 * only per-trial statuses and content are read, and the rest is recomputed here,
 * so a payload cannot claim a pass rate its trials do not support. Offline runs
 * are forced to carry no model name.
 */
export interface PostedRun {
  suite: SuiteResult;
  source: string;
  gitSha: string | null;
}

export type ParseResult = { ok: true; run: PostedRun } | { ok: false; error: string };

const MAX_TRIALS = 200;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseVerdict(v: any): Verdict | null {
  if (!isObj(v) || typeof v.passed !== 'boolean') return null;
  return { graderName: str(v.graderName, 120), passed: v.passed, reason: str(v.reason, 600), gating: v.gating === true, ...(v.skipped === true ? { skipped: true } : {}) };
}

export function parsePostedRun(body: unknown): ParseResult {
  if (!isObj(body)) return { ok: false, error: 'Body must be a JSON object.' };
  const mode = body.mode;
  if (mode !== 'offline' && mode !== 'measured') return { ok: false, error: "mode must be 'offline' or 'measured'." };
  const k = Number(body.k);
  if (!Number.isInteger(k) || k < 1 || k > 50) return { ok: false, error: 'k must be an integer 1..50.' };
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim().slice(0, 80) : null;
  if (mode === 'measured' && !model) return { ok: false, error: 'A measured run must name the model that produced it.' };
  if (!Array.isArray(body.tasks) || body.tasks.length === 0) return { ok: false, error: 'tasks must be a non-empty array.' };

  let trialCount = 0;
  const results = [];
  const seen = new Set<string>();
  for (const t of body.tasks) {
    const spec = isObj(t) ? EVAL_TASKS.find((x) => x.id === t.taskId) : undefined;
    if (!spec) return { ok: false, error: `Unknown taskId: ${isObj(t) ? String(t.taskId) : 'invalid'}.` };
    if (seen.has(spec.id)) return { ok: false, error: `Duplicate task ${spec.id}.` };
    seen.add(spec.id);
    if (!Array.isArray(t.trials)) return { ok: false, error: `${spec.id}: trials must be an array.` };
    const trials: TrialResult[] = [];
    for (const raw of t.trials) {
      if (++trialCount > MAX_TRIALS) return { ok: false, error: `At most ${MAX_TRIALS} trials per run.` };
      if (!isObj(raw) || !['pass', 'fail', 'error'].includes(raw.status)) return { ok: false, error: `${spec.id}: each trial needs status pass|fail|error.` };
      const verdicts = (Array.isArray(raw.verdicts) ? raw.verdicts : []).map(parseVerdict).filter((x): x is Verdict => x !== null);
      // A 'pass' must be backed by at least one gating, passing verdict and no failing one.
      const gating = verdicts.filter((x) => x.gating && !x.skipped);
      if (raw.status === 'pass' && (gating.length === 0 || gating.some((x) => !x.passed)))
        return { ok: false, error: `${spec.id}: trial ${raw.trial} is marked pass but its gating verdicts do not support that.` };
      if (raw.status === 'fail' && gating.every((x) => x.passed) && gating.length > 0)
        return { ok: false, error: `${spec.id}: trial ${raw.trial} is marked fail but every gating verdict passed.` };
      trials.push({
        taskId: spec.id,
        trial: Number.isInteger(raw.trial) ? raw.trial : trials.length + 1,
        status: raw.status,
        verdicts,
        toolCalls: (Array.isArray(raw.toolCalls) ? raw.toolCalls : []).slice(0, 40).map((c: any) => ({
          name: str(c?.name, 80), args: isObj(c?.args) ? c.args : {}, result: isObj(c?.result) ? c.result : {}, latencyMs: Number(c?.latencyMs) || 0, failed: c?.failed === true
        })),
        replies: (Array.isArray(raw.replies) ? raw.replies : []).slice(0, 12).map((r: unknown) => str(r, 2000)),
        userTurns: spec.userTurns,
        latencyMs: Number(raw.latencyMs) || 0,
        ...(raw.error ? { error: str(raw.error, 400) } : {})
      });
    }
    results.push(summarizeTask(spec, trials));
  }

  const started = typeof body.startedAt === 'string' && !Number.isNaN(Date.parse(body.startedAt)) ? body.startedAt : new Date().toISOString();
  const judgeRan = results.some((r) => r.trials.some((t) => t.verdicts.some((v) => !v.gating && !v.skipped)));
  const suite = summarizeSuite(mode, k, results, started, mode === 'measured' ? model : null, judgeRan);
  return { ok: true, run: { suite, source: str(body.source, 40) || 'ci', gitSha: str(body.gitSha, 64) || null } };
}
