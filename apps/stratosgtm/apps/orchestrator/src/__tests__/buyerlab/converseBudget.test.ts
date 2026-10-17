/**
 * Converse under a REALISTIC default budget — the one `startRun` computes when no caller passes
 * one, which is what the UI and scripts/buyerlab-selftest-check.ts actually do. The pre-existing
 * converse tests all pass callBudget: 20 by hand, so they never caught that the default made
 * converse unreachable, that its reservation was never refunded, or that only the first
 * `concurrency` personas were ever claimed.
 */
import { NativeProvider } from '../../buyerlab/nativeProvider';
import { defaultCallBudget } from '../../buyerlab/runner';
import { MemoryBuyerLabStore, mkPersona, reply } from './helpers';
import type { BuyerLlm, BuyerLlmRequest, BuyerLlmResult } from '../../buyerlab/llm';
import type { AgentLLM } from '../../services/agentLoop';
import { CONVERSE_CALL_RESERVE } from '../../buyerlab/types';

const T = 'tenant-a';
const PUBLIC_TEXT = 'Veloce replaces six tools. Pricing is by signed proposal only.';
const AGENT_LINE = "It depends on scope, so I can't give a number yet.";
const PANEL = 5; // larger than NativeProvider's default concurrency of 3

const now = () => 5_000_000;
const deadline = () => ({ deadlineAt: now() + 45_000 });

const react = () =>
  reply({
    intent: { score: 3, rationale: 'Unpriced.' },
    sentiment: 'negative',
    claims: [{ kind: 'objection', text: 'No price', severity: 'high', source: 'S1', quote: 'Pricing is by signed proposal only' }]
  });
const claimsReply = (quote = AGENT_LINE) => reply({ claims: [{ kind: 'objection', text: 'No firm price given', severity: 'medium', quote }] });

const scriptedAgent = (): AgentLLM => async () => ({ content: AGENT_LINE, isFallback: false, model: 'agent-stub' });

/** Routes one mock BuyerLlm to the right canned reply per buyerlab prompt, counting every call. */
function makeLlm(opts: { claims?: () => BuyerLlmResult } = {}) {
  const calls = { react: 0, buyer: 0, claims: 0 };
  const llm: BuyerLlm = async (r: BuyerLlmRequest) => {
    const text = `${r.system} ${r.user}`;
    if (text.includes('evaluating a product')) {
      calls.react += 1;
      return react();
    }
    if (text.includes('short live chat')) {
      calls.buyer += 1;
      return reply({ message: 'What does this cost?' });
    }
    if (text.includes('reflecting on a conversation')) {
      calls.claims += 1;
      return (opts.claims ?? claimsReply)();
    }
    throw new Error(`Unrecognised prompt: ${r.system}`);
  };
  return { llm, calls };
}

async function selfTestRun(over: { callBudget?: number; personas?: number } = {}) {
  const store = new MemoryBuyerLabStore(now);
  const project = await store.createProject(T, { name: 'Anna self-test', targetUrl: null, brief: null, selfTest: true });
  const { added } = await store.addSources(T, project.id, [
    { kind: 'crawl', surface: 'public', label: 'Home', url: null, contentHash: 'h1', text: PUBLIC_TEXT, meta: {} }
  ]);
  const count = over.personas ?? PANEL;
  const personas = await store.replacePanel(
    T,
    project.id,
    Array.from({ length: count }, (_, i) => {
      const { id, projectId, ...rest } = mkPersona({ surfaces: ['public'], spec: { ...mkPersona().spec, name: `P${i}` } });
      return rest;
    })
  );
  // The budget the runner would give this run with no explicit budget from the caller.
  const callBudget = over.callBudget ?? defaultCallBudget(count, project.selfTest);
  const run = await store.createRun(T, {
    projectId: project.id,
    provider: 'native',
    config: { personaIds: personas.map((p) => p.id), sourceIds: added.map((s) => s.id) },
    callBudget,
    fundedBy: 'byok'
  });
  return { store, project, personas, run, handle: { runId: run.id, tenantId: T } };
}

describe('converse under the default call budget', () => {
  it("sizes a self-test project's default budget for the converse reservation, and not a non-self-test one", () => {
    expect(defaultCallBudget(5, false)).toBe(7); // unchanged: personas + 2
    expect(defaultCallBudget(5, true)).toBe(5 * (1 + CONVERSE_CALL_RESERVE) + 2);
    expect(defaultCallBudget(20, true)).toBe(60); // MAX_CALL_BUDGET clamp still applies
  });

  it('runs converse to completion for EVERY persona of a panel larger than concurrency, on the default budget', async () => {
    const { store, handle, run, personas } = await selfTestRun();
    const { llm, calls } = makeLlm();
    const p = new NativeProvider({ store, llm, now, agentLlmFactory: scriptedAgent });

    await p.advance(handle, deadline());

    const steps = await store.listSteps(T, handle.runId);
    const converse = steps.filter((s) => s.stepKey.startsWith('converse:'));
    expect(converse).toHaveLength(PANEL);
    expect(converse.every((s) => s.status === 'done')).toBe(true);
    expect(calls.react).toBe(PANEL);
    expect(calls.claims).toBe(PANEL);

    const outcome = await p.outcome(handle);
    expect(outcome.personas).toHaveLength(personas.length);
    expect(outcome.personas.every((x) => x.conversation.length === 1)).toBe(true);

    // callsUsed reflects what was actually spent, and never exceeds the budget.
    const updated = (await store.getRun(T, run.id))!;
    expect(updated.callsUsed).toBe(calls.react + calls.buyer + calls.claims + PANEL * 3); // + the agent-side calls
    expect(updated.callsUsed).toBeLessThanOrEqual(updated.callBudget);
  });

  it('refunds the unused reservation, so a later react poll is not pushed into budget_exhausted', async () => {
    // One persona short of the panel's react calls plus a single converse reservation.
    const { store, handle, run } = await selfTestRun({ personas: 2 });
    const { llm } = makeLlm();
    const p = new NativeProvider({ store, llm, now, agentLlmFactory: scriptedAgent });
    const progress = await p.advance(handle, deadline());

    expect(progress.budgetExhausted).toBe(false);
    expect(progress.done).toBe(true);
    const updated = (await store.getRun(T, run.id))!;
    expect(updated.callsUsed).toBeLessThanOrEqual(updated.callBudget);
    // 2 react + 2 * (3 buyer + 3 agent + 1 claims) = 16, not 2 + 2 * CONVERSE_CALL_RESERVE.
    expect(updated.callsUsed).toBe(16);
  });

  it('refunds the whole reservation when converse is denied for budget, leaving callsUsed at what react spent', async () => {
    // Exactly enough for react's two calls, nothing left for a converse reservation.
    const { store, handle, run } = await selfTestRun({ personas: 2, callBudget: 2 });
    const { llm } = makeLlm();
    const p = new NativeProvider({ store, llm, now, agentLlmFactory: scriptedAgent });
    await p.advance(handle, deadline());

    const steps = await store.listSteps(T, handle.runId);
    expect(steps.filter((s) => s.stepKey.startsWith('converse:')).every((s) => s.status === 'failed')).toBe(true);
    const updated = (await store.getRun(T, run.id))!;
    expect(updated.callsUsed).toBe(2); // the reservation was given back in full
    expect(updated.callsUsed).toBeLessThanOrEqual(updated.callBudget);
  });

  it('counts a dropped conversation claim instead of discarding it', async () => {
    const { store, handle } = await selfTestRun({ personas: 1 });
    const { llm } = makeLlm({ claims: () => claimsReply('a sentence Anna never said in this transcript') });
    const p = new NativeProvider({ store, llm, now, agentLlmFactory: scriptedAgent });
    await p.advance(handle, deadline());

    const outcome = await p.outcome(handle);
    expect(outcome.personas[0].conversation).toEqual([]);
    expect(outcome.personas[0].dropped.map((d) => d.reason)).toContain('quote_not_found');
    expect(outcome.verification.dropped).toBe(1);
  });
});
