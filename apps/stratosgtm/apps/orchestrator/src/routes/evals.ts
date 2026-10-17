import { Router, Request, Response } from 'express';
import { requireOwnerKey } from '../middleware/auth';
import { isDatabaseConfigured } from '../db/client';
import { getLatestEvalRun, saveEvalRun } from '../db/repository/evals';
import { EVAL_TASKS } from '../evals/tasks';
import { runMeasuredSuite, runOfflineSuite, createDeepSeekLLM } from '../evals/runner';
import { parsePostedRun } from '../evals/report';

export const evalsRouter = Router();

/** Stay well under the 60s function cap; unstarted trials are dropped and the run is marked truncated. */
const RUN_BUDGET_MS = 45_000;
const MAX_K_SINGLE_TASK = 5;
const MAX_K_FULL_SUITE = 2;
let running = false;

function deepseekKey(): string | undefined {
  const k = process.env.DEEPSEEK_API_KEY;
  return k && k !== 'your_deepseek_api_key_here' ? k : undefined;
}

/**
 * GET /api/evals/report[?mode=offline]
 *
 * Returns the latest stored run. Never a fabricated fallback: with nothing stored
 * it answers mode:'no_data'. By default a measured run wins over an offline one;
 * an offline run is returned as mode:'offline' and is not a model measurement.
 */
evalsRouter.get('/report', async (req: Request, res: Response) => {
  const tasks = EVAL_TASKS.map((t) => ({ id: t.id, name: t.name }));
  if (!isDatabaseConfigured()) {
    return res.json({ mode: 'no_data', reason: 'no_datastore', availableTasks: tasks });
  }
  try {
    const want = req.query.mode === 'offline' ? ['offline'] : req.query.mode === 'measured' ? ['measured'] : ['measured', 'offline'];
    for (const m of want as Array<'measured' | 'offline'>) {
      const stored = await getLatestEvalRun(m);
      if (stored) {
        return res.json({ mode: stored.suite.mode, runId: stored.id, source: stored.source, gitSha: stored.gitSha, recordedAt: stored.createdAt, run: stored.suite, availableTasks: tasks });
      }
    }
    return res.json({ mode: 'no_data', reason: 'no_runs', availableTasks: tasks });
  } catch (err: any) {
    console.error('[Evals] report failed:', err?.message);
    return res.status(500).json({ error: 'Failed to load eval report', code: 'EVAL_REPORT_FAILED' });
  }
});

/**
 * POST /api/evals/run  { mode?: 'measured'|'offline', taskId?: string, k?: number }
 *
 * Owner-gated: a measured run spends the operator's model quota. Bounded so it
 * fits the 60s function limit: one task with k <= 5, or the whole suite with
 * k <= 2, plus a wall-clock budget after which unstarted trials are skipped and
 * the result says `truncated`. Measured mode needs DEEPSEEK_API_KEY and refuses
 * (503) rather than degrade into something that looks measured.
 */
evalsRouter.post('/run', requireOwnerKey, async (req: Request, res: Response) => {
  const mode = req.body?.mode === 'offline' ? 'offline' : 'measured';
  const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId : undefined;
  if (taskId && !EVAL_TASKS.some((t) => t.id === taskId)) return res.status(400).json({ error: `Unknown taskId ${taskId}`, code: 'EVAL_BAD_TASK' });
  const maxK = taskId ? MAX_K_SINGLE_TASK : MAX_K_FULL_SUITE;
  const k = req.body?.k === undefined ? Math.min(maxK, taskId ? 3 : 1) : Number(req.body.k);
  if (!Number.isInteger(k) || k < 1 || k > maxK) {
    return res.status(400).json({ error: `k must be an integer 1..${maxK} for ${taskId ? 'a single task' : 'the full suite'}.`, code: 'EVAL_BAD_K' });
  }
  const key = deepseekKey();
  if (mode === 'measured' && !key) {
    return res.status(503).json({ error: 'A measured run needs a live model. DEEPSEEK_API_KEY is not set on this server.', code: 'EVAL_NO_MODEL' });
  }
  if (running) return res.status(429).json({ error: 'An eval run is already in progress.', code: 'EVAL_BUSY' });

  running = true;
  try {
    const opts = { k, taskIds: taskId ? [taskId] : undefined };
    const suite =
      mode === 'offline'
        ? await runOfflineSuite(opts)
        : await runMeasuredSuite({ ...opts, llm: createDeepSeekLLM(key), judgeKey: key, deadlineMs: Date.now() + RUN_BUDGET_MS });

    let runId: string | null = null;
    let persisted = false;
    try {
      runId = await saveEvalRun(suite, 'server', null);
      persisted = runId !== null;
    } catch (err: any) {
      console.error('[Evals] persisting run failed:', err?.message);
    }
    return res.json({ mode: suite.mode, runId, persisted, run: suite });
  } catch (err: any) {
    console.error('[Evals] run failed:', err?.message);
    return res.status(500).json({ error: 'Eval run failed', code: 'EVAL_RUN_FAILED' });
  } finally {
    running = false;
  }
});

/**
 * POST /api/evals/runs — CI posts a finished run here. Owner-key gated. Every
 * aggregate is recomputed from the posted trials; see evals/report.ts.
 */
evalsRouter.post('/runs', requireOwnerKey, async (req: Request, res: Response) => {
  const parsed = parsePostedRun(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error, code: 'EVAL_BAD_RUN' });
  if (!isDatabaseConfigured()) {
    return res.status(503).json({ error: 'No datastore configured; the run was not stored.', code: 'EVAL_NO_DATASTORE' });
  }
  try {
    const runId = await saveEvalRun(parsed.run.suite, parsed.run.source, parsed.run.gitSha);
    return res.status(201).json({ runId, mode: parsed.run.suite.mode });
  } catch (err: any) {
    console.error('[Evals] storing posted run failed:', err?.message);
    return res.status(500).json({ error: 'Failed to store eval run', code: 'EVAL_STORE_FAILED' });
  }
});
