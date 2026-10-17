import { BuyerLabNotFoundError, BuyerLabStore, ClaimResult, StepRow } from '../../buyerlab/store';
import type { BuyerLlmResult } from '../../buyerlab/llm';
import type { ChatTurn, NewPersona, NewProjectInput, NewSource, NormalizedOutcome, Persona, Project, Report, Run, Source } from '../../buyerlab/types';

type Owned<T> = T & { tenantId: string };
const clean = <T extends { tenantId: string }>(row: T): Omit<T, 'tenantId'> => {
  const { tenantId: _t, ...rest } = row;
  return rest;
};

export class MemoryBuyerLabStore implements BuyerLabStore {
  private seq = 0;
  private projects = new Map<string, Project>();
  private sources = new Map<string, Owned<Source>>();
  private personas = new Map<string, Owned<Persona>>();
  private runs = new Map<string, Run>();
  private steps = new Map<string, Owned<StepRow>>();
  private outcomes = new Map<string, { tenantId: string; outcome: NormalizedOutcome }>();
  private reports = new Map<string, { tenantId: string; report: Report }>();
  private chats: Array<{ tenantId: string; runId: string; personaId: string; role: 'user' | 'persona'; text: string; createdAt: string }> = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  private id(prefix: string) {
    return `${prefix}-${++this.seq}`;
  }
  private iso() {
    return new Date(this.now()).toISOString();
  }
  private owns(tenantId: string, projectId: string) {
    return this.projects.get(projectId)?.tenantId === tenantId;
  }
  private ownsRun(tenantId: string, runId: string) {
    return this.runs.get(runId)?.tenantId === tenantId;
  }
  private stepKey(runId: string, key: string) {
    return `${runId}::${key}`;
  }

  async createProject(tenantId: string, input: NewProjectInput) {
    const p: Project = { id: this.id('proj'), tenantId, name: input.name, targetUrl: input.targetUrl, brief: input.brief, selfTest: input.selfTest, createdAt: this.iso() };
    this.projects.set(p.id, p);
    return p;
  }
  async listProjects(tenantId: string) {
    return [...this.projects.values()].filter((p) => p.tenantId === tenantId).reverse();
  }
  async getProject(tenantId: string, projectId: string) {
    return this.owns(tenantId, projectId) ? (this.projects.get(projectId) as Project) : null;
  }
  async deleteProject(tenantId: string, projectId: string) {
    if (!this.owns(tenantId, projectId)) return false;
    this.projects.delete(projectId);
    for (const [k, s] of this.sources) if (s.projectId === projectId) this.sources.delete(k);
    for (const [k, p] of this.personas) if (p.projectId === projectId) this.personas.delete(k);
    for (const [runId, r] of this.runs) {
      if (r.projectId !== projectId) continue;
      this.runs.delete(runId);
      this.outcomes.delete(runId);
      this.reports.delete(runId);
      this.chats = this.chats.filter((c) => c.runId !== runId);
      for (const [k, s] of this.steps) if (s.runId === runId) this.steps.delete(k);
    }
    return true;
  }

  async addSources(tenantId: string, projectId: string, list: NewSource[]) {
    if (!this.owns(tenantId, projectId)) throw new BuyerLabNotFoundError('project');
    const added: Source[] = [];
    let duplicates = 0;
    const base = this.now();
    for (let index = 0; index < list.length; index++) {
      const s = list[index];
      const exists = [...this.sources.values()].some((x) => x.projectId === projectId && x.contentHash === s.contentHash);
      if (exists) {
        duplicates++;
        continue;
      }
      const row: Owned<Source> = { ...s, id: this.id('src'), projectId, fetchedAt: new Date(base + index).toISOString(), tenantId };
      this.sources.set(row.id, row);
      added.push(clean(row) as Source);
    }
    return { added, duplicates };
  }
  async listSources(tenantId: string, projectId: string) {
    return [...this.sources.values()].filter((s) => s.tenantId === tenantId && s.projectId === projectId).map((s) => clean(s) as Source);
  }

  async replacePanel(tenantId: string, projectId: string, list: NewPersona[]) {
    if (!this.owns(tenantId, projectId)) throw new BuyerLabNotFoundError('project');
    for (const [k, p] of this.personas) if (p.projectId === projectId) this.personas.delete(k);
    const base = this.now();
    return list.map((p, index) => {
      const row: any = { ...p, id: this.id('per'), projectId, tenantId, createdAt: new Date(base + index).toISOString() };
      this.personas.set(row.id, row);
      const { tenantId: _t, createdAt: _c, ...rest } = row;
      return rest as Persona;
    });
  }
  async listPersonas(tenantId: string, projectId: string) {
    return [...this.personas.values()]
      .filter((p) => p.tenantId === tenantId && p.projectId === projectId)
      .sort((a, b) => new Date((a as any).createdAt).getTime() - new Date((b as any).createdAt).getTime())
      .map((p) => {
        const { tenantId: _t, createdAt: _c, ...rest } = p as any;
        return rest as Persona;
      });
  }

  async createRun(tenantId: string, input: Parameters<BuyerLabStore['createRun']>[1]) {
    if (!this.owns(tenantId, input.projectId)) throw new BuyerLabNotFoundError('project');
    const run: Run = {
      id: this.id('run'), tenantId, projectId: input.projectId, provider: input.provider, status: 'queued', config: input.config,
      callsUsed: 0, callBudget: input.callBudget, fundedBy: input.fundedBy, startedAt: null, finishedAt: null, errorCode: null
    };
    this.runs.set(run.id, run);
    return { ...run };
  }
  async getRun(tenantId: string, runId: string) {
    const r = this.runs.get(runId);
    return r && r.tenantId === tenantId ? { ...r } : null;
  }
  async latestRun(tenantId: string, projectId: string) {
    const mine = [...this.runs.values()].filter((r) => r.tenantId === tenantId && r.projectId === projectId);
    return mine.length ? { ...mine[mine.length - 1] } : null;
  }
  async updateRun(tenantId: string, runId: string, patch: Parameters<BuyerLabStore['updateRun']>[2]) {
    const r = this.runs.get(runId);
    if (r && r.tenantId === tenantId) Object.assign(r, patch);
  }
  async addCalls(tenantId: string, runId: string, n: number) {
    const r = this.runs.get(runId);
    if (!r || r.tenantId !== tenantId) throw new BuyerLabNotFoundError('run');
    r.callsUsed += n;
    return r.callsUsed;
  }

  async claimStep(tenantId: string, runId: string, stepKey: string, o: { staleAfterMs: number; maxAttempts: number }): Promise<ClaimResult> {
    if (!this.ownsRun(tenantId, runId)) throw new BuyerLabNotFoundError('run');
    const key = this.stepKey(runId, stepKey);
    const row = this.steps.get(key);
    if (!row) {
      this.steps.set(key, { runId, stepKey, status: 'running', attempts: 1, output: null, startedAt: this.iso(), tenantId });
      return { claimed: true, attempt: 1 };
    }
    if (row.tenantId !== tenantId || row.status === 'done' || row.status === 'failed') return { claimed: false, attempt: row.attempts };
    const stale = row.status === 'running' && this.now() - Date.parse(row.startedAt) >= o.staleAfterMs;
    if (row.status === 'running' && !stale) return { claimed: false, attempt: row.attempts };
    if (row.attempts >= o.maxAttempts) {
      row.status = 'failed';
      row.output = { error: 'MAX_ATTEMPTS' };
      return { claimed: false, attempt: row.attempts };
    }
    row.status = 'running';
    row.attempts += 1;
    row.startedAt = this.iso();
    return { claimed: true, attempt: row.attempts };
  }
  async finishStep(tenantId: string, runId: string, stepKey: string, status: 'done' | 'failed' | 'retry', output: unknown, attempt: number): Promise<boolean> {
    const row = this.steps.get(this.stepKey(runId, stepKey));
    if (!row || row.tenantId !== tenantId) return false;
    if (row.status !== 'running' || row.attempts !== attempt) return false;
    row.status = status;
    row.output = output;
    return true;
  }
  async listSteps(tenantId: string, runId: string) {
    return [...this.steps.values()].filter((s) => s.tenantId === tenantId && s.runId === runId).map((s) => clean(s) as StepRow);
  }

  async saveOutcome(tenantId: string, runId: string, outcome: NormalizedOutcome) {
    if (!this.ownsRun(tenantId, runId)) throw new BuyerLabNotFoundError('run');
    this.outcomes.set(runId, { tenantId, outcome });
  }
  async getOutcome(tenantId: string, runId: string) {
    const o = this.outcomes.get(runId);
    return o && o.tenantId === tenantId ? o.outcome : null;
  }

  async saveReport(tenantId: string, runId: string, report: Report, _model: string | null) {
    if (!this.ownsRun(tenantId, runId)) throw new BuyerLabNotFoundError('run');
    this.reports.set(runId, { tenantId, report });
  }
  async getReport(tenantId: string, runId: string) {
    const row = this.reports.get(runId);
    return row && row.tenantId === tenantId ? row.report : null;
  }
  async appendChatTurn(tenantId: string, runId: string, personaId: string, turn: { role: 'user' | 'persona'; text: string }): Promise<ChatTurn> {
    if (!this.ownsRun(tenantId, runId)) throw new BuyerLabNotFoundError('run');
    const row = { tenantId, runId, personaId, role: turn.role, text: turn.text, createdAt: this.iso() };
    this.chats.push(row);
    return { role: row.role, text: row.text, createdAt: row.createdAt };
  }
  async listChatTurns(tenantId: string, runId: string, personaId: string) {
    return this.chats
      .filter((c) => c.tenantId === tenantId && c.runId === runId && c.personaId === personaId)
      .map((c) => ({ role: c.role, text: c.text, createdAt: c.createdAt }));
  }
}

export const mkSource = (over: Partial<Source> = {}): Source => ({
  id: 's1', projectId: 'p1', kind: 'crawl', surface: 'public', label: 'Home', url: 'https://a.com/', contentHash: 'h1',
  text: 'Veloce replaces six tools and prices by signed proposal only.', meta: {}, fetchedAt: '2026-09-21T00:00:00.000Z', ...over
});

export const mkPersona = (over: Partial<Persona> = {}): Persona => ({
  id: 'u1', projectId: 'p1', archetype: 'skeptic', surfaces: ['public'], edited: false,
  spec: { name: 'Sam Skeptic', role: 'Head of Ops', goals: ['cut tool sprawl'], constraints: ['no unpriced vendors'], budgetAuthority: 'influencer', priorTools: ['Zapier'], reasonNotToBuy: 'No published price.' },
  ...over
});

/** A model reply as the BuyerLlm returns it. */
export const reply = (obj: unknown, over: Partial<BuyerLlmResult> = {}): BuyerLlmResult => ({
  content: typeof obj === 'string' ? obj : JSON.stringify(obj), promptTokens: 100, completionTokens: 50, model: 'stub-model', ...over
});
