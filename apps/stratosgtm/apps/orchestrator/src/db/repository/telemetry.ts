import { and, gte, eq, desc } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../client';
import { callRecords, callTurns } from '../schema';
import { resolveTenantId } from './tenant';
import type { ValidatedCall } from '../../services/telemetryService';

/**
 * Persistence for measured call telemetry.
 *
 * Everything here is idempotent. The same call is reported repeatedly — a
 * 15-second flush, the end-call flush, and a pagehide beacon that can land after
 * the socket closed — so writes upsert on (call_id) and (call_id, turn_index)
 * rather than appending. Without that, a single call's turns would be counted
 * as many times as the browser managed to flush, and every percentile derived
 * from them would be wrong in a way nobody would notice.
 */

const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME || 'Acme Coaching Co.';

export interface PersistResult {
  persisted: boolean;
  turnsWritten: number;
}

export async function persistCallTelemetry(call: ValidatedCall): Promise<PersistResult> {
  if (!isDatabaseConfigured()) return { persisted: false, turnsWritten: 0 };

  const tenantId = await resolveTenantId(call.companyName || DEFAULT_TENANT_NAME);
  if (!tenantId) return { persisted: false, turnsWritten: 0 };

  const db = getDb();

  const recordSet = {
    tenantId,
    persona: call.persona,
    companyName: call.companyName,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    durationMs: call.durationMs,
    endReason: call.endReason,
    greetingTtfaMs: call.greetingTtfaMs,
    greetingBargeInOffsetMs: call.greetingBargeInOffsetMs,
    turnCount: call.turnCount,
    interruptionCount: call.interruptionCount,
    updatedAt: new Date()
  };

  const statements: any[] = [
    db
      .insert(callRecords)
      .values({ callId: call.callId, ...recordSet })
      .onConflictDoUpdate({ target: callRecords.callId, set: recordSet })
  ];

  for (const turn of call.turns) {
    const turnSet = {
      tenantId,
      userPerceivedLatencyMs: turn.userPerceivedLatencyMs,
      endpointingDelayMs: turn.endpointingDelayMs,
      postEndpointLatencyMs: turn.postEndpointLatencyMs,
      segmentCount: turn.segmentCount,
      generationLatencyMs: turn.generationLatencyMs,
      interrupted: turn.interrupted,
      bargeInOffsetMs: turn.bargeInOffsetMs,
      toolCalls: turn.toolCalls,
      toolLatencyMs: turn.toolLatencyMs
    };
    statements.push(
      db
        .insert(callTurns)
        .values({ callId: call.callId, turnIndex: turn.turnIndex, ...turnSet })
        .onConflictDoUpdate({
          target: [callTurns.callId, callTurns.turnIndex],
          set: turnSet
        })
    );
  }

  // The Neon HTTP driver has no interactive transactions; batch is the atomic
  // unit available, and it keeps a 200-turn flush to one round trip.
  await (db as any).batch(statements);

  return { persisted: true, turnsWritten: call.turns.length };
}

export interface TelemetryWindow {
  turns: Array<{
    userPerceivedLatencyMs: number | null;
    endpointingDelayMs: number | null;
    postEndpointLatencyMs: number | null;
    generationLatencyMs: number | null;
    interrupted: boolean;
  }>;
  greetingTtfaMs: Array<number | null>;
  callCount: number;
}

/** Everything measured since `since`, for summarisation. */
export async function loadTelemetryWindow(
  since: Date,
  limit = 5000
): Promise<TelemetryWindow | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();

  const turnRows = await db
    .select({
      userPerceivedLatencyMs: callTurns.userPerceivedLatencyMs,
      endpointingDelayMs: callTurns.endpointingDelayMs,
      postEndpointLatencyMs: callTurns.postEndpointLatencyMs,
      generationLatencyMs: callTurns.generationLatencyMs,
      interrupted: callTurns.interrupted
    })
    .from(callTurns)
    .where(gte(callTurns.createdAt, since))
    .orderBy(desc(callTurns.createdAt))
    .limit(limit);

  const callRows = await db
    .select({ greetingTtfaMs: callRecords.greetingTtfaMs })
    .from(callRecords)
    .where(gte(callRecords.startedAt, since))
    .orderBy(desc(callRecords.startedAt))
    .limit(limit);

  return {
    turns: turnRows,
    greetingTtfaMs: callRows.map((r) => r.greetingTtfaMs),
    callCount: callRows.length
  };
}

/** Single call readout, used for debugging a specific session. */
export async function getCallTelemetry(callId: string) {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  const [record] = await db
    .select()
    .from(callRecords)
    .where(eq(callRecords.callId, callId))
    .limit(1);
  if (!record) return null;
  const turns = await db
    .select()
    .from(callTurns)
    .where(and(eq(callTurns.callId, callId)))
    .orderBy(callTurns.turnIndex);
  return { record, turns };
}
