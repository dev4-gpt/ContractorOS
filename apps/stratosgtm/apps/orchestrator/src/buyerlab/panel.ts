import { BuyerLlm, LlmOutputError, parseJsonObject } from './llm';
import { buildPanelPrompt, renderSources } from './prompts';
import { clip } from './text';
import { ARCHETYPES, Archetype, NewPersona, REQUIRED_ARCHETYPES, Source, SURFACES, Surface } from './types';

export class PanelIncompleteError extends Error {
  constructor(public readonly missing: Archetype[]) {
    super(`The panel is missing required archetypes: ${missing.join(', ')}.`);
    this.name = 'PanelIncompleteError';
  }
}

const strList = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.map((x) => clip(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

export function availableSurfacesOf(sources: Source[]): Surface[] {
  return SURFACES.filter((s) => sources.some((x) => x.surface === s && x.kind !== 'agent'));
}

/** One persona from untrusted input (model output or a user edit). Null if it has no name. */
export function sanitizePersona(raw: unknown, availableSurfaces: Surface[]): NewPersona | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = clip(r.name, 80);
  if (!name) return null;

  const archetype: Archetype = (ARCHETYPES as readonly string[]).includes(r.archetype as string) ? (r.archetype as Archetype) : 'other';
  const budgetAuthority = r.budgetAuthority === 'holder' || r.budgetAuthority === 'influencer' ? r.budgetAuthority : 'none';

  const asked = Array.isArray(r.surfaces) ? r.surfaces.filter((s): s is Surface => (SURFACES as readonly string[]).includes(s as string) && availableSurfaces.includes(s as Surface)) : [];
  let surfaces: Surface[] = asked.length ? SURFACES.filter((s) => asked.includes(s)) : [availableSurfaces[0] ?? 'public'];
  // A distracted first-time visitor has no account, so it never sees the signed-in app.
  if (archetype === 'distracted_visitor' && availableSurfaces.includes('public')) surfaces = ['public'];

  return {
    archetype,
    surfaces,
    edited: false,
    spec: {
      name,
      role: clip(r.role, 120),
      goals: strList(r.goals, 5, 200),
      constraints: strList(r.constraints, 5, 200),
      budgetAuthority,
      priorTools: strList(r.priorTools, 5, 80),
      reasonNotToBuy: clip(r.reasonNotToBuy, 400)
    }
  };
}

export function sanitizePersonas(raw: unknown, availableSurfaces: Surface[], max = 12): NewPersona[] {
  if (!Array.isArray(raw)) return [];
  const out: NewPersona[] = [];
  for (const item of raw) {
    const p = sanitizePersona(item, availableSurfaces);
    if (p) out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

export function missingArchetypes(personas: Array<{ archetype: Archetype }>): Archetype[] {
  return REQUIRED_ARCHETYPES.filter((a) => !personas.some((p) => p.archetype === a));
}

/** The five required archetypes first (in fixed order), then the rest, trimmed to `size`. */
function arrange(personas: NewPersona[], size: number): NewPersona[] {
  const required = REQUIRED_ARCHETYPES.map((a) => personas.find((p) => p.archetype === a)).filter((p): p is NewPersona => !!p);
  const rest = personas.filter((p) => !required.includes(p));
  return [...required, ...rest].slice(0, size);
}

export async function inferPanel(i: {
  project: { name: string; targetUrl: string | null };
  sources: Source[];
  size: number;
  llm: BuyerLlm;
}): Promise<{ icp: string; personas: NewPersona[]; callsUsed: number; tokens: { prompt: number; completion: number } }> {
  const size = Math.min(12, Math.max(5, Math.floor(i.size) || 6));
  const available = availableSurfacesOf(i.sources);
  const rendered = renderSources(i.sources.filter((s) => s.kind !== 'agent'));
  const tokens = { prompt: 0, completion: 0 };
  let callsUsed = 0;
  let missing: Archetype[] | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const p = buildPanelPrompt({ projectName: i.project.name, targetUrl: i.project.targetUrl, rendered, size, availableSurfaces: available, missingArchetypes: missing });
    const res = await i.llm({ system: p.system, user: p.user, maxTokens: 3500 });
    callsUsed++;
    tokens.prompt += res.promptTokens;
    tokens.completion += res.completionTokens;
    let parsed: Record<string, unknown>;
    try {
      parsed = parseJsonObject(res.content);
    } catch (err) {
      if (!(err instanceof LlmOutputError)) throw err;
      lastError = err;
      continue;
    }
    const personas = sanitizePersonas(parsed.personas, available);
    const gaps = missingArchetypes(personas);
    if (gaps.length === 0) return { icp: clip(parsed.icp, 600), personas: arrange(personas, size), callsUsed, tokens };
    missing = gaps;
    lastError = new PanelIncompleteError(gaps);
  }
  throw lastError;
}
