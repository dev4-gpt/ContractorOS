import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../client';
import { subscriptions, usageRecords, callRecords, siteKeys } from '../schema';

export interface SubscriptionState {
  planId: string;
  billingCycle: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  minutesLimit: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

/**
 * Writes subscription state from a verified Stripe webhook. This is the row that
 * decides whether a customer is entitled to service, so it is the one piece of
 * state that absolutely cannot live only in memory.
 */
export async function upsertSubscription(tenantId: string, state: SubscriptionState): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const db = getDb();

  await db
    .insert(subscriptions)
    .values({ tenantId, ...state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: subscriptions.tenantId,
      set: { ...state, updatedAt: new Date() }
    });
}

export async function getSubscription(tenantId: string) {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1);
  return rows[0] ?? null;
}

export interface UsageEvent {
  sessionId: string;
  durationSeconds: number;
  billedMinutes: number;
  billable: boolean;
  source: string;
  leadCaptured: boolean;
  isAfterHours: boolean;
  dealValueCents: number;
  /** Subscription currentPeriodStart, or the calendar-month start. Never omitted. */
  periodStart: Date;
}

/**
 * Writes one usage fact. Idempotent on (tenant_id, session_id): a retried
 * finalize hits the unique index and inserts nothing. Returns true only when a
 * row was actually written.
 */
export async function recordUsage(tenantId: string, event: UsageEvent): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const db = getDb();
  const rows = await db
    .insert(usageRecords)
    .values({ tenantId, ...event })
    .onConflictDoNothing({ target: [usageRecords.tenantId, usageRecords.sessionId] })
    .returning({ id: usageRecords.id });
  return rows.length > 0;
}

/**
 * Writes the usage fact AND flips the call to 'finalized' in one batch, so a
 * crash cannot leave a finalized call with no usage row (or the reverse).
 * Returns true when the usage row was newly inserted.
 */
export async function finalizeCallUsage(
  callId: string,
  tenantId: string,
  event: UsageEvent
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const db = getDb();
  const [inserted] = (await (db as any).batch([
    db
      .insert(usageRecords)
      .values({ tenantId, ...event })
      .onConflictDoNothing({ target: [usageRecords.tenantId, usageRecords.sessionId] })
      .returning({ id: usageRecords.id }),
    db
      .update(callRecords)
      .set({ status: 'finalized', finalizedAt: new Date() })
      .where(eq(callRecords.callId, callId))
  ])) as Array<Array<{ id: string }>>;
  return inserted.length > 0;
}

/**
 * Aggregates BILLABLE usage for the current billing period.
 *
 * These numbers are SUMs over the append-only fact table, never a stored
 * counter. A counter drifts the moment a write is retried or a process restarts
 * mid-update; a SUM cannot. Non-billable rows (demo, unattributed) are excluded.
 */
export async function getUsageAggregate(tenantId: string, periodStart: Date) {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();

  const rows = await db
    .select({
      totalMinutes: sql<number>`COALESCE(SUM(${usageRecords.billedMinutes}), 0)::int`,
      callsCount: sql<number>`COUNT(*)::int`,
      leadsCaptured: sql<number>`COALESCE(SUM(CASE WHEN ${usageRecords.leadCaptured} THEN 1 ELSE 0 END), 0)::int`,
      pipelineCents: sql<number>`COALESCE(SUM(CASE WHEN ${usageRecords.leadCaptured} THEN ${usageRecords.dealValueCents} ELSE 0 END), 0)::bigint`
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.tenantId, tenantId),
        eq(usageRecords.billable, true),
        gte(usageRecords.periodStart, periodStart)
      )
    );

  const r = rows[0];
  return {
    minutesUsed: Number(r.totalMinutes),
    callsCount: Number(r.callsCount),
    leadsCaptured: Number(r.leadsCaptured),
    pipelineGeneratedUsd: Number(r.pipelineCents) / 100
  };
}

// ---------------------------------------------------------------------------
// Call lifecycle (metering columns on call_records)
// ---------------------------------------------------------------------------

export interface CallBillingContext {
  billingTenantId: string;
  source: string;
  billable: boolean;
  tokenIat: Date;
  maxSessionSeconds: number;
  audioSecondsCaptured?: number | null;
  leadCaptured?: boolean;
}

/**
 * Records the verified token claims and latest client-reported audio seconds on
 * the call. Only touches metering columns, and never reopens a finalized call.
 * The lead flag is sticky: once true it stays true.
 */
export async function attachCallBilling(callId: string, ctx: CallBillingContext): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const db = getDb();
  await db
    .update(callRecords)
    .set({
      billingTenantId: ctx.billingTenantId,
      billingSource: ctx.source,
      billable: ctx.billable,
      tokenIat: ctx.tokenIat,
      maxSessionSeconds: ctx.maxSessionSeconds,
      ...(ctx.audioSecondsCaptured != null ? { audioSecondsCaptured: ctx.audioSecondsCaptured } : {}),
      ...(ctx.leadCaptured ? { leadCaptured: true } : {})
    })
    .where(and(eq(callRecords.callId, callId), eq(callRecords.status, 'open')));
}

/** Server-authoritative lead flag (e.g. from the qualify_lead tool dispatcher). */
export async function markCallLeadCaptured(callId: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDb().update(callRecords).set({ leadCaptured: true }).where(eq(callRecords.callId, callId));
}

export type CallLifecycleRow = typeof callRecords.$inferSelect;

export async function getCallRecordByCallId(callId: string): Promise<CallLifecycleRow | null> {
  if (!isDatabaseConfigured()) return null;
  const rows = await getDb().select().from(callRecords).where(eq(callRecords.callId, callId)).limit(1);
  return rows[0] ?? null;
}

/** Open calls whose last heartbeat is older than `olderThan`, oldest first, bounded. */
export async function listStaleOpenCalls(olderThan: Date, limit: number): Promise<CallLifecycleRow[]> {
  if (!isDatabaseConfigured()) return [];
  return getDb()
    .select()
    .from(callRecords)
    .where(and(eq(callRecords.status, 'open'), lt(callRecords.updatedAt, olderThan)))
    .orderBy(callRecords.updatedAt)
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Site keys
// ---------------------------------------------------------------------------

export async function findSiteKey(publicKey: string) {
  if (!isDatabaseConfigured()) return null;
  const rows = await getDb().select().from(siteKeys).where(eq(siteKeys.publicKey, publicKey)).limit(1);
  return rows[0] ?? null;
}

export async function insertSiteKey(tenantId: string, publicKey: string, allowedOrigins: string[]) {
  if (!isDatabaseConfigured()) return null;
  const rows = await getDb()
    .insert(siteKeys)
    .values({ tenantId, publicKey, allowedOrigins })
    .returning();
  return rows[0] ?? null;
}
