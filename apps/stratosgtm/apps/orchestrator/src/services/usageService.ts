import { randomBytes } from 'crypto';
import {
  resolveTenantId,
  getSubscription,
  getUsageAggregate,
  finalizeCallUsage,
  attachCallBilling,
  getCallRecordByCallId,
  listStaleOpenCalls,
  markCallLeadCaptured,
  findSiteKey,
  insertSiteKey,
  getServerKeyAccess
} from '../db/repository';
import type { CallLifecycleRow } from '../db/repository/billing';
import { isDatabaseConfigured } from '../db/client';
import { verifyCallToken, type CallSource } from './callTokenService';

/**
 * Real usage metering.
 *
 * HONEST LIMITS, read these before trusting any number:
 *
 *  - Audio flows browser <-> AssemblyAI directly. This server never sees it, so
 *    there is NO mid-call cutoff and no per-second enforcement. Enforcement is
 *    mint-time only: the token route refuses to mint when the quota is spent
 *    (402 MINUTES_EXHAUSTED) and passes maxSessionSeconds (<= 3600, and <= the
 *    minutes remaining) as max_session_duration_seconds on the mint URL.
 *  - Billed time is CLIENT-REPORTED, bounded by a token we signed:
 *      billedSeconds = min(reported audio seconds,
 *                          clamp(endedAt - token.iat, 0, token.maxSessionSeconds))
 *    A client can under-report, never claim more than the token's lifetime.
 *  - Concurrent mints can each pass the entitlement check, so a tenant can
 *    overshoot its quota by up to (parallel calls x maxSessionSeconds).
 */

const MAX_SESSION_CAP_SECONDS = 3600;
const LOW_MINUTES_RATIO = 0.9;
export const STALE_CALL_MS = 5 * 60 * 1000;
export const STALE_BATCH_LIMIT = 50;

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

export interface BilledSecondsInput {
  /** Client-reported seconds of captured audio. Non-finite/negative counts as 0. */
  reportedAudioSeconds: number | null | undefined;
  /** Token issue time, epoch seconds. */
  tokenIatSeconds: number;
  endedAtMs: number;
  maxSessionSeconds: number;
}

export function computeBilledSeconds(input: BilledSecondsInput): number {
  const reported =
    typeof input.reportedAudioSeconds === 'number' && Number.isFinite(input.reportedAudioSeconds)
      ? Math.max(0, input.reportedAudioSeconds)
      : 0;
  const lifetime = Math.min(
    Math.max(0, input.endedAtMs / 1000 - input.tokenIatSeconds),
    Math.max(0, input.maxSessionSeconds)
  );
  return Math.round(Math.min(reported, lifetime));
}

/** Whole minutes billed: rounded up, with a floor of one minute per call. */
export function computeBilledMinutes(billedSeconds: number): number {
  return Math.max(1, Math.ceil(billedSeconds / 60));
}

/** Subscription period start, or the first of the (UTC) calendar month. */
export function billingPeriodStart(
  sub: { currentPeriodStart?: Date | null } | null | undefined,
  now: Date = new Date()
): Date {
  if (sub?.currentPeriodStart) return new Date(sub.currentPeriodStart);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface Entitlement {
  allowed: boolean;
  minutesUsed: number;
  minutesLimit: number;
  minutesRemaining: number;
  warning?: 'MINUTES_LOW';
  maxSessionSeconds: number;
  /** False when no database is configured: nothing can be metered, so nothing is enforced. */
  metered?: boolean;
}

export function evaluateEntitlement(minutesUsed: number, minutesLimit: number): Entitlement {
  const remaining = Math.max(0, minutesLimit - minutesUsed);
  const allowed = remaining > 0;
  const entitlement: Entitlement = {
    allowed,
    minutesUsed,
    minutesLimit,
    minutesRemaining: remaining,
    maxSessionSeconds: allowed ? Math.min(MAX_SESSION_CAP_SECONDS, Math.floor(remaining * 60)) : 0,
    metered: true
  };
  if (allowed && minutesLimit > 0 && minutesUsed / minutesLimit >= LOW_MINUTES_RATIO) {
    entitlement.warning = 'MINUTES_LOW';
  }
  return entitlement;
}

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

/**
 * True when the owner has granted this workspace the server's API keys. Fails
 * CLOSED (false) on any error: an unknown answer must never hand out
 * server-funded usage.
 */
export async function hasServerKeyAccess(tenantId: string): Promise<boolean> {
  try {
    return await getServerKeyAccess(tenantId);
  } catch (err: any) {
    console.warn('[Usage] Could not read server-key access, treating as not granted:', err?.name);
    return false;
  }
}

/**
 * Whether `tenantId` may start another billable call. Call only for billable
 * tenants (never for the demo or unattributed tenants).
 *
 * A tenant with no subscription row gets FREE_TRIAL_MINUTES (default 0), so an
 * unpaid workspace is refused unless the operator has explicitly granted a trial.
 * The intended policy is to leave FREE_TRIAL_MINUTES unset: clients bring their own
 * keys, and the owner grants server-key access per workspace instead.
 */
export async function checkEntitlement(tenantId: string): Promise<Entitlement> {
  if (!isDatabaseConfigured()) {
    return {
      allowed: true,
      minutesUsed: 0,
      minutesLimit: 0,
      minutesRemaining: 0,
      maxSessionSeconds: MAX_SESSION_CAP_SECONDS,
      metered: false
    };
  }
  const sub = await getSubscription(tenantId);
  const trial = Math.max(0, Number(process.env.FREE_TRIAL_MINUTES) || 0);
  const minutesLimit = sub ? sub.minutesLimit : trial;
  const aggregate = await getUsageAggregate(tenantId, billingPeriodStart(sub));
  return evaluateEntitlement(aggregate?.minutesUsed ?? 0, minutesLimit);
}

// ---------------------------------------------------------------------------
// Whose minutes does a call spend? (used by the token route at mint time)
// ---------------------------------------------------------------------------

export interface CallAttribution {
  tenantId: string;
  source: CallSource;
  billable: boolean;
}

export const DEMO_TENANT_NAME = 'demo';
export const UNATTRIBUTED_TENANT_NAME = 'unattributed';

function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Server-side tenant resolution:
 *  - signed-in console      -> the workspace tenant, billable
 *  - anonymous console      -> the 'demo' tenant, billable=false
 *  - widget with valid key  -> the key's tenant (Origin must be allow-listed), billable
 *  - widget otherwise       -> 'unattributed', billable=false
 * Returns null only when no database exists to hold tenants.
 */
export async function resolveCallAttribution(input: {
  channel: 'console' | 'widget';
  workspaceTenantId?: string | null;
  siteKey?: string | null;
  origin?: string | null;
}): Promise<CallAttribution | null> {
  if (input.channel === 'console') {
    if (input.workspaceTenantId) {
      return { tenantId: input.workspaceTenantId, source: 'console', billable: true };
    }
    const demo = await resolveTenantId(DEMO_TENANT_NAME);
    return demo ? { tenantId: demo, source: 'console_anon', billable: false } : null;
  }

  if (input.siteKey) {
    const key = await findSiteKey(input.siteKey);
    const origin = normalizeOrigin(input.origin);
    if (key && !key.revokedAt && origin && key.allowedOrigins.map((o) => o.toLowerCase()).includes(origin)) {
      return { tenantId: key.tenantId, source: 'widget', billable: true };
    }
  }
  const unattributed = await resolveTenantId(UNATTRIBUTED_TENANT_NAME);
  return unattributed ? { tenantId: unattributed, source: 'widget_unattributed', billable: false } : null;
}

/** Operator helper (no UI): mint a public site key for a tenant. */
export async function seedSiteKey(tenantId: string, allowedOrigins: string[]) {
  const origins = allowedOrigins.map(normalizeOrigin).filter((o): o is string => Boolean(o));
  if (origins.length === 0) throw new Error('seedSiteKey needs at least one valid origin, e.g. https://example.com');
  const publicKey = `gv_pk_${randomBytes(16).toString('hex')}`;
  const row = await insertSiteKey(tenantId, publicKey, origins);
  return row ? { publicKey, allowedOrigins: origins } : null;
}

// ---------------------------------------------------------------------------
// Call lifecycle -> usage
// ---------------------------------------------------------------------------

export interface FinalizeResult {
  written: boolean;
  billedSeconds: number;
  billedMinutes: number;
  billable: boolean;
}

/**
 * Turns one finished (or abandoned) call_records row into exactly one usage
 * row. Safe to call repeatedly: finalized calls are skipped, and the unique
 * (tenant_id, session_id) index makes a racing duplicate insert a no-op.
 */
export async function finalizeCall(record: CallLifecycleRow): Promise<FinalizeResult> {
  if (record.status === 'finalized') {
    return { written: false, billedSeconds: 0, billedMinutes: 0, billable: record.billable };
  }

  // No verified token means we cannot say who to bill: park it, unbilled, on
  // 'unattributed'. record.tenantId came from a forgeable company name.
  const attributed = record.billingTenantId != null;
  const billable = attributed && record.billable;
  const tenantId = attributed
    ? (record.billingTenantId as string)
    : ((await resolveTenantId(UNATTRIBUTED_TENANT_NAME)) as string | null);
  if (!tenantId) return { written: false, billedSeconds: 0, billedMinutes: 0, billable: false };

  const endedAt = record.endedAt ?? record.updatedAt;
  const iatSeconds = record.tokenIat ? record.tokenIat.getTime() / 1000 : record.startedAt.getTime() / 1000;
  const reported =
    record.audioSecondsCaptured ?? (record.durationMs != null ? record.durationMs / 1000 : 0);

  const billedSeconds = computeBilledSeconds({
    reportedAudioSeconds: reported,
    tokenIatSeconds: iatSeconds,
    endedAtMs: endedAt.getTime(),
    maxSessionSeconds: record.maxSessionSeconds ?? MAX_SESSION_CAP_SECONDS
  });
  const billedMinutes = computeBilledMinutes(billedSeconds);
  const sub = await getSubscription(tenantId);

  const written = await finalizeCallUsage(record.callId, tenantId, {
    sessionId: record.callId,
    durationSeconds: billedSeconds,
    billedMinutes,
    billable,
    source: record.billingSource ?? 'untokened',
    leadCaptured: record.leadCaptured,
    // Business hours are not configured anywhere, so this is not measured.
    isAfterHours: false,
    // Deal value is not measured either; pipeline stays 0 until a real value is recorded.
    dealValueCents: 0,
    periodStart: billingPeriodStart(sub, endedAt)
  });
  return { written, billedSeconds, billedMinutes, billable };
}

/**
 * Lazy reconciliation (no cron): closes open calls whose last heartbeat is more
 * than STALE_CALL_MS old, using that heartbeat as the end time. Bounded per run.
 */
export async function finalizeStaleCalls(now: Date = new Date()): Promise<number> {
  const stale = await listStaleOpenCalls(new Date(now.getTime() - STALE_CALL_MS), STALE_BATCH_LIMIT);
  let written = 0;
  for (const record of stale) {
    try {
      const result = await finalizeCall(record);
      if (result.written) written += 1;
    } catch (err: any) {
      console.error('[Usage] Failed to finalize stale call', record.callId, err?.message);
    }
  }
  return written;
}

/** Server-authoritative lead flag; call from the tool dispatcher on a successful qualify_lead. */
export async function markLeadCaptured(callId: string): Promise<void> {
  await markCallLeadCaptured(callId);
}

// ---------------------------------------------------------------------------
// Telemetry ingest hook
// ---------------------------------------------------------------------------

/**
 * Called by POST /api/telemetry/calls after the call row is upserted. Verifies
 * the echoed call token (bound to this callId), stores its claims and the latest
 * client-reported audio seconds, and finalizes the call when it carries an end.
 * Best-effort: metering must never fail telemetry ingest.
 */
export async function onTelemetryIngest(
  body: unknown,
  call: { callId: string; endedAt: Date | null }
): Promise<void> {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const verified = verifyCallToken(raw.callToken);

  if (verified.ok && verified.claims.callId === call.callId) {
    const audio = raw.audioSecondsCaptured;
    await attachCallBilling(call.callId, {
      billingTenantId: verified.claims.tenantId,
      source: verified.claims.source,
      billable: verified.claims.billable,
      tokenIat: new Date(verified.claims.iat * 1000),
      maxSessionSeconds: verified.claims.maxSessionSeconds,
      audioSecondsCaptured:
        typeof audio === 'number' && Number.isFinite(audio) && audio >= 0 ? Math.round(audio) : null,
      // Client-reported; markLeadCaptured() is the authoritative server-side path.
      leadCaptured: raw.qualifyLeadSucceeded === true
    });
  }

  if (call.endedAt) {
    const record = await getCallRecordByCallId(call.callId);
    if (record) await finalizeCall(record);
  }
}
