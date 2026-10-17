import type { ChatTurn, NewPersona, NewProjectInput, NewSource, NormalizedOutcome, Persona, Project, ProviderId, Report, Run, RunConfig, Source } from './types';

export class BuyerLabNotFoundError extends Error {
  constructor(what = 'resource') {
    super(`${what} not found`);
    this.name = 'BuyerLabNotFoundError';
  }
}

export type StepStatus = 'running' | 'retry' | 'done' | 'failed';
export interface StepRow {
  runId: string;
  stepKey: string;
  status: StepStatus;
  attempts: number;
  output: unknown | null;
  startedAt: string;
}
export interface ClaimResult {
  claimed: boolean;
  attempt: number;
}

/**
 * Persistence for Buyer Lab. Every method takes the tenant id first and touches only that
 * tenant's rows; another tenant's id behaves exactly like a missing one.
 */
export interface BuyerLabStore {
  createProject(tenantId: string, input: NewProjectInput): Promise<Project>;
  listProjects(tenantId: string): Promise<Project[]>;
  getProject(tenantId: string, projectId: string): Promise<Project | null>;
  /** True if a project was deleted (with its sources, personas, runs, steps and outcomes). */
  deleteProject(tenantId: string, projectId: string): Promise<boolean>;

  /** Throws BuyerLabNotFoundError if the project is not the tenant's. Identical text (same hash) is a no-op counted in `duplicates`. */
  addSources(tenantId: string, projectId: string, sources: NewSource[]): Promise<{ added: Source[]; duplicates: number }>;
  listSources(tenantId: string, projectId: string): Promise<Source[]>;

  /** Replaces the whole panel. Throws BuyerLabNotFoundError if the project is not the tenant's. */
  replacePanel(tenantId: string, projectId: string, personas: NewPersona[]): Promise<Persona[]>;
  listPersonas(tenantId: string, projectId: string): Promise<Persona[]>;

  createRun(
    tenantId: string,
    input: { projectId: string; provider: ProviderId; config: RunConfig; callBudget: number; fundedBy: 'byok' | 'server_grant' }
  ): Promise<Run>;
  getRun(tenantId: string, runId: string): Promise<Run | null>;
  /** The most recently created run of a project, so the UI can reopen it after a reload. */
  latestRun(tenantId: string, projectId: string): Promise<Run | null>;
  updateRun(tenantId: string, runId: string, patch: Partial<Pick<Run, 'status' | 'startedAt' | 'finishedAt' | 'errorCode'>>): Promise<void>;
  /** Atomically adds `n` to calls_used and returns the new total. */
  addCalls(tenantId: string, runId: string, n: number): Promise<number>;

  /**
   * The claim lock. Inserts a `running` row for (run, step) or takes over a `retry` row or a
   * `running` row older than `staleAfterMs`. Returns claimed=false when the step is done, failed,
   * running fresh, or has used `maxAttempts` (in which case it is marked failed).
   */
  claimStep(tenantId: string, runId: string, stepKey: string, o: { staleAfterMs: number; maxAttempts: number }): Promise<ClaimResult>;
  /**
   * Compare-and-set: updates the step only if it is still `running` with the given attempt number.
   * Returns true if the update applied, false if the step was claimed or finished by another caller.
   * A false return means the caller lost its claim and should treat the step as 'skipped'.
   */
  finishStep(tenantId: string, runId: string, stepKey: string, status: 'done' | 'failed' | 'retry', output: unknown, attempt: number): Promise<boolean>;
  listSteps(tenantId: string, runId: string): Promise<StepRow[]>;

  saveOutcome(tenantId: string, runId: string, outcome: NormalizedOutcome): Promise<void>;
  getOutcome(tenantId: string, runId: string): Promise<NormalizedOutcome | null>;

  /** Upserts the run's report (one per run). Throws BuyerLabNotFoundError if the run is not the tenant's. */
  saveReport(tenantId: string, runId: string, report: Report, model: string | null): Promise<void>;
  getReport(tenantId: string, runId: string): Promise<Report | null>;

  /** Throws BuyerLabNotFoundError if the run is not the tenant's. */
  appendChatTurn(tenantId: string, runId: string, personaId: string, turn: { role: 'user' | 'persona'; text: string }): Promise<ChatTurn>;
  listChatTurns(tenantId: string, runId: string, personaId: string): Promise<ChatTurn[]>;
}
