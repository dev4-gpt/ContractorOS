import { verifyQuote } from './quotes';
import { clip } from './text';
import type { ShownSource } from './prompts';
import { Claim, ClaimKind, DISCLAIMER, DroppedClaim, NormalizedOutcome, Persona, PersonaOutcome, ProviderId, Source } from './types';

/** The model gave no usable intent score. The step is retried; a score is never invented. */
export class ReactionMalformedError extends Error {
  constructor() {
    super('The reaction had no usable intent score.');
    this.name = 'ReactionMalformedError';
  }
}

const KINDS: ClaimKind[] = ['objection', 'confusion', 'delight'];
const SENTIMENTS = ['negative', 'mixed', 'positive'] as const;
const SEVERITIES = ['low', 'medium', 'high'] as const;
const MAX_CLAIMS_CONSIDERED = 12;

/**
 * Turns a persona's raw model answer into a PersonaOutcome, keeping only claims whose quote is
 * found verbatim in text that persona was actually shown, from a surface it was allowed to see.
 */
export function normaliseReaction(i: { persona: Persona; raw: unknown; refs: Map<string, ShownSource> }): PersonaOutcome {
  const { persona, refs } = i;
  if (i.raw === null || typeof i.raw !== 'object' || Array.isArray(i.raw)) throw new ReactionMalformedError();
  const raw = i.raw as Record<string, unknown>;

  const intentRaw = raw.intent as { score?: unknown; rationale?: unknown } | undefined;
  if (intentRaw === null || typeof intentRaw !== 'object' || typeof intentRaw.score !== 'number') throw new ReactionMalformedError();
  const score = Number(intentRaw.score);
  if (!Number.isFinite(score)) throw new ReactionMalformedError();

  const claims: Claim[] = [];
  const dropped: DroppedClaim[] = [];
  const items = Array.isArray(raw.claims) ? raw.claims.slice(0, MAX_CLAIMS_CONSIDERED) : [];

  for (const item of items) {
    const c = (item !== null && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const text = clip(c.text, 400);
    const drop = (reason: DroppedClaim['reason']) => dropped.push({ text, reason });

    if (!text || !KINDS.includes(c.kind as ClaimKind)) {
      drop('malformed');
      continue;
    }
    const shown = refs.get(clip(c.source, 10));
    if (!shown) {
      drop('unknown_source');
      continue;
    }
    if (shown.source.kind === 'agent') {
      drop('agent_source');
      continue;
    }
    if (!persona.surfaces.includes(shown.source.surface)) {
      drop('surface_not_allowed');
      continue;
    }
    const quote = clip(c.quote, 600);
    if (!quote) {
      drop('no_quote');
      continue;
    }
    if (!verifyQuote(quote, shown.shownText)) {
      drop('quote_not_found');
      continue;
    }
    const kind = c.kind as ClaimKind;
    claims.push({
      id: `${persona.id}:${claims.length + 1}`,
      kind,
      text,
      severity: kind === 'objection' && SEVERITIES.includes(c.severity as (typeof SEVERITIES)[number]) ? (c.severity as Claim['severity']) : null,
      sourceId: shown.source.id,
      surface: shown.source.surface,
      quote
    });
  }

  return {
    personaId: persona.id,
    name: persona.spec.name,
    archetype: persona.archetype,
    surfaces: persona.surfaces,
    intent: { score: Math.min(10, Math.max(0, Math.round(score))), rationale: clip(intentRaw.rationale, 500) },
    sentiment: SENTIMENTS.includes(raw.sentiment as (typeof SENTIMENTS)[number]) ? (raw.sentiment as PersonaOutcome['sentiment']) : 'mixed',
    claims,
    conversation: [],
    dropped
  };
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function buildOutcome(i: {
  provider: ProviderId;
  model: string | null;
  personas: PersonaOutcome[];
  expectedPersonaIds: string[];
  sources: Source[];
  callsUsed: number;
  now?: () => Date;
}): NormalizedOutcome {
  const scores = i.personas.map((p) => p.intent.score);
  const intentMin = scores.length ? Math.min(...scores) : 0;
  const intentMax = scores.length ? Math.max(...scores) : 0;
  const finished = new Set(i.personas.map((p) => p.personaId));
  const missing = i.expectedPersonaIds.filter((id) => !finished.has(id));

  return {
    provider: i.provider,
    model: i.model,
    panelSize: i.expectedPersonaIds.length,
    coverage: { sources: i.sources.map((s) => ({ id: s.id, label: s.label, url: s.url, surface: s.surface, words: wordCount(s.text) })) },
    personas: i.personas,
    // Computed from the personas. A model is never asked whether they agree.
    agreement: { intentMin, intentMax, split: i.personas.length >= 2 && intentMax - intentMin >= 4 },
    verification: {
      kept: i.personas.reduce((n, p) => n + p.claims.length, 0),
      dropped: i.personas.reduce((n, p) => n + p.dropped.length, 0)
    },
    partial: missing.length ? { missingPersonaIds: missing } : null,
    callsUsed: i.callsUsed,
    generatedAt: (i.now?.() ?? new Date()).toISOString(),
    disclaimer: DISCLAIMER
  };
}

/**
 * Grounds conversation claims against the transcript text itself (the only allowed source for
 * this array), instead of a react-stage refs map. IDs are namespaced `${personaId}:c:${n}` so
 * they never collide with claims[]'s `${personaId}:${n}` ids — the report cites both by id.
 * Never throws: malformed model output yields an empty result, which the caller treats as "no
 * conversation claims" rather than retrying the whole persona.
 */
export function normaliseConversation(i: { personaId: string; sourceId: string; transcript: string; raw: unknown }): { claims: Claim[]; dropped: DroppedClaim[] } {
  const claims: Claim[] = [];
  const dropped: DroppedClaim[] = [];
  if (i.raw === null || typeof i.raw !== 'object' || Array.isArray(i.raw)) return { claims, dropped };
  const raw = i.raw as Record<string, unknown>;
  const items = Array.isArray(raw.claims) ? raw.claims.slice(0, MAX_CLAIMS_CONSIDERED) : [];

  for (const item of items) {
    const c = (item !== null && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const text = clip(c.text, 400);
    const drop = (reason: DroppedClaim['reason']) => dropped.push({ text, reason });
    if (!text || !KINDS.includes(c.kind as ClaimKind)) {
      drop('malformed');
      continue;
    }
    const quote = clip(c.quote, 600);
    if (!quote) {
      drop('no_quote');
      continue;
    }
    if (!verifyQuote(quote, i.transcript)) {
      drop('quote_not_found');
      continue;
    }
    const kind = c.kind as ClaimKind;
    claims.push({
      id: `${i.personaId}:c:${claims.length + 1}`,
      kind,
      text,
      severity: kind === 'objection' && SEVERITIES.includes(c.severity as (typeof SEVERITIES)[number]) ? (c.severity as Claim['severity']) : null,
      sourceId: i.sourceId,
      surface: 'public',
      quote
    });
  }
  return { claims, dropped };
}
