import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { buyerChats, buyerOutcomes, buyerPersonas, buyerProjects, buyerReports, buyerRuns, buyerRunSteps, buyerSources } from '../schemaBuyerLab';
import { BuyerLabNotFoundError, BuyerLabStore, ClaimResult, StepRow, StepStatus } from '../../buyerlab/store';
import type { Archetype, ChatTurn, NewPersona, NewProjectInput, NormalizedOutcome, Persona, PersonaSpec, Project, ProviderId, Report, Run, RunConfig, RunStatus, Source, SourceKind, Surface } from '../../buyerlab/types';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const toProject = (r: typeof buyerProjects.$inferSelect): Project => ({
  id: r.id, tenantId: r.tenantId, name: r.name, targetUrl: r.targetUrl, brief: r.brief, selfTest: r.selfTest, createdAt: r.createdAt.toISOString()
});
const toSource = (r: typeof buyerSources.$inferSelect): Source => ({
  id: r.id, projectId: r.projectId, kind: r.kind as SourceKind, surface: r.surface as Surface, label: r.label, url: r.url,
  contentHash: r.contentHash, text: r.text, meta: (r.meta ?? {}) as Record<string, unknown>, fetchedAt: r.fetchedAt.toISOString()
});
const toPersona = (r: typeof buyerPersonas.$inferSelect): Persona => ({
  id: r.id, projectId: r.projectId, archetype: r.archetype as Archetype, surfaces: r.surfaces as Surface[], spec: r.spec as PersonaSpec, edited: r.edited
});
const toRun = (r: typeof buyerRuns.$inferSelect): Run => ({
  id: r.id, tenantId: r.tenantId, projectId: r.projectId, provider: r.provider as ProviderId, status: r.status as RunStatus,
  config: r.config as RunConfig, callsUsed: r.callsUsed, callBudget: r.callBudget, fundedBy: r.fundedBy as Run['fundedBy'],
  startedAt: iso(r.startedAt), finishedAt: iso(r.finishedAt), errorCode: r.errorCode
});
const toStep = (r: typeof buyerRunSteps.$inferSelect): StepRow => ({
  runId: r.runId, stepKey: r.stepKey, status: r.status as StepStatus, attempts: r.attempts, output: r.output ?? null, startedAt: r.startedAt.toISOString()
});

async function requireProject(tenantId: string, projectId: string) {
  const [row] = await getDb().select({ id: buyerProjects.id }).from(buyerProjects).where(and(eq(buyerProjects.id, projectId), eq(buyerProjects.tenantId, tenantId))).limit(1);
  if (!row) throw new BuyerLabNotFoundError('project');
}

async function requireRun(tenantId: string, runId: string) {
  const [row] = await getDb().select({ id: buyerRuns.id }).from(buyerRuns).where(and(eq(buyerRuns.id, runId), eq(buyerRuns.tenantId, tenantId))).limit(1);
  if (!row) throw new BuyerLabNotFoundError('run');
}

/** Drizzle-backed store. Every query is filtered by tenant_id. */
export const drizzleBuyerLabStore: BuyerLabStore = {
  async createProject(tenantId, input: NewProjectInput) {
    const [row] = await getDb().insert(buyerProjects).values({ tenantId, name: input.name, targetUrl: input.targetUrl, brief: input.brief, selfTest: input.selfTest }).returning();
    return toProject(row);
  },
  async listProjects(tenantId) {
    const rows = await getDb().select().from(buyerProjects).where(eq(buyerProjects.tenantId, tenantId)).orderBy(desc(buyerProjects.createdAt));
    return rows.map(toProject);
  },
  async getProject(tenantId, projectId) {
    const [row] = await getDb().select().from(buyerProjects).where(and(eq(buyerProjects.id, projectId), eq(buyerProjects.tenantId, tenantId))).limit(1);
    return row ? toProject(row) : null;
  },
  async deleteProject(tenantId, projectId) {
    const rows = await getDb().delete(buyerProjects).where(and(eq(buyerProjects.id, projectId), eq(buyerProjects.tenantId, tenantId))).returning({ id: buyerProjects.id });
    return rows.length > 0;
  },

  async addSources(tenantId, projectId, sources) {
    await requireProject(tenantId, projectId);
    if (sources.length === 0) return { added: [], duplicates: 0 };
    const base = Date.now();
    const rows = await getDb()
      .insert(buyerSources)
      .values(sources.map((s, index) => ({ tenantId, projectId, kind: s.kind, surface: s.surface, label: s.label, url: s.url, contentHash: s.contentHash, text: s.text, meta: s.meta, fetchedAt: new Date(base + index) })))
      .onConflictDoNothing()
      .returning();
    return { added: rows.map(toSource), duplicates: sources.length - rows.length };
  },
  async listSources(tenantId, projectId) {
    const rows = await getDb().select().from(buyerSources).where(and(eq(buyerSources.projectId, projectId), eq(buyerSources.tenantId, tenantId))).orderBy(buyerSources.fetchedAt);
    return rows.map(toSource);
  },

  async replacePanel(tenantId, projectId, personas: NewPersona[]) {
    await requireProject(tenantId, projectId);
    const db = getDb();
    const base = Date.now();

    // Atomic batch: delete old + insert new in one operation
    const operations: any[] = [];

    // Always delete old personas for this project
    operations.push(
      db.delete(buyerPersonas).where(and(eq(buyerPersonas.projectId, projectId), eq(buyerPersonas.tenantId, tenantId)))
    );

    // Insert new personas if provided
    if (personas.length > 0) {
      operations.push(
        db.insert(buyerPersonas).values(personas.map((p, index) => ({
          tenantId, projectId, archetype: p.archetype, surfaces: p.surfaces, spec: p.spec, edited: p.edited, createdAt: new Date(base + index)
        }))).returning()
      );
    }

    const results = await (db as any).batch(operations);
    const inserted = personas.length > 0 ? (results[1] as typeof buyerPersonas.$inferSelect[]) : [];
    return inserted.map(toPersona);
  },
  async listPersonas(tenantId, projectId) {
    const rows = await getDb().select().from(buyerPersonas).where(and(eq(buyerPersonas.projectId, projectId), eq(buyerPersonas.tenantId, tenantId))).orderBy(buyerPersonas.createdAt);
    return rows.map(toPersona);
  },

  async createRun(tenantId, input) {
    await requireProject(tenantId, input.projectId);
    const [row] = await getDb().insert(buyerRuns).values({ tenantId, projectId: input.projectId, provider: input.provider, status: 'queued', config: input.config, callBudget: input.callBudget, fundedBy: input.fundedBy }).returning();
    return toRun(row);
  },
  async getRun(tenantId, runId) {
    const [row] = await getDb().select().from(buyerRuns).where(and(eq(buyerRuns.id, runId), eq(buyerRuns.tenantId, tenantId))).limit(1);
    return row ? toRun(row) : null;
  },
  async latestRun(tenantId, projectId) {
    const [row] = await getDb().select().from(buyerRuns).where(and(eq(buyerRuns.projectId, projectId), eq(buyerRuns.tenantId, tenantId))).orderBy(desc(buyerRuns.createdAt)).limit(1);
    return row ? toRun(row) : null;
  },
  async updateRun(tenantId, runId, patch) {
    const set: Record<string, unknown> = {};
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.errorCode !== undefined) set.errorCode = patch.errorCode;
    if (patch.startedAt !== undefined) set.startedAt = patch.startedAt ? new Date(patch.startedAt) : null;
    if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt ? new Date(patch.finishedAt) : null;
    if (Object.keys(set).length === 0) return;
    await getDb().update(buyerRuns).set(set).where(and(eq(buyerRuns.id, runId), eq(buyerRuns.tenantId, tenantId)));
  },
  async addCalls(tenantId, runId, n) {
    const [row] = await getDb().update(buyerRuns).set({ callsUsed: sql`${buyerRuns.callsUsed} + ${n}` }).where(and(eq(buyerRuns.id, runId), eq(buyerRuns.tenantId, tenantId))).returning({ calls: buyerRuns.callsUsed });
    if (!row) throw new BuyerLabNotFoundError('run');
    return row.calls;
  },

  async claimStep(tenantId, runId, stepKey, o): Promise<ClaimResult> {
    await requireRun(tenantId, runId);
    const db = getDb();
    const [inserted] = await db.insert(buyerRunSteps).values({ tenantId, runId, stepKey, status: 'running', attempts: 1 }).onConflictDoNothing().returning();
    if (inserted) return { claimed: true, attempt: 1 };

    const [row] = await db.select().from(buyerRunSteps).where(and(eq(buyerRunSteps.runId, runId), eq(buyerRunSteps.stepKey, stepKey), eq(buyerRunSteps.tenantId, tenantId))).limit(1);
    if (!row || row.status === 'done' || row.status === 'failed') return { claimed: false, attempt: row?.attempts ?? 0 };
    const stale = row.status === 'running' && Date.now() - row.startedAt.getTime() >= o.staleAfterMs;
    if (row.status === 'running' && !stale) return { claimed: false, attempt: row.attempts };

    // Optimistic takeover: only the caller whose (status, attempts) still match wins.
    const same = and(eq(buyerRunSteps.id, row.id), eq(buyerRunSteps.status, row.status), eq(buyerRunSteps.attempts, row.attempts));
    if (row.attempts >= o.maxAttempts) {
      await db.update(buyerRunSteps).set({ status: 'failed', output: { error: 'MAX_ATTEMPTS' }, finishedAt: new Date() }).where(same);
      return { claimed: false, attempt: row.attempts };
    }
    const [won] = await db.update(buyerRunSteps).set({ status: 'running', attempts: row.attempts + 1, startedAt: new Date() }).where(same).returning();
    return won ? { claimed: true, attempt: won.attempts } : { claimed: false, attempt: row.attempts };
  },
  async finishStep(tenantId, runId, stepKey, status, output, attempt): Promise<boolean> {
    const rows = await getDb()
      .update(buyerRunSteps)
      .set({ status, output: output as any, finishedAt: status === 'retry' ? null : new Date() })
      .where(and(eq(buyerRunSteps.runId, runId), eq(buyerRunSteps.stepKey, stepKey), eq(buyerRunSteps.tenantId, tenantId), eq(buyerRunSteps.status, 'running' as any), eq(buyerRunSteps.attempts, attempt)))
      .returning({ id: buyerRunSteps.id });
    return rows.length > 0;
  },
  async listSteps(tenantId, runId) {
    const rows = await getDb().select().from(buyerRunSteps).where(and(eq(buyerRunSteps.runId, runId), eq(buyerRunSteps.tenantId, tenantId)));
    return rows.map(toStep);
  },

  async saveOutcome(tenantId, runId, outcome: NormalizedOutcome) {
    await requireRun(tenantId, runId);
    await getDb()
      .insert(buyerOutcomes)
      .values({ runId, tenantId, outcome: outcome as any })
      .onConflictDoUpdate({ target: buyerOutcomes.runId, set: { outcome: outcome as any, builtAt: new Date() }, setWhere: eq(buyerOutcomes.tenantId, tenantId) });
  },
  async getOutcome(tenantId, runId) {
    const [row] = await getDb().select().from(buyerOutcomes).where(and(eq(buyerOutcomes.runId, runId), eq(buyerOutcomes.tenantId, tenantId))).limit(1);
    return row ? (row.outcome as NormalizedOutcome) : null;
  },

  async saveReport(tenantId, runId, report: Report, model) {
    await requireRun(tenantId, runId);
    await getDb()
      .insert(buyerReports)
      .values({ tenantId, runId, body: report as any, model })
      .onConflictDoUpdate({ target: buyerReports.runId, set: { body: report as any, model }, setWhere: eq(buyerReports.tenantId, tenantId) });
  },
  async getReport(tenantId, runId) {
    const [row] = await getDb().select().from(buyerReports).where(and(eq(buyerReports.runId, runId), eq(buyerReports.tenantId, tenantId))).limit(1);
    return row ? (row.body as Report) : null;
  },
  async appendChatTurn(tenantId, runId, personaId, turn) {
    await requireRun(tenantId, runId);
    const [row] = await getDb().insert(buyerChats).values({ tenantId, runId, personaId, role: turn.role, text: turn.text }).returning();
    return { role: row.role as ChatTurn['role'], text: row.text, createdAt: row.createdAt.toISOString() };
  },
  async listChatTurns(tenantId, runId, personaId) {
    const rows = await getDb().select().from(buyerChats).where(and(eq(buyerChats.runId, runId), eq(buyerChats.tenantId, tenantId), eq(buyerChats.personaId, personaId))).orderBy(buyerChats.createdAt);
    return rows.map((r) => ({ role: r.role as ChatTurn['role'], text: r.text, createdAt: r.createdAt.toISOString() }));
  }
};
