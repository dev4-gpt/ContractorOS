import { startRun, advanceRun, retestRun, defaultCallBudget, ProviderUnavailableError, MAX_CALL_BUDGET, ADVANCE_WINDOW_MS, RunnerDeps } from '../../buyerlab/runner';
import { BuyerLabNotFoundError } from '../../buyerlab/store';
import { NativeProvider } from '../../buyerlab/nativeProvider';
import { MemoryBuyerLabStore, mkPersona, reply } from './helpers';
import type { NormalizedOutcome, Progress, SimulationProvider } from '../../buyerlab/types';

const T = 'tenant-a';
let now = 9_000_000;
const clock = () => now;

const src = (over: Record<string, unknown> = {}) => ({ kind: 'crawl' as const, surface: 'public' as const, label: 'Home', url: 'https://a.com/', contentHash: 'h1', text: 'Pricing is by signed proposal only. '.repeat(3), meta: {}, ...over });
const person = (name: string) => { const { id, projectId, ...rest } = mkPersona({ spec: { ...mkPersona().spec, name } }); return rest; };

async function seed(opts: { sources?: any[]; personas?: number } = {}) {
  const store = new MemoryBuyerLabStore(clock);
  const project = await store.createProject(T, { name: 'Veloce', targetUrl: null, brief: null, selfTest: false });
  await store.addSources(T, project.id, opts.sources ?? [src()]);
  await store.replacePanel(T, project.id, Array.from({ length: opts.personas ?? 3 }, (_, i) => person(`P${i}`)));
  return { store, project };
}

function fakeProvider(progress: Partial<Progress> = {}, outcome: Partial<NormalizedOutcome> = {}) {
  const p = {
    id: 'native' as const,
    start: jest.fn(async (run) => ({ runId: run.runId, tenantId: run.tenantId })),
    advance: jest.fn(async (_handle: unknown, _budget: unknown) => ({ done: false, completedSteps: 0, failedSteps: 0, totalSteps: 3, callsUsed: 0, budgetExhausted: false, ...progress })),
    outcome: jest.fn(async () => ({ provider: 'native', panelSize: 3, personas: [], ...outcome }) as NormalizedOutcome),
    chat: jest.fn()
  };
  return p;
}
const deps = (store: MemoryBuyerLabStore, provider: SimulationProvider | null): RunnerDeps => ({ store, provider: (id) => (id === 'native' ? provider : null), now: clock });

describe('startRun', () => {
  beforeEach(() => {
    now = 9_000_000;
  });
  const input = (projectId: string, extra: Record<string, unknown> = {}) => ({ tenantId: T, projectId, provider: 'native' as const, fundedBy: 'byok' as const, ...extra });

  it('snapshots the panel and the non-agent sources, defaults the budget to personas + 2, and starts the provider', async () => {
    const { store, project } = await seed();
    await store.addSources(T, project.id, [src({ kind: 'agent', contentHash: 'tx', text: 'Anna: hello there friend.' })]);
    const provider = fakeProvider();
    const run = await startRun(deps(store, provider), input(project.id));
    expect(run).toMatchObject({ status: 'queued', callBudget: 5, fundedBy: 'byok', provider: 'native', callsUsed: 0 });
    expect(run.config.personaIds).toHaveLength(3);
    expect(run.config.sourceIds).toHaveLength(1);
    expect(provider.start).toHaveBeenCalledTimes(1);
    expect(provider.start.mock.calls[0][0]).toMatchObject({ runId: run.id, tenantId: T, projectId: project.id, callBudget: 5 });
  });

  it("sizes a self_test project's default budget for the converse reservation each persona makes", async () => {
    const store = new MemoryBuyerLabStore(clock);
    const project = await store.createProject(T, { name: 'Anna self-test', targetUrl: null, brief: null, selfTest: true });
    await store.addSources(T, project.id, [src()]);
    await store.replacePanel(T, project.id, Array.from({ length: 3 }, (_, i) => person(`P${i}`)));
    const run = await startRun(deps(store, fakeProvider()), input(project.id));
    // Without this, every converse step is denied BUDGET before it makes a single model call.
    expect(run.callBudget).toBe(defaultCallBudget(3, true));
    expect(run.callBudget).toBeGreaterThan(defaultCallBudget(3, false));
  });

  it('clamps an explicit budget to 1..MAX_CALL_BUDGET', async () => {
    const { store, project } = await seed();
    const d = deps(store, fakeProvider());
    expect((await startRun(d, input(project.id, { callBudget: 9999 }))).callBudget).toBe(MAX_CALL_BUDGET);
    expect((await startRun(d, input(project.id, { callBudget: 2 }))).callBudget).toBe(2);
    await expect(startRun(d, input(project.id, { callBudget: 0 }))).rejects.toMatchObject({ code: 'BAD_BUDGET' });
    await expect(startRun(d, input(project.id, { callBudget: 1.5 }))).rejects.toMatchObject({ code: 'BAD_BUDGET' });
  });

  it('refuses a project that is not the tenant\'s, has no sources, has no panel, or names an absent provider', async () => {
    const { store, project } = await seed();
    const d = deps(store, fakeProvider());
    await expect(startRun(d, { ...input(project.id), tenantId: 'tenant-b' })).rejects.toBeInstanceOf(BuyerLabNotFoundError);

    const noSources = await seed({ sources: [src({ kind: 'agent' })] });
    await expect(startRun(deps(noSources.store, fakeProvider()), input(noSources.project.id))).rejects.toMatchObject({ name: 'RunNotReadyError', code: 'NO_SOURCES' });

    const noPanel = await seed({ personas: 0 });
    await expect(startRun(deps(noPanel.store, fakeProvider()), input(noPanel.project.id))).rejects.toMatchObject({ code: 'NO_PANEL' });

    await expect(startRun(d, input(project.id, { provider: 'mirofish' }))).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('marks the run failed if the provider cannot start it, and rethrows', async () => {
    const { store, project } = await seed();
    const provider = fakeProvider();
    provider.start.mockRejectedValue(new Error('nope'));
    const created: string[] = [];
    const original = store.createRun.bind(store);
    store.createRun = async (t, i) => {
      const r = await original(t, i);
      created.push(r.id);
      return r;
    };
    await expect(startRun(deps(store, provider), input(project.id))).rejects.toThrow('nope');
    expect(await store.getRun(T, created[0])).toMatchObject({ status: 'failed', errorCode: 'START_FAILED' });
  });
});

describe('advanceRun', () => {
  beforeEach(() => {
    now = 9_000_000;
  });
  async function started(provider: ReturnType<typeof fakeProvider>) {
    const { store, project } = await seed();
    const d = deps(store, provider);
    const run = await startRun(d, { tenantId: T, projectId: project.id, provider: 'native', fundedBy: 'byok' });
    return { store, d, run };
  }

  it('marks the run running, gives the provider a 45 s window, and saves nothing until done', async () => {
    const provider = fakeProvider();
    const { store, d, run } = await started(provider);
    const r = await advanceRun(d, T, run.id);
    expect(provider.advance.mock.calls[0][1]).toEqual({ deadlineAt: clock() + ADVANCE_WINDOW_MS });
    expect(r.run.status).toBe('running');
    expect(r.run.startedAt).toBe(new Date(clock()).toISOString());
    expect(await store.getOutcome(T, run.id)).toBeNull();
    expect(provider.outcome).not.toHaveBeenCalled();
  });

  it('saves the outcome and finishes when the provider is done, then stops calling the provider', async () => {
    const provider = fakeProvider({ done: true, completedSteps: 3 });
    const { store, d, run } = await started(provider);
    const r = await advanceRun(d, T, run.id);
    expect(r.run.status).toBe('done');
    expect(r.run.finishedAt).not.toBeNull();
    expect(await store.getOutcome(T, run.id)).toMatchObject({ provider: 'native' });
    await advanceRun(d, T, run.id);
    expect(provider.advance).toHaveBeenCalledTimes(1);
  });

  it('ends budget_exhausted, keeping the partial outcome, when the budget ran out with steps left', async () => {
    const provider = fakeProvider({ done: true, completedSteps: 2, failedSteps: 0, totalSteps: 3, budgetExhausted: true });
    const { store, d, run } = await started(provider);
    expect((await advanceRun(d, T, run.id)).run.status).toBe('budget_exhausted');
    expect(await store.getOutcome(T, run.id)).not.toBeNull();
  });

  it('is done (with a partial outcome) when every step finished but some failed', async () => {
    const provider = fakeProvider({ done: true, completedSteps: 2, failedSteps: 1, totalSteps: 3 });
    const { d, run } = await started(provider);
    expect((await advanceRun(d, T, run.id)).run.status).toBe('done');
  });

  it('fails the run, saving no outcome, when no step completed', async () => {
    const provider = fakeProvider({ done: true, completedSteps: 0, failedSteps: 3, totalSteps: 3 });
    const { store, d, run } = await started(provider);
    const r = await advanceRun(d, T, run.id);
    expect(r.run).toMatchObject({ status: 'failed', errorCode: 'NO_RESULTS' });
    expect(await store.getOutcome(T, run.id)).toBeNull();
    expect(provider.outcome).not.toHaveBeenCalled();
  });

  it('answers not-found for another tenant\'s run', async () => {
    const { d, run } = await started(fakeProvider());
    await expect(advanceRun(d, 'tenant-b', run.id)).rejects.toBeInstanceOf(BuyerLabNotFoundError);
    await expect(advanceRun(d, T, 'missing')).rejects.toBeInstanceOf(BuyerLabNotFoundError);
  });
});

describe('startRun + advanceRun with the real NativeProvider and a stub model', () => {
  it('runs a panel to a verified outcome through the store', async () => {
    const { store, project } = await seed({ sources: [src({ text: 'Veloce replaces six tools. Pricing is by signed proposal only.' })], personas: 3 });
    const llm = jest.fn(async () => reply({ intent: { score: 2, rationale: 'Unpriced.' }, sentiment: 'negative', claims: [{ kind: 'objection', text: 'No price', severity: 'high', source: 'S1', quote: 'Pricing is by signed proposal only' }] }));
    const d = deps(store, new NativeProvider({ store, llm, now: clock }));
    const run = await startRun(d, { tenantId: T, projectId: project.id, provider: 'native', fundedBy: 'server_grant' });
    const r = await advanceRun(d, T, run.id);
    expect(r.run).toMatchObject({ status: 'done', callsUsed: 3, fundedBy: 'server_grant' });
    const outcome = (await store.getOutcome(T, run.id))!;
    expect(outcome.personas).toHaveLength(3);
    expect(outcome.verification).toEqual({ kept: 3, dropped: 0 });
    expect(outcome.partial).toBeNull();
  });
});

describe('retestRun', () => {
  beforeEach(() => {
    now = 9_000_000;
  });

  async function baseline() {
    const { store, project } = await seed();
    const d = deps(store, fakeProvider({ done: true, completedSteps: 3 }));
    const baseRun = await startRun(d, { tenantId: T, projectId: project.id, provider: 'native', fundedBy: 'byok' });
    return { store, project, d, baseRun };
  }

  it('reuses the base run\'s persona ids, without re-inferring the panel', async () => {
    const { store, project, d, baseRun } = await baseline();
    const run = await retestRun(d, { tenantId: T, projectId: project.id, baseRunId: baseRun.id, provider: 'native', fundedBy: 'byok' });
    expect(run.config.personaIds).toEqual(baseRun.config.personaIds);
    expect(run.id).not.toBe(baseRun.id);
    expect(await store.getRun(T, run.id)).not.toBeNull();
  });

  it('defaults to the project\'s current non-agent sources, or accepts an explicit subset', async () => {
    const { store, project, d, baseRun } = await baseline();
    const all = (await store.listSources(T, project.id)).map((s) => s.id);
    const runAll = await retestRun(d, { tenantId: T, projectId: project.id, baseRunId: baseRun.id, provider: 'native', fundedBy: 'byok' });
    expect(runAll.config.sourceIds).toEqual(all);
    const runSubset = await retestRun(d, { tenantId: T, projectId: project.id, baseRunId: baseRun.id, provider: 'native', fundedBy: 'byok', sourceIds: [all[0]] });
    expect(runSubset.config.sourceIds).toEqual([all[0]]);
  });

  it('ignores a source id that is not this project\'s', async () => {
    const { store, project, d, baseRun } = await baseline();
    const run = await retestRun(d, { tenantId: T, projectId: project.id, baseRunId: baseRun.id, provider: 'native', fundedBy: 'byok', sourceIds: ['not-a-real-id'] });
    // Falls back to the project's current sources when the requested subset resolves to nothing usable.
    expect(run.config.sourceIds.length).toBeGreaterThan(0);
  });

  it('answers not-found for a base run from another tenant or project', async () => {
    const { project, d, baseRun } = await baseline();
    await expect(retestRun(d, { tenantId: 'tenant-b', projectId: project.id, baseRunId: baseRun.id, provider: 'native', fundedBy: 'byok' })).rejects.toBeInstanceOf(BuyerLabNotFoundError);
  });

  it('clamps an explicit budget the same way startRun does', async () => {
    const { project, d, baseRun } = await baseline();
    const run = await retestRun(d, { tenantId: T, projectId: project.id, baseRunId: baseRun.id, provider: 'native', fundedBy: 'byok', callBudget: 9999 });
    expect(run.callBudget).toBe(MAX_CALL_BUDGET);
  });

  it("defaults the budget the same way startRun does, including a self_test project's converse reservation", async () => {
    const store = new MemoryBuyerLabStore(clock);
    const project = await store.createProject(T, { name: 'Anna self-test', targetUrl: null, brief: null, selfTest: true });
    await store.addSources(T, project.id, [src()]);
    await store.replacePanel(T, project.id, Array.from({ length: 3 }, (_, i) => person(`P${i}`)));
    const d = deps(store, fakeProvider({ done: true, completedSteps: 3 }));
    const baseRun = await startRun(d, { tenantId: T, projectId: project.id, provider: 'native', fundedBy: 'byok' });
    const run = await retestRun(d, { tenantId: T, projectId: project.id, baseRunId: baseRun.id, provider: 'native', fundedBy: 'byok' });
    expect(run.callBudget).toBe(defaultCallBudget(3, true));
  });
});
