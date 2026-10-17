import { Router, Request, Response } from 'express';
import {
  HEADLINE_METRIC,
  validateCallPayload,
  summarizeTurns,
  MIN_SAMPLE_SIZE,
  MAX_PAYLOAD_BYTES
} from '../services/telemetryService';
import { persistCallTelemetry, loadTelemetryWindow, getCallTelemetry } from '../db/repository';
import { isDatabaseConfigured } from '../db/client';
import { onTelemetryIngest } from '../services/usageService';

export const telemetryRouter = Router();

/**
 * POST /api/telemetry/calls
 *
 * Ingest for browser-measured call latency. Public for the same reason the
 * voice token endpoint is: the embedded widget runs on customer origins and has
 * no dashboard credentials. It is rate limited in index.ts, capped by size and
 * turn count here, and every write is idempotent — a hostile caller can waste
 * its own quota but cannot inflate a percentile by replaying a batch.
 *
 * Answers 202 rather than 200: the browser never waits on this, and treating a
 * failure as fatal to the call would be worse than losing a sample.
 */
telemetryRouter.post('/calls', async (req: Request, res: Response) => {
  const declaredLength = Number(req.header('content-length') || 0);
  const validation = validateCallPayload(req.body, declaredLength || undefined);

  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error, code: validation.code });
  }

  const call = validation.value;

  if (!isDatabaseConfigured()) {
    // Degrade honestly: say the sample was dropped instead of acknowledging a
    // write that never happened.
    return res.status(202).json({
      status: 'discarded',
      reason: 'no_datastore',
      callId: call.callId,
      turnsAccepted: 0
    });
  }

  try {
    const result = await persistCallTelemetry(call);

    // --- usage metering hook (usageService) -----------------------------------
    // Binds the echoed call token to this call and, when the payload carries an
    // end, finalizes usage exactly once. Best-effort: never fails ingest.
    if (result.persisted) {
      try {
        await onTelemetryIngest(req.body, { callId: call.callId, endedAt: call.endedAt });
      } catch (err: any) {
        console.error('[Usage] Metering hook failed:', err?.message);
      }
    }
    // --- end usage metering hook ----------------------------------------------
    return res.status(202).json({
      status: result.persisted ? 'accepted' : 'discarded',
      callId: call.callId,
      turnsAccepted: result.turnsWritten
    });
  } catch (err: any) {
    console.error('[Telemetry] Ingest failed:', err?.message);
    return res.status(500).json({ error: 'Failed to record telemetry', code: 'INGEST_FAILED' });
  }
});

/**
 * GET /api/telemetry/summary?days=7
 *
 * The gate on every latency claim this project makes. The headline is
 * userPerceivedLatencyMs (voice ends -> agent audio), never the narrower
 * post-endpoint interval. Below MIN_SAMPLE_SIZE turns with that measurement it returns `insufficient_data` and the sample size, and emits
 * no percentile at all. That is deliberate and is not a placeholder: the docs
 * state that no latency figure may be quoted until one has been measured, and
 * this is where that rule is enforced rather than remembered.
 */
telemetryRouter.get('/summary', async (req: Request, res: Response) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  if (!isDatabaseConfigured()) {
    return res.json({
      status: 'insufficient_data',
      metric: HEADLINE_METRIC,
      sampleSize: 0,
      requiredSampleSize: MIN_SAMPLE_SIZE,
      windowDays: days,
      reason: 'no_datastore'
    });
  }

  try {
    const window = await loadTelemetryWindow(since);
    if (!window) {
      return res.json({
        status: 'insufficient_data',
        metric: HEADLINE_METRIC,
        sampleSize: 0,
        requiredSampleSize: MIN_SAMPLE_SIZE,
        windowDays: days
      });
    }

    const summary = summarizeTurns({
      turns: window.turns,
      greetingTtfaMs: window.greetingTtfaMs,
      callCount: window.callCount
    });

    return res.json({ ...summary, windowDays: days });
  } catch (err: any) {
    console.error('[Telemetry] Summary failed:', err?.message);
    return res.status(500).json({ error: 'Failed to summarise telemetry', code: 'SUMMARY_FAILED' });
  }
});

/** GET /api/telemetry/calls/:callId — single-call readout for debugging. */
telemetryRouter.get('/calls/:callId', async (req: Request, res: Response) => {
  try {
    const found = await getCallTelemetry(req.params.callId);
    if (!found) return res.status(404).json({ error: 'No telemetry for that call id' });
    return res.json({ status: 'success', ...found });
  } catch (err: any) {
    console.error('[Telemetry] Lookup failed:', err?.message);
    return res.status(500).json({ error: 'Failed to load telemetry' });
  }
});

export { MAX_PAYLOAD_BYTES };
