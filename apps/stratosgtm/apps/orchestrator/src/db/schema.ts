import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Postgres schema for StratosGTM.
 *
 * Two rules this schema holds to:
 *
 *  1. Every business table carries `tenant_id` and every index leads with it.
 *     Multi-tenant auth is deferred, so today there is one seeded organization —
 *     but adding the column later means backfilling live data, whereas carrying
 *     it now costs nothing.
 *
 *  2. Money is stored as integer cents. The previous in-memory model used
 *     floats, which silently drift once you sum or prorate them.
 *
 * Derived aggregates are deliberately absent. `minutesUsed`, `pipelineGenerated`
 * and `estimatedRoiMultiplier` were stored fields pretending to be state; they
 * are computed from usage_records at read time instead, so they cannot go stale.
 */

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    // Owner-granted: may this workspace spend the SERVER's API keys (voice, models)?
    // False for everyone by default. There are no free credits for clients: a
    // workspace brings its own keys, or the owner switches this on for it.
    serverKeyAccess: boolean('server_key_access').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    slugIdx: uniqueIndex('organizations_slug_idx').on(t.slug)
  })
);

/**
 * Who belongs to which workspace. A user's first sign-in creates one owned
 * workspace. The partial unique index allows exactly one owned workspace per
 * user, so two parallel first requests cannot create two.
 */
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    authUserId: text('auth_user_id').notNull(),
    role: text('role').notNull().default('owner'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    userTenantIdx: uniqueIndex('organization_members_user_tenant_idx').on(t.authUserId, t.tenantId),
    oneOwnedWorkspaceIdx: uniqueIndex('organization_members_one_owned_idx')
      .on(t.authUserId)
      .where(sql`role = 'owner'`),
    userIdx: index('organization_members_user_idx').on(t.authUserId)
  })
);

export const leads = pgTable(
  'leads',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    companyName: text('company_name'),
    source: text('source'),
    status: text('status').notNull().default('new'),
    qualificationScore: integer('qualification_score').notNull().default(0),
    scheduledCallTime: timestamp('scheduled_call_time', { withTimezone: true }),
    matchedOffer: text('matched_offer'),
    // Free-form transcript/annotation trail. Array rather than a child table
    // because nothing queries inside it.
    notes: jsonb('notes').$type<string[]>().notNull().default([]),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tenantRecentIdx: index('leads_tenant_updated_idx').on(t.tenantId, t.updatedAt),
    tenantEmailIdx: index('leads_tenant_email_idx').on(t.tenantId, t.email)
  })
);

export const churnMembers = pgTable(
  'churn_members',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email'),
    tier: text('tier'),
    monthlyValueCents: integer('monthly_value_cents').notNull().default(0),
    riskLevel: text('risk_level').notNull().default('low'),
    status: text('status').notNull().default('active'),
    notes: jsonb('notes').$type<string[]>().notNull().default([]),
    // Full record, so fields without a dedicated column (churn reason, applied
    // discount, bonus offer) round-trip losslessly. Columns above are for querying.
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tenantIdx: index('churn_members_tenant_idx').on(t.tenantId, t.riskLevel)
  })
);

export const voiceSessions = pgTable(
  'voice_sessions',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: text('lead_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    isAfterHours: boolean('is_after_hours').notNull().default(false),
    source: text('source').notNull().default('dashboard'),
    status: text('status').notNull().default('active')
  },
  (t) => ({
    tenantStartedIdx: index('voice_sessions_tenant_started_idx').on(t.tenantId, t.startedAt)
  })
);

/**
 * Append-only usage facts. Every billable event lands here once; the numbers the
 * dashboard shows are SUMs over this table, never a mutable counter.
 */
export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sessionId: text('session_id'),
    kind: text('kind').notNull().default('voice_call'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    leadCaptured: boolean('lead_captured').notNull().default(false),
    isAfterHours: boolean('is_after_hours').notNull().default(false),
    // Measured wall-clock seconds and the whole minutes actually billed
    // (max(1, ceil(seconds / 60))). Minutes used = SUM(billed_minutes).
    billedMinutes: integer('billed_minutes').notNull().default(0),
    // false for the demo tenant, unattributed widget calls and calls without a
    // valid signed call token. Non-billable rows never count toward a quota.
    billable: boolean('billable').notNull().default(true),
    source: text('source').notNull().default('console'),
    dealValueCents: integer('deal_value_cents').notNull().default(0),
    // Set by writers to the subscription's currentPeriodStart (fallback: start
    // of the calendar month). Do not rely on the default.
    periodStart: timestamp('period_start', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tenantPeriodIdx: index('usage_records_tenant_period_idx').on(t.tenantId, t.periodStart),
    // One usage row per call per tenant: a retried finalize hits this and is a no-op.
    tenantSessionIdx: uniqueIndex('usage_records_tenant_session_idx').on(t.tenantId, t.sessionId)
  })
);

/**
 * Public site keys for the embeddable widget. A visitor's page can forge any
 * `data-company` value, so the widget instead presents a public key; the server
 * maps key -> tenant and checks the request Origin against allowed_origins.
 */
export const siteKeys = pgTable(
  'site_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    allowedOrigins: text('allowed_origins').array().notNull().default(sql`'{}'::text[]`),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    publicKeyIdx: uniqueIndex('site_keys_public_key_idx').on(t.publicKey),
    tenantIdx: index('site_keys_tenant_idx').on(t.tenantId)
  })
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull().default('starter'),
    billingCycle: text('billing_cycle').notNull().default('monthly'),
    // Mirrors Stripe rather than inventing our own lifecycle.
    status: text('status').notNull().default('inactive'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripePriceId: text('stripe_price_id'),
    minutesLimit: integer('minutes_limit').notNull().default(0),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    stripeSubIdx: index('subscriptions_stripe_sub_idx').on(t.stripeSubscriptionId)
  })
);

/**
 * Consent evidence. This is what you produce if a regulator or plaintiff asks,
 * so rows are written once and never updated.
 */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    companyName: text('company_name').notNull(),
    region: text('region').notNull(),
    consentRequirement: text('consent_requirement').notNull(),
    consentMethod: text('consent_method').notNull(),
    disclosureText: text('disclosure_text').notNull(),
    disclosedAt: timestamp('disclosed_at', { withTimezone: true }).notNull(),
    consentGrantedAt: timestamp('consent_granted_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tenantCreatedIdx: index('consent_records_tenant_created_idx').on(t.tenantId, t.createdAt),
    sessionIdx: index('consent_records_session_idx').on(t.sessionId)
  })
);

/**
 * Third-party OAuth tokens, encrypted at rest with AES-256-GCM. The plaintext
 * never reaches this table: `ciphertext` holds the encrypted payload, and
 * `wrappedDek` the per-row data key wrapped by MASTER_KEY. `keyVersion` exists
 * so the master key can be rotated without re-encrypting payloads.
 */
export const platformCredentials = pgTable(
  'platform_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    accountHandle: text('account_handle'),
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    wrappedDek: text('wrapped_dek').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    autoPublishEnabled: boolean('auto_publish_enabled').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tenantPlatformIdx: uniqueIndex('platform_credentials_tenant_platform_idx').on(t.tenantId, t.platform)
  })
);

/**
 * Measured voice-call telemetry, one row per call.
 *
 * `call_id` is minted by the browser and is UNIQUE, because the same call is
 * reported several times: a periodic flush, an end-call flush, and a pagehide
 * beacon that may arrive after the socket already closed. Upserting on that key
 * is what makes those retries idempotent instead of triple-counting a call.
 *
 * `greeting_ttfa_ms` is stored on the call, not on a turn, on purpose: the
 * greeting is not a turn and must never enter the per-turn distribution.
 */
export const callRecords = pgTable(
  'call_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    callId: text('call_id').notNull(),
    persona: text('persona'),
    companyName: text('company_name'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    endReason: text('end_reason'),
    greetingTtfaMs: integer('greeting_ttfa_ms'),
    greetingBargeInOffsetMs: integer('greeting_barge_in_offset_ms'),
    turnCount: integer('turn_count').notNull().default(0),
    interruptionCount: integer('interruption_count').notNull().default(0),
    // --- Metering lifecycle (additive; written by usageService, never by telemetry) ---
    // 'open' until usage has been written once, then 'finalized'.
    status: text('status').notNull().default('open'),
    // Attributed from a verified call token. Null/false when the call carried no
    // valid token: such calls never bill anyone.
    billingTenantId: uuid('billing_tenant_id'),
    billable: boolean('billable').notNull().default(false),
    billingSource: text('billing_source'),
    tokenIat: timestamp('token_iat', { withTimezone: true }),
    maxSessionSeconds: integer('max_session_seconds'),
    audioSecondsCaptured: integer('audio_seconds_captured'),
    leadCaptured: boolean('lead_captured').notNull().default(false),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    statusUpdatedIdx: index('call_records_status_updated_idx').on(t.status, t.updatedAt),
    callIdIdx: uniqueIndex('call_records_call_id_idx').on(t.callId),
    tenantStartedIdx: index('call_records_tenant_started_idx').on(t.tenantId, t.startedAt)
  })
);

/**
 * One row per measured conversational turn. Latencies are nullable because a
 * turn where the agent never produced audio has nothing to measure, and a null
 * is the honest record of that — summarisation skips it rather than treating a
 * zero as a fast reply.
 */
export const callTurns = pgTable(
  'call_turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    callId: text('call_id').notNull(),
    turnIndex: integer('turn_index').notNull(),
    /**
     * HEADLINE: last voiced mic frame -> first agent audio. Measured by the
     * browser. This, and only this, is what may be quoted as response latency.
     */
    userPerceivedLatencyMs: integer('user_perceived_latency_ms'),
    /** Last voiced mic frame -> the server's input.speech.stopped. */
    endpointingDelayMs: integer('endpointing_delay_ms'),
    /**
     * input.speech.stopped -> first agent audio. The column keeps its original
     * name `response_latency_ms` and its original meaning (nothing is repurposed
     * or dropped); only the TS property is renamed, because "response latency"
     * read as the headline and this interval starts AFTER the server has already
     * waited out ~1s of silence. Never quote it on its own.
     */
    postEndpointLatencyMs: integer('response_latency_ms'),
    /** Replies the agent produced within this one turn. 0 on rows written before this column existed. */
    segmentCount: integer('segment_count').notNull().default(0),
    generationLatencyMs: integer('generation_latency_ms'),
    interrupted: boolean('interrupted').notNull().default(false),
    bargeInOffsetMs: integer('barge_in_offset_ms'),
    toolCalls: integer('tool_calls').notNull().default(0),
    toolLatencyMs: integer('tool_latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    callTurnIdx: uniqueIndex('call_turns_call_turn_idx').on(t.callId, t.turnIndex),
    tenantCreatedIdx: index('call_turns_tenant_created_idx').on(t.tenantId, t.createdAt)
  })
);

export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type ChurnMember = typeof churnMembers.$inferSelect;
export type VoiceSession = typeof voiceSessions.$inferSelect;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type ConsentRecordRow = typeof consentRecords.$inferSelect;
export type PlatformCredentialRow = typeof platformCredentials.$inferSelect;
export type CallRecordRow = typeof callRecords.$inferSelect;
export type SiteKeyRow = typeof siteKeys.$inferSelect;
export type CallTurnRow = typeof callTurns.$inferSelect;

// ---------------------------------------------------------------------------
// Eval harness results. Additive only. Deployment-level, not tenant data: an
// eval run grades the agent, not a customer, so there is no tenant_id here.
// ---------------------------------------------------------------------------

/**
 * One row per eval suite run. `mode` is the honesty column: 'measured' means a
 * live model produced the agent turns, 'offline' means a scripted stub replayed
 * recorded tool calls (harness check only). Readers must never present an
 * offline row as a model measurement. Aggregates (rates, intervals, pass^k) live
 * in `summary`; trials are in eval_trials.
 */
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mode: text('mode').notNull(),
    suite: text('suite').notNull(),
    model: text('model'),
    k: integer('k').notNull(),
    totalTasks: integer('total_tasks').notNull(),
    totalTrials: integer('total_trials').notNull(),
    erroredTrials: integer('errored_trials').notNull().default(0),
    /** 'server' (POST /api/evals/run) or 'ci' (POST /api/evals/runs). */
    source: text('source').notNull(),
    gitSha: text('git_sha'),
    summary: jsonb('summary').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    modeCreatedIdx: index('eval_runs_mode_created_idx').on(t.mode, t.createdAt)
  })
);

export const evalTrials = pgTable(
  'eval_trials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => evalRuns.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(),
    trial: integer('trial').notNull(),
    status: text('status').notNull(),
    latencyMs: integer('latency_ms').notNull().default(0),
    /** Verdicts, tool calls, replies and any error for this trial. */
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    runTaskIdx: index('eval_trials_run_task_idx').on(t.runId, t.taskId)
  })
);

export type EvalRunRow = typeof evalRuns.$inferSelect;
export type EvalTrialRow = typeof evalTrials.$inferSelect;
