import { MemoryBuyerLabStore, mkPersona } from './helpers';
import { BuyerLabNotFoundError } from '../../buyerlab/store';
import type { NormalizedOutcome } from '../../buyerlab/types';

const A = 'tenant-a';
const B = 'tenant-b';
let now = 1_000_000;
const clock = () => now;
const outcome = { provider: 'native', panelSize: 0 } as unknown as NormalizedOutcome;

async function seed() {
  const store = new MemoryBuyerLabStore(clock);
  const project = await store.createProject(A, { name: 'Veloce', targetUrl: 'https://veloceos.cloud', brief: null, selfTest: false });
  return { store, project };
}

describe('BuyerLabStore contract (memory implementation)', () => {
  beforeEach(() => {
    now = 1_000_000;
  });

  it('never shows one tenant another tenant\'s project, and answers not-found for it', async () => {
    const { store, project } = await seed();
    expect(await store.getProject(B, project.id)).toBeNull();
    expect(await store.listProjects(B)).toEqual([]);
    expect(await store.deleteProject(B, project.id)).toBe(false);
    expect(await store.listSources(B, project.id)).toEqual([]);
    expect(await store.listPersonas(B, project.id)).toEqual([]);
    await expect(store.addSources(B, project.id, [])).rejects.toBeInstanceOf(BuyerLabNotFoundError);
    await expect(store.replacePanel(B, project.id, [])).rejects.toBeInstanceOf(BuyerLabNotFoundError);
    await expect(
      store.createRun(B, { projectId: project.id, provider: 'native', config: { personaIds: [], sourceIds: [] }, callBudget: 5, fundedBy: 'byok' })
    ).rejects.toBeInstanceOf(BuyerLabNotFoundError);
    expect(await store.getProject(A, project.id)).not.toBeNull();
  });

  it('adds sources once per content hash', async () => {
    const { store, project } = await seed();
    const src = { kind: 'crawl' as const, surface: 'public' as const, label: 'Home', url: 'https://a.com/', contentHash: 'h1', text: 'x'.repeat(50), meta: {} };
    const first = await store.addSources(A, project.id, [src]);
    const again = await store.addSources(A, project.id, [src, { ...src, contentHash: 'h2' }]);
    expect(first.added).toHaveLength(1);
    expect(again.added).toHaveLength(1);
    expect(again.duplicates).toBe(1);
    expect(await store.listSources(A, project.id)).toHaveLength(2);
  });

  it('replaces the panel wholesale', async () => {
    const { store, project } = await seed();
    const p = (n: string) => {
      const { id, projectId, ...rest } = mkPersona({ spec: { ...mkPersona().spec, name: n } });
      return rest;
    };
    const one = await store.replacePanel(A, project.id, [p('One'), p('Two')]);
    const two = await store.replacePanel(A, project.id, [p('Three')]);
    expect(one).toHaveLength(2);
    expect((await store.listPersonas(A, project.id)).map((x) => x.spec.name)).toEqual(['Three']);
    expect(two[0].id).not.toBe(one[0].id);
  });

  it('accumulates calls and scopes runs by tenant', async () => {
    const { store, project } = await seed();
    const run = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: ['x'], sourceIds: ['y'] }, callBudget: 5, fundedBy: 'byok' });
    expect(run.status).toBe('queued');
    expect(await store.addCalls(A, run.id, 2)).toBe(2);
    expect(await store.addCalls(A, run.id, 1)).toBe(3);
    expect(await store.getRun(B, run.id)).toBeNull();
    expect((await store.latestRun(A, project.id))!.id).toBe(run.id);
    expect(await store.latestRun(B, project.id)).toBeNull();
    await store.updateRun(A, run.id, { status: 'running', startedAt: new Date(now).toISOString() });
    expect((await store.getRun(A, run.id))!.status).toBe('running');
  });

  describe('claimStep (the double-charge guard)', () => {
    const opts = { staleAfterMs: 90_000, maxAttempts: 3 };
    async function run() {
      const { store, project } = await seed();
      const r = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: [], sourceIds: [] }, callBudget: 5, fundedBy: 'byok' });
      return { store, r };
    }

    it('lets exactly one of two concurrent claimers run the step', async () => {
      const { store, r } = await run();
      const results = await Promise.all([store.claimStep(A, r.id, 'react:u1', opts), store.claimStep(A, r.id, 'react:u1', opts)]);
      expect(results.filter((x) => x.claimed)).toHaveLength(1);
    });

    it('does not reclaim a fresh running step, but reclaims a stale one with attempt + 1', async () => {
      const { store, r } = await run();
      expect(await store.claimStep(A, r.id, 'k', opts)).toEqual({ claimed: true, attempt: 1 });
      now += 60_000;
      expect((await store.claimStep(A, r.id, 'k', opts)).claimed).toBe(false);
      now += 40_000;
      expect(await store.claimStep(A, r.id, 'k', opts)).toEqual({ claimed: true, attempt: 2 });
    });

    it('reclaims a step released for retry, and gives up after maxAttempts', async () => {
      const { store, r } = await run();
      for (let attempt = 1; attempt <= 3; attempt++) {
        const claim = await store.claimStep(A, r.id, 'k', opts);
        expect(claim).toEqual({ claimed: true, attempt });
        const applied = await store.finishStep(A, r.id, 'k', 'retry', { error: 'boom' }, claim.attempt);
        expect(applied).toBe(true);
      }
      expect((await store.claimStep(A, r.id, 'k', opts)).claimed).toBe(false);
      expect((await store.listSteps(A, r.id)).find((s) => s.stepKey === 'k')!.status).toBe('failed');
    });

    it('never reclaims a finished step', async () => {
      const { store, r } = await run();
      const claim = await store.claimStep(A, r.id, 'k', opts);
      await store.finishStep(A, r.id, 'k', 'done', { ok: true }, claim.attempt);
      now += 1_000_000;
      expect((await store.claimStep(A, r.id, 'k', opts)).claimed).toBe(false);
      expect((await store.listSteps(A, r.id))[0]).toMatchObject({ status: 'done', output: { ok: true } });
    });
  });

  it('stores an outcome per run, scoped by tenant', async () => {
    const { store, project } = await seed();
    const r = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: [], sourceIds: [] }, callBudget: 5, fundedBy: 'byok' });
    await store.saveOutcome(A, r.id, outcome);
    expect(await store.getOutcome(A, r.id)).toEqual(outcome);
    expect(await store.getOutcome(B, r.id)).toBeNull();
  });

  it('deleting a project removes its sources, personas, runs, steps and outcome', async () => {
    const { store, project } = await seed();
    await store.addSources(A, project.id, [{ kind: 'crawl', surface: 'public', label: 'x', url: null, contentHash: 'h', text: 'y'.repeat(40), meta: {} }]);
    const r = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: [], sourceIds: [] }, callBudget: 5, fundedBy: 'byok' });
    await store.claimStep(A, r.id, 'k', { staleAfterMs: 1, maxAttempts: 3 });
    await store.saveOutcome(A, r.id, outcome);
    expect(await store.deleteProject(A, project.id)).toBe(true);
    expect(await store.listSources(A, project.id)).toEqual([]);
    expect(await store.getRun(A, r.id)).toBeNull();
    expect(await store.listSteps(A, r.id)).toEqual([]);
    expect(await store.getOutcome(A, r.id)).toBeNull();
  });

  describe('Tenant isolation - cross-tenant operations must throw or have no effect', () => {
    it('cross-tenant claimStep throws BuyerLabNotFoundError and leaves owner\'s run untouched', async () => {
      const { store, project } = await seed();
      const r = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: [], sourceIds: [] }, callBudget: 5, fundedBy: 'byok' });
      const opts = { staleAfterMs: 90_000, maxAttempts: 3 };

      // Tenant B tries to claim a step on A's run
      await expect(store.claimStep(B, r.id, 'react:u1', opts)).rejects.toBeInstanceOf(BuyerLabNotFoundError);

      // Tenant A can still claim the step (it was never written)
      const result = await store.claimStep(A, r.id, 'react:u1', opts);
      expect(result).toEqual({ claimed: true, attempt: 1 });
    });

    it('claimStep on a nonexistent run throws BuyerLabNotFoundError', async () => {
      const { store } = await seed();
      const opts = { staleAfterMs: 90_000, maxAttempts: 3 };
      await expect(store.claimStep(A, 'nonexistent-run', 'react:u1', opts)).rejects.toBeInstanceOf(BuyerLabNotFoundError);
    });

    it('cross-tenant saveOutcome throws BuyerLabNotFoundError, owner\'s outcome unchanged', async () => {
      const { store, project } = await seed();
      const r = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: [], sourceIds: [] }, callBudget: 5, fundedBy: 'byok' });
      const outcomeA = { provider: 'native', panelSize: 1 } as unknown as NormalizedOutcome;

      // Tenant A saves an outcome
      await store.saveOutcome(A, r.id, outcomeA);
      expect(await store.getOutcome(A, r.id)).toEqual(outcomeA);

      // Tenant B tries to save an outcome on A's run
      const outcomeB = { provider: 'native', panelSize: 2 } as unknown as NormalizedOutcome;
      await expect(store.saveOutcome(B, r.id, outcomeB)).rejects.toBeInstanceOf(BuyerLabNotFoundError);

      // A's outcome is unchanged
      expect(await store.getOutcome(A, r.id)).toEqual(outcomeA);
      expect(await store.getOutcome(B, r.id)).toBeNull();
    });

    it('createProject ignores extra keys on input (tenantId, id, createdAt)', async () => {
      const { store } = await seed();
      const projectRes = await store.createProject(A, { name: 'Test', targetUrl: 'https://test.com', brief: null, tenantId: 'other', id: 'bad-id' } as any);

      // The stored project belongs to A, not 'other'
      expect(projectRes.tenantId).toBe(A);
      expect(projectRes.id).not.toBe('bad-id');

      // Tenant 'other' cannot see it
      expect(await store.getProject('other', projectRes.id)).toBeNull();
    });

    it('finishStep, addCalls, listSteps from another tenant have no effect', async () => {
      const { store, project } = await seed();
      const r = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: [], sourceIds: [] }, callBudget: 5, fundedBy: 'byok' });
      const opts = { staleAfterMs: 90_000, maxAttempts: 3 };

      // A claims a step
      const claim = await store.claimStep(A, r.id, 'k', opts);

      // B tries to finish it (returns false, no effect)
      const applied = await store.finishStep(B, r.id, 'k', 'done', { ok: true }, claim.attempt);
      expect(applied).toBe(false);
      const steps = await store.listSteps(A, r.id);
      expect(steps[0]).toMatchObject({ status: 'running' });

      // B tries to add calls to A's run
      await expect(store.addCalls(B, r.id, 5)).rejects.toBeInstanceOf(BuyerLabNotFoundError);
      expect((await store.getRun(A, r.id))!.callsUsed).toBe(0);

      // B tries to list steps
      const bSteps = await store.listSteps(B, r.id);
      expect(bSteps).toEqual([]);
    });
  });

  describe('finishStep compare-and-set (takeover guard)', () => {
    async function run() {
      const { store, project } = await seed();
      const r = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: [], sourceIds: [] }, callBudget: 5, fundedBy: 'byok' });
      return { store, r };
    }
    const opts = { staleAfterMs: 90_000, maxAttempts: 3 };

    it('finishStep with a stale attempt returns false and leaves the row untouched', async () => {
      const { store, r } = await run();
      const claim1 = await store.claimStep(A, r.id, 'k', opts);
      expect(claim1.attempt).toBe(1);

      // Try to finish with a wrong (old) attempt number
      const result = await store.finishStep(A, r.id, 'k', 'retry', { error: 'fake' }, 0);
      expect(result).toBe(false);

      // The step is still running with attempt 1
      const steps = await store.listSteps(A, r.id);
      expect(steps[0]).toMatchObject({ status: 'running', attempts: 1 });
    });

    it('finishStep with the current attempt returns true and applies the change', async () => {
      const { store, r } = await run();
      const claim = await store.claimStep(A, r.id, 'k', opts);
      expect(claim.attempt).toBe(1);

      const result = await store.finishStep(A, r.id, 'k', 'done', { ok: true }, claim.attempt);
      expect(result).toBe(true);

      const steps = await store.listSteps(A, r.id);
      expect(steps[0]).toMatchObject({ status: 'done', output: { ok: true }, attempts: 1 });
    });

    it('takeover scenario: A hangs, B takes over and completes done; A\'s late retry is ignored', async () => {
      const { store, r } = await run();

      // A claims the step (attempt 1)
      const claimA = await store.claimStep(A, r.id, 'k', opts);
      expect(claimA).toEqual({ claimed: true, attempt: 1 });

      // Time passes, B takes over (attempt 2)
      now += 100_000;
      const claimB = await store.claimStep(A, r.id, 'k', opts);
      expect(claimB).toEqual({ claimed: true, attempt: 2 });

      // B completes with done
      const bApplied = await store.finishStep(A, r.id, 'k', 'done', { ok: true }, claimB.attempt);
      expect(bApplied).toBe(true);

      // A's late failure with attempt 1 is ignored (stale attempt)
      const aApplied = await store.finishStep(A, r.id, 'k', 'retry', { error: 'late' }, claimA.attempt);
      expect(aApplied).toBe(false);

      // The step is still done with B's output
      const steps = await store.listSteps(A, r.id);
      expect(steps[0]).toMatchObject({ status: 'done', output: { ok: true }, attempts: 2 });
    });
  });

  describe('Ordering stability', () => {
    it('multiple personas in one replacePanel call return in input order', async () => {
      const { store, project } = await seed();
      const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
      const personas = names.map((n) => {
        const p = mkPersona({ spec: { ...mkPersona().spec, name: n } });
        const { id, projectId, ...rest } = p;
        return rest;
      });

      await store.replacePanel(A, project.id, personas);
      const listed = await store.listPersonas(A, project.id);
      expect(listed.map((p) => p.spec.name)).toEqual(names);
    });

    it('multiple sources in one addSources call return in input order', async () => {
      const { store, project } = await seed();
      const labels = ['Home', 'About', 'Pricing', 'Blog', 'Contact'];
      const sources = labels.map((label) => ({
        kind: 'crawl' as const, surface: 'public' as const, label, url: 'https://a.com/', contentHash: `h-${label}`, text: `Text for ${label}`, meta: {}
      }));

      const { added } = await store.addSources(A, project.id, sources);
      expect(added.map((s) => s.label)).toEqual(labels);

      const listed = await store.listSources(A, project.id);
      expect(listed.map((s) => s.label)).toEqual(labels);
    });
  });
});
