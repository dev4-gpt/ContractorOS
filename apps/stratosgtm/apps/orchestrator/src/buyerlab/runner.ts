import { BuyerLabNotFoundError, BuyerLabStore } from './store';
import { CONVERSE_CALL_RESERVE, type Progress, type ProviderId, type Run, type SimulationProvider } from './types';

export const MAX_CALL_BUDGET = 60;
/** Room for retries on top of the one react call each persona costs. */
const REACT_OVERHEAD = 2;

/**
 * The budget a run gets when the caller names none. A self-test project is the only one whose
 * runs attempt the converse step, and each converse step reserves CONVERSE_CALL_RESERVE calls
 * before it starts, so a self-test run must be able to afford that reservation — otherwise every
 * converse step is denied before it makes a single call. Non-self-test runs never attempt
 * converse and keep the original, cheaper formula.
 */
export function defaultCallBudget(personaCount: number, selfTest: boolean): number {
  const perPersona = selfTest ? 1 + CONVERSE_CALL_RESERVE : 1;
  return Math.min(MAX_CALL_BUDGET, personaCount * perPersona + REACT_OVERHEAD);
}
/** How long one poll may work. Vercel's function limit in vercel.json is 60 s. */
export const ADVANCE_WINDOW_MS = 45_000;

export class RunNotReadyError extends Error {
  constructor(public readonly code: 'NO_SOURCES' | 'NO_PANEL' | 'BAD_BUDGET') {
    super(
      code === 'NO_SOURCES' ? 'Add at least one source (a crawled URL or pasted text) first.'
      : code === 'NO_PANEL' ? 'Create a panel of buyers first.'
      : 'The call budget must be a whole number of at least 1.'
    );
    this.name = 'RunNotReadyError';
  }
}
export class ProviderUnavailableError extends Error {
  constructor(public readonly provider: ProviderId) {
    super(`The ${provider} engine is not available.`);
    this.name = 'ProviderUnavailableError';
  }
}

export interface RunnerDeps {
  store: BuyerLabStore;
  provider: (id: ProviderId) => SimulationProvider | null;
  now?: () => number;
}

const TERMINAL = new Set(['done', 'failed', 'budget_exhausted']);

export async function startRun(
  deps: RunnerDeps,
  input: { tenantId: string; projectId: string; provider: ProviderId; fundedBy: 'byok' | 'server_grant'; callBudget?: number }
): Promise<Run> {
  const { store } = deps;
  const project = await store.getProject(input.tenantId, input.projectId);
  if (!project) throw new BuyerLabNotFoundError('project');
  const provider = deps.provider(input.provider);
  if (!provider) throw new ProviderUnavailableError(input.provider);

  // An agent transcript is not evidence about the client's copy, so it is never part of a run's sources.
  const sources = (await store.listSources(input.tenantId, input.projectId)).filter((s) => s.kind !== 'agent');
  const personas = await store.listPersonas(input.tenantId, input.projectId);
  if (sources.length === 0) throw new RunNotReadyError('NO_SOURCES');
  if (personas.length === 0) throw new RunNotReadyError('NO_PANEL');

  let callBudget = defaultCallBudget(personas.length, project.selfTest);
  if (input.callBudget !== undefined) {
    if (!Number.isInteger(input.callBudget) || input.callBudget < 1) throw new RunNotReadyError('BAD_BUDGET');
    callBudget = Math.min(MAX_CALL_BUDGET, input.callBudget);
  }

  const run = await store.createRun(input.tenantId, {
    projectId: input.projectId,
    provider: input.provider,
    config: { personaIds: personas.map((p) => p.id), sourceIds: sources.map((s) => s.id) },
    callBudget,
    fundedBy: input.fundedBy
  });
  try {
    await provider.start({ runId: run.id, tenantId: input.tenantId, projectId: input.projectId, personaIds: run.config.personaIds, sourceIds: run.config.sourceIds, callBudget });
  } catch (err) {
    await store.updateRun(input.tenantId, run.id, { status: 'failed', errorCode: 'START_FAILED', finishedAt: new Date((deps.now ?? Date.now)()).toISOString() });
    throw err;
  }
  return run;
}

export async function advanceRun(deps: RunnerDeps, tenantId: string, runId: string): Promise<{ run: Run; progress: Progress | null }> {
  const { store } = deps;
  const now = deps.now ?? (() => Date.now());
  const run = await store.getRun(tenantId, runId);
  if (!run) throw new BuyerLabNotFoundError('run');
  if (TERMINAL.has(run.status)) return { run, progress: null };

  const provider = deps.provider(run.provider);
  if (!provider) throw new ProviderUnavailableError(run.provider);
  if (run.status === 'queued') await store.updateRun(tenantId, runId, { status: 'running', startedAt: new Date(now()).toISOString() });

  const handle = { runId, tenantId };
  const progress = await provider.advance(handle, { deadlineAt: now() + ADVANCE_WINDOW_MS });

  if (progress.done) {
    const finishedAt = new Date(now()).toISOString();
    if (progress.completedSteps === 0) {
      await store.updateRun(tenantId, runId, { status: 'failed', errorCode: 'NO_RESULTS', finishedAt });
    } else {
      await store.saveOutcome(tenantId, runId, await provider.outcome(handle));
      const unfinished = progress.completedSteps + progress.failedSteps < progress.totalSteps;
      await store.updateRun(tenantId, runId, { status: progress.budgetExhausted && unfinished ? 'budget_exhausted' : 'done', finishedAt });
    }
  }
  const updated = await store.getRun(tenantId, runId);
  if (!updated) throw new BuyerLabNotFoundError('run');
  return { run: updated, progress };
}

/**
 * Re-runs a prior run's SAME persona panel against a possibly-changed source set. Deliberately
 * duplicates a small amount of startRun's body (project/provider lookup, budget clamping, the
 * create-then-provider.start try/catch) rather than sharing a private helper, keeping startRun's
 * heavily-reviewed code untouched and this function's risk isolated.
 */
export async function retestRun(
  deps: RunnerDeps,
  input: { tenantId: string; projectId: string; baseRunId: string; provider: ProviderId; fundedBy: 'byok' | 'server_grant'; sourceIds?: string[]; callBudget?: number }
): Promise<Run> {
  const { store } = deps;
  const project = await store.getProject(input.tenantId, input.projectId);
  if (!project) throw new BuyerLabNotFoundError('project');
  const baseRun = await store.getRun(input.tenantId, input.baseRunId);
  if (!baseRun || baseRun.projectId !== input.projectId) throw new BuyerLabNotFoundError('run');
  const provider = deps.provider(input.provider);
  if (!provider) throw new ProviderUnavailableError(input.provider);

  const currentSources = (await store.listSources(input.tenantId, input.projectId)).filter((s) => s.kind !== 'agent');
  const requested = input.sourceIds?.filter((id) => currentSources.some((s) => s.id === id)) ?? [];
  const sourceIds = requested.length > 0 ? requested : currentSources.map((s) => s.id);
  if (sourceIds.length === 0) throw new RunNotReadyError('NO_SOURCES');
  // Re-test reuses the SAME persona ids the base run used; the panel is not re-inferred.
  const personaIds = baseRun.config.personaIds;
  if (personaIds.length === 0) throw new RunNotReadyError('NO_PANEL');

  let callBudget = defaultCallBudget(personaIds.length, project.selfTest);
  if (input.callBudget !== undefined) {
    if (!Number.isInteger(input.callBudget) || input.callBudget < 1) throw new RunNotReadyError('BAD_BUDGET');
    callBudget = Math.min(MAX_CALL_BUDGET, input.callBudget);
  }

  const run = await store.createRun(input.tenantId, { projectId: input.projectId, provider: input.provider, config: { personaIds, sourceIds }, callBudget, fundedBy: input.fundedBy });
  try {
    await provider.start({ runId: run.id, tenantId: input.tenantId, projectId: input.projectId, personaIds, sourceIds, callBudget });
  } catch (err) {
    await store.updateRun(input.tenantId, run.id, { status: 'failed', errorCode: 'START_FAILED', finishedAt: new Date((deps.now ?? Date.now)()).toISOString() });
    throw err;
  }
  return run;
}
