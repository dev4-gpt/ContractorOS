import { buildReportPrompt, normaliseReport, generateReport } from '../../buyerlab/report';
import { reply } from './helpers';
import type { NormalizedOutcome, PersonaOutcome } from '../../buyerlab/types';

const claim = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: 'objection' as const, text: 'x', severity: null, sourceId: 's', surface: 'public' as const, quote: 'q'.repeat(12), ...over });
const persona = (id: string, claims: any[] = [claim(`${id}:1`)], conversation: any[] = []): PersonaOutcome => ({
  personaId: id, name: id, archetype: 'skeptic', surfaces: ['public'], intent: { score: 3, rationale: 'r' }, sentiment: 'mixed', claims, conversation, dropped: []
});
const outcome = (personas: PersonaOutcome[], split = false): NormalizedOutcome => ({
  provider: 'native', model: 'm', panelSize: personas.length, coverage: { sources: [] }, personas,
  agreement: { intentMin: split ? 1 : 3, intentMax: split ? 8 : 4, split }, verification: { kept: 1, dropped: 0 }, partial: null, callsUsed: 1, generatedAt: 'x', disclaimer: 'Simulated buyers, not measured customers.'
});

const SELF_TEST = { conversationAttempted: true };
const NOT_SELF_TEST = { conversationAttempted: false };

describe('buildReportPrompt', () => {
  it('lists every claim id from claims[] and conversation[], and forbids inventing ids or figures', () => {
    const o = outcome([persona('u1', [claim('u1:1')], [claim('u1:c:1', { kind: 'delight' })])]);
    const p = buildReportPrompt(o, SELF_TEST);
    expect(p.user).toContain('u1:1');
    expect(p.user).toContain('u1:c:1');
    expect(p.user).toMatch(/EXACTLY as given/);
    expect(p.user).toMatch(/probability|percentage|conversion|revenue/i);
  });

  // Spec 6.2.1: for a non-self-test project the report must say stage 4 was not run, never imply it was.
  it('tells the model no conversation was attempted when the project is not a self-test', () => {
    const o = outcome([persona('u1')]);
    expect(buildReportPrompt(o, NOT_SELF_TEST).user).toMatch(/No buyer-to-agent conversation was attempted/i);
    expect(buildReportPrompt(o, SELF_TEST).user).not.toMatch(/No buyer-to-agent conversation was attempted/i);
  });
});

describe('normaliseReport', () => {
  const o = outcome([persona('u1')]);

  it('keeps a finding/recommendation whose claimIds resolve, and carries the disclaimer', () => {
    const raw = { headline: 'No price shown.', findings: [{ text: 'Buyers cannot find a price.', claimIds: ['u1:1'] }], recommendations: [{ text: 'Publish pricing.', claimIds: ['u1:1'], rewrite: 'Starting at $X.' }] };
    const r = normaliseReport(o, raw, SELF_TEST, () => new Date('2026-09-21T00:00:00.000Z'));
    expect(r.findings).toHaveLength(1);
    expect(r.recommendations[0].rewrite).toBe('Starting at $X.');
    expect(r.disclaimer).toBe('Simulated buyers, not measured customers. These are hypotheses to test with real buyers.');
    expect(r.generatedAt).toBe('2026-09-21T00:00:00.000Z');
  });

  it('drops a finding whose every claimId is invented or does not resolve', () => {
    const raw = { findings: [{ text: 'x', claimIds: ['does-not-exist'] }, { text: 'y', claimIds: [] }] };
    expect(normaliseReport(o, raw, SELF_TEST).findings).toEqual([]);
  });

  it('keeps a finding if AT LEAST ONE of its claimIds resolves, dropping only the invented ones', () => {
    const raw = { findings: [{ text: 'x', claimIds: ['u1:1', 'invented'] }] };
    expect(normaliseReport(o, raw, SELF_TEST).findings[0].claimIds).toEqual(['u1:1']);
  });

  it('never throws on malformed model output; returns an empty report', () => {
    expect(normaliseReport(o, 'not an object', SELF_TEST).findings).toEqual([]);
    expect(normaliseReport(o, null, SELF_TEST).recommendations).toEqual([]);
    expect(normaliseReport(o, { findings: 'nope' }, SELF_TEST).findings).toEqual([]);
  });

  it('caps findings and recommendations at 6 each', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ text: `f${i}`, claimIds: ['u1:1'] }));
    expect(normaliseReport(o, { findings: many, recommendations: many }, SELF_TEST).findings).toHaveLength(6);
  });
});

describe('generateReport', () => {
  it('calls the llm once and returns a report plus the model used', async () => {
    const llm = jest.fn().mockResolvedValue(reply({ headline: 'h', findings: [{ text: 'x', claimIds: ['u1:1'] }], recommendations: [] }, { model: 'deepseek-flash' }));
    const o = outcome([persona('u1')]);
    const { report, model } = await generateReport(o, llm as any, SELF_TEST);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(report.findings).toHaveLength(1);
    expect(model).toBe('deepseek-flash');
    expect(report.conversationAttempted).toBe(true);
  });

  it('marks conversationAttempted false on the report of a non-self-test project', async () => {
    const llm = jest.fn().mockResolvedValue(reply({ headline: 'h', findings: [{ text: 'x', claimIds: ['u1:1'] }], recommendations: [] }));
    const { report } = await generateReport(outcome([persona('u1')]), llm as any, NOT_SELF_TEST);
    expect(report.conversationAttempted).toBe(false);
  });
});
