export const ARCHETYPES = ['skeptic', 'budget_holder', 'champion', 'technical_evaluator', 'distracted_visitor', 'other'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
/** Always present in a panel (spec 6, stage 2). */
export const REQUIRED_ARCHETYPES: Archetype[] = ['skeptic', 'budget_holder', 'champion', 'technical_evaluator', 'distracted_visitor'];

export const SURFACES = ['public', 'signed_in'] as const;
export type Surface = (typeof SURFACES)[number];
export const SOURCE_KINDS = ['crawl', 'brief', 'upload', 'agent'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const DISCLAIMER = 'Simulated buyers, not measured customers. These are hypotheses to test with real buyers.';

/**
 * Calls a converse step reserves up front for one persona (buyer turns + agent turns + the
 * claims call). Lives here, not in nativeProvider, so the runner can size a self-test run's
 * default budget by it without importing the provider (and its model clients).
 * The unused part of the reservation is refunded once the conversation ends.
 */
export const CONVERSE_CALL_RESERVE = 10;

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  targetUrl: string | null;
  brief: string | null;
  selfTest: boolean;
  createdAt: string;
}

export interface NewProjectInput {
  name: string;
  targetUrl: string | null;
  brief: string | null;
  selfTest: boolean;
}

export interface Source {
  id: string;
  projectId: string;
  kind: SourceKind;
  surface: Surface;
  label: string;
  url: string | null;
  contentHash: string;
  /** Raw extracted or user-supplied text. Never a model-written summary. */
  text: string;
  meta: Record<string, unknown>;
  fetchedAt: string;
}
export type NewSource = Omit<Source, 'id' | 'projectId' | 'fetchedAt'>;

export interface PersonaSpec {
  name: string;
  role: string;
  goals: string[];
  constraints: string[];
  budgetAuthority: 'none' | 'influencer' | 'holder';
  priorTools: string[];
  reasonNotToBuy: string;
}
export interface Persona {
  id: string;
  projectId: string;
  archetype: Archetype;
  surfaces: Surface[];
  spec: PersonaSpec;
  edited: boolean;
}
export type NewPersona = Omit<Persona, 'id' | 'projectId'>;

export type ClaimKind = 'objection' | 'confusion' | 'delight';
export interface Claim {
  id: string;
  kind: ClaimKind;
  text: string;
  severity: 'low' | 'medium' | 'high' | null;
  sourceId: string;
  surface: Surface;
  /** Verbatim from the named source (verified). */
  quote: string;
}
export interface DroppedClaim {
  text: string;
  reason: 'malformed' | 'no_quote' | 'unknown_source' | 'agent_source' | 'surface_not_allowed' | 'quote_not_found';
}
export interface PersonaOutcome {
  personaId: string;
  name: string;
  archetype: Archetype;
  surfaces: Surface[];
  /** 0-10 with a rationale. Never a probability. */
  intent: { score: number; rationale: string };
  sentiment: 'negative' | 'mixed' | 'positive';
  claims: Claim[];
  conversation: Claim[];
  dropped: DroppedClaim[];
}

export type ProviderId = 'native' | 'mirofish';
export interface NormalizedOutcome {
  provider: ProviderId;
  model: string | null;
  panelSize: number;
  coverage: { sources: Array<{ id: string; label: string; url: string | null; surface: Surface; words: number }> };
  personas: PersonaOutcome[];
  /** Computed from the personas, never written by a model. */
  agreement: { intentMin: number; intentMax: number; split: boolean };
  verification: { kept: number; dropped: number };
  /** Set when some personas did not finish (budget or failures). */
  partial: { missingPersonaIds: string[] } | null;
  callsUsed: number;
  generatedAt: string;
  disclaimer: string;
}

export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'budget_exhausted';
export interface RunConfig {
  personaIds: string[];
  sourceIds: string[];
}
export interface Run {
  id: string;
  tenantId: string;
  projectId: string;
  provider: ProviderId;
  status: RunStatus;
  config: RunConfig;
  callsUsed: number;
  callBudget: number;
  fundedBy: 'byok' | 'server_grant';
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
}

export interface RunSpec {
  runId: string;
  tenantId: string;
  projectId: string;
  personaIds: string[];
  sourceIds: string[];
  callBudget: number;
}
export interface ProviderHandle {
  runId: string;
  tenantId: string;
}
export interface CallBudget {
  /** Absolute epoch ms after which advance() must stop starting new work. */
  deadlineAt: number;
}
export interface Progress {
  done: boolean;
  completedSteps: number;
  failedSteps: number;
  totalSteps: number;
  callsUsed: number;
  budgetExhausted: boolean;
}

export interface SimulationProvider {
  readonly id: ProviderId;
  /** Validate the spec and create provider-side state. Idempotent per run id. */
  start(run: RunSpec): Promise<ProviderHandle>;
  /** Do at most ~45 s of work and return. Safe to call again after a crash or retry. */
  advance(handle: ProviderHandle, budget: CallBudget): Promise<Progress>;
  /** Only valid once advance() reports done. */
  outcome(handle: ProviderHandle): Promise<NormalizedOutcome>;
  /** Ask one persona a follow-up question after the run (sub-project 2). */
  chat(handle: ProviderHandle, personaId: string, message: string): Promise<string>;
}

export interface ReportFinding {
  text: string;
  /** Claim.id values (from claims[] or conversation[] of any persona in this run's outcome). */
  claimIds: string[];
}
export interface ReportRecommendation {
  text: string;
  claimIds: string[];
  rewrite: string | null;
}
export interface Report {
  headline: string;
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  /**
   * False when stage 4 (buyer-to-agent conversation) was never attempted for this project —
   * true only for a self_test project, the only kind whose runs converse at all (spec 6.2.1).
   * A reader must be able to tell "not run" from "run and found nothing".
   */
  conversationAttempted: boolean;
  disclaimer: string;
  generatedAt: string;
}

export interface ChatTurn {
  role: 'user' | 'persona';
  text: string;
  createdAt: string;
}
