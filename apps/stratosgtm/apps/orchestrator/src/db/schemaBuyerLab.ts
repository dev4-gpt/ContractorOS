import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './schema';

/**
 * Buyer Lab tables. Every table carries tenant_id (cascade on delete) and every
 * read or write is scoped by it. Kept out of schema.ts, which is near the file-size limit.
 */
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });

export const buyerProjects = pgTable(
  'buyer_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    targetUrl: text('target_url'),
    brief: text('brief'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Marks StratosGTM's own project. Only a self-test project's runs attempt the converse step. */
    selfTest: boolean('self_test').notNull().default(false)
  },
  (t) => ({ tenantIdx: index('buyer_projects_tenant_idx').on(t.tenantId, t.createdAt) })
);

export const buyerSources = pgTable(
  'buyer_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    projectId: uuid('project_id').notNull().references(() => buyerProjects.id, { onDelete: 'cascade' }),
    /** crawl | brief | upload | agent. Raw text only; agent rows are conversation transcripts. */
    kind: text('kind').notNull(),
    /** public | signed_in */
    surface: text('surface').notNull(),
    label: text('label').notNull(),
    url: text('url'),
    contentHash: text('content_hash').notNull(),
    text: text('text').notNull(),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    projectIdx: index('buyer_sources_project_idx').on(t.tenantId, t.projectId),
    // Re-ingesting identical text is a no-op; changed text is a new immutable snapshot.
    hashIdx: uniqueIndex('buyer_sources_project_hash_idx').on(t.projectId, t.contentHash)
  })
);

export const buyerPersonas = pgTable(
  'buyer_personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    projectId: uuid('project_id').notNull().references(() => buyerProjects.id, { onDelete: 'cascade' }),
    archetype: text('archetype').notNull(),
    /** Which source surfaces this persona is shown: ["public"] or ["public","signed_in"]. */
    surfaces: jsonb('surfaces').notNull().default(sql`'["public"]'::jsonb`),
    spec: jsonb('spec').notNull(),
    edited: boolean('edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ projectIdx: index('buyer_personas_project_idx').on(t.tenantId, t.projectId) })
);

export const buyerRuns = pgTable(
  'buyer_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    projectId: uuid('project_id').notNull().references(() => buyerProjects.id, { onDelete: 'cascade' }),
    /** native | mirofish */
    provider: text('provider').notNull(),
    /** queued | running | done | failed | budget_exhausted */
    status: text('status').notNull().default('queued'),
    /** { personaIds: string[], sourceIds: string[] } snapshot taken at start. */
    config: jsonb('config').notNull(),
    callsUsed: integer('calls_used').notNull().default(0),
    callBudget: integer('call_budget').notNull(),
    /** byok | server_grant */
    fundedBy: text('funded_by').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ projectIdx: index('buyer_runs_project_idx').on(t.tenantId, t.projectId, t.createdAt) })
);

export const buyerRunSteps = pgTable(
  'buyer_run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    runId: uuid('run_id').notNull().references(() => buyerRuns.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    /** running | retry | done | failed */
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(1),
    output: jsonb('output'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true })
  },
  // The insert-or-nothing on this key is the claim lock: a retried or concurrent step cannot run twice.
  (t) => ({ stepIdx: uniqueIndex('buyer_run_steps_run_step_idx').on(t.runId, t.stepKey) })
);

export const buyerOutcomes = pgTable('buyer_outcomes', {
  runId: uuid('run_id').primaryKey().references(() => buyerRuns.id, { onDelete: 'cascade' }),
  tenantId: tenantId(),
  outcome: jsonb('outcome').notNull(),
  builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow()
});

export const buyerReports = pgTable(
  'buyer_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    runId: uuid('run_id').notNull().references(() => buyerRuns.id, { onDelete: 'cascade' }),
    /** { headline, findings: [{text, claimIds}], recommendations: [{text, claimIds, rewrite}], disclaimer, generatedAt } */
    body: jsonb('body').notNull(),
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    runIdx: uniqueIndex('buyer_reports_run_idx').on(t.runId) // one report per run; a second GET regenerates via delete+insert, never two rows
  })
);

export const buyerChats = pgTable(
  'buyer_chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    runId: uuid('run_id').notNull().references(() => buyerRuns.id, { onDelete: 'cascade' }),
    personaId: uuid('persona_id').notNull(),
    /** user | persona */
    role: text('role').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ runPersonaIdx: index('buyer_chats_run_persona_idx').on(t.tenantId, t.runId, t.personaId, t.createdAt) })
);
