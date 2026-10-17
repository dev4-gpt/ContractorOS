import { desc, eq } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../client';
import { evalRuns, evalTrials } from '../schema';
import { summarizeTask } from '../../evals/runner';
import { EVAL_TASKS } from '../../evals/tasks';
import type { SuiteResult, TaskResult, TrialResult } from '../../evals/types';

export interface StoredRun {
  id: string;
  source: string;
  gitSha: string | null;
  createdAt: string;
  suite: SuiteResult;
}

/** Persists a run and its trials. Returns null (and writes nothing) when no database is configured. */
export async function saveEvalRun(suite: SuiteResult, source: string, gitSha: string | null): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  // Trials are stored in eval_trials; the summary keeps only the aggregates.
  const { tasks, ...aggregates } = suite;
  const [row] = await db
    .insert(evalRuns)
    .values({
      mode: suite.mode,
      suite: suite.suite,
      model: suite.model,
      k: suite.k,
      totalTasks: suite.totalTasks,
      totalTrials: suite.totalTrials,
      erroredTrials: suite.erroredTrials,
      source,
      gitSha,
      summary: aggregates as any,
      startedAt: new Date(suite.startedAt),
      finishedAt: new Date(suite.finishedAt)
    })
    .returning({ id: evalRuns.id });

  const trialRows = tasks.flatMap((t) =>
    t.trials.map((tr) => ({
      runId: row.id,
      taskId: tr.taskId,
      trial: tr.trial,
      status: tr.status,
      latencyMs: Math.round(tr.latencyMs || 0),
      payload: { verdicts: tr.verdicts, toolCalls: tr.toolCalls, replies: tr.replies, userTurns: tr.userTurns, error: tr.error } as any
    }))
  );
  try {
    if (trialRows.length > 0) await db.insert(evalTrials).values(trialRows);
  } catch (err) {
    // A run without its trials would report aggregates nothing backs up.
    await db.delete(evalRuns).where(eq(evalRuns.id, row.id));
    throw err;
  }
  return row.id;
}

async function hydrate(row: typeof evalRuns.$inferSelect): Promise<StoredRun> {
  const db = getDb();
  const trialRows = await db.select().from(evalTrials).where(eq(evalTrials.runId, row.id));
  const byTask = new Map<string, TrialResult[]>();
  for (const r of trialRows) {
    const p = r.payload as any;
    const t: TrialResult = {
      taskId: r.taskId,
      trial: r.trial,
      status: r.status as TrialResult['status'],
      verdicts: p.verdicts ?? [],
      toolCalls: p.toolCalls ?? [],
      replies: p.replies ?? [],
      userTurns: p.userTurns ?? [],
      latencyMs: r.latencyMs,
      ...(p.error ? { error: p.error } : {})
    };
    byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), t]);
  }
  // Rebuild per-task aggregates from the stored trials (single source of truth).
  const tasks: TaskResult[] = EVAL_TASKS.filter((t) => byTask.has(t.id)).map((t) =>
    summarizeTask(t, (byTask.get(t.id) as TrialResult[]).sort((a, b) => a.trial - b.trial))
  );
  const summary = row.summary as Omit<SuiteResult, 'tasks'>;
  return {
    id: row.id,
    source: row.source,
    gitSha: row.gitSha,
    createdAt: row.createdAt.toISOString(),
    suite: { ...summary, tasks }
  };
}

export async function getLatestEvalRun(mode: 'measured' | 'offline'): Promise<StoredRun | null> {
  if (!isDatabaseConfigured()) return null;
  const [row] = await getDb().select().from(evalRuns).where(eq(evalRuns.mode, mode)).orderBy(desc(evalRuns.createdAt)).limit(1);
  return row ? hydrate(row) : null;
}
