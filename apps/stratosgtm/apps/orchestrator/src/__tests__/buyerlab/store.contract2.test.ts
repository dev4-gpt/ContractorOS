import { MemoryBuyerLabStore } from './helpers';
import { BuyerLabNotFoundError } from '../../buyerlab/store';
import type { Report } from '../../buyerlab/types';

const A = 'tenant-a';
const B = 'tenant-b';

const report: Report = {
  headline: 'Buyers want a price before they will talk to sales.',
  findings: [{ text: 'No price is shown anywhere.', claimIds: ['u1:1'] }],
  recommendations: [{ text: 'Publish a starting price.', claimIds: ['u1:1'], rewrite: 'Starting at $X/mo.' }],
  conversationAttempted: true,
  disclaimer: 'Simulated buyers, not measured customers.',
  generatedAt: '2026-09-21T00:00:00.000Z'
};

describe('BuyerLabStore contract 2: self_test, reports, chats', () => {
  async function seed() {
    const store = new MemoryBuyerLabStore();
    const project = await store.createProject(A, { name: 'Anna self-test', targetUrl: null, brief: null, selfTest: true });
    const run = await store.createRun(A, { projectId: project.id, provider: 'native', config: { personaIds: ['u1'], sourceIds: ['s1'] }, callBudget: 5, fundedBy: 'byok' });
    return { store, project, run };
  }

  it('carries selfTest through createProject and getProject', async () => {
    const { store, project } = await seed();
    expect(project.selfTest).toBe(true);
    expect((await store.getProject(A, project.id))!.selfTest).toBe(true);
    const other = await store.createProject(A, { name: 'Veloce', targetUrl: 'https://veloceos.cloud', brief: null, selfTest: false });
    expect(other.selfTest).toBe(false);
  });

  it('saves and reads a report, tenant-scoped and idempotent on re-save', async () => {
    const { store, run } = await seed();
    expect(await store.getReport(A, run.id)).toBeNull();
    await store.saveReport(A, run.id, report, 'deepseek-flash');
    expect(await store.getReport(A, run.id)).toEqual(report);
    expect(await store.getReport(B, run.id)).toBeNull();
    const second: Report = { ...report, headline: 'Revised headline.' };
    await store.saveReport(A, run.id, second, 'deepseek-flash');
    expect((await store.getReport(A, run.id))!.headline).toBe('Revised headline.');
  });

  it('rejects saving a report to a run that is not the tenant\'s', async () => {
    const { store, run } = await seed();
    await expect(store.saveReport(B, run.id, report, 'm')).rejects.toBeInstanceOf(BuyerLabNotFoundError);
  });

  it('appends and lists chat turns in order, scoped by run and persona', async () => {
    const { store, run } = await seed();
    await store.appendChatTurn(A, run.id, 'u1', { role: 'user', text: 'Why no price?' });
    await store.appendChatTurn(A, run.id, 'u1', { role: 'persona', text: 'Because sales gates it.' });
    await store.appendChatTurn(A, run.id, 'u2', { role: 'user', text: 'Different persona, different thread' });
    const thread = await store.listChatTurns(A, run.id, 'u1');
    expect(thread.map((t) => t.role)).toEqual(['user', 'persona']);
    expect(thread[0].text).toBe('Why no price?');
    expect(await store.listChatTurns(B, run.id, 'u1')).toEqual([]);
  });

  it('rejects appending a chat turn to a run that is not the tenant\'s', async () => {
    const { store, run } = await seed();
    await expect(store.appendChatTurn(B, run.id, 'u1', { role: 'user', text: 'x' })).rejects.toBeInstanceOf(BuyerLabNotFoundError);
  });
});
