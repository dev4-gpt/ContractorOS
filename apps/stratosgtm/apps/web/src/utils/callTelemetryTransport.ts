/**
 * Ships CallTelemetry batches to the orchestrator.
 *
 * Deliberately fire-and-forget: telemetry must never be able to slow, block or
 * break a live call. One retry, then the batch is dropped and the failure is
 * swallowed. A missing sample is honest; a broken call is not.
 *
 * Two transports, because the browser gives us two situations:
 *  - mid-call: fetch with keepalive, so a flush survives the tab navigating.
 *  - pagehide: sendBeacon, the only thing guaranteed to run during unload.
 *    The Blob type is required — sendBeacon's default content type is
 *    text/plain, which express.json() refuses to parse, so the payload would
 *    arrive and be discarded server-side.
 */

import type { TelemetryBatch } from './callTelemetry';

export const TELEMETRY_INGEST_PATH = '/api/telemetry/calls';

/** Matches the server's own cap, so an oversized batch is dropped locally. */
const MAX_TURNS_PER_BATCH = 200;

export interface TelemetryTransportOptions {
  /** Absolute or proxied URL of the ingest endpoint. */
  url: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sendBeaconImpl?: (url: string, data: Blob) => boolean;
  /**
   * Read at send time, not construction time, because the lead-captured flag
   * changes during the call.
   */
  getExtras?: () => MeteringExtras;
}

/** Fields the server's metering hook reads, sent alongside the telemetry itself. */
export interface MeteringExtras {
  /** Server-signed token from /api/voice/token. Binds the call to a tenant we chose. */
  callToken?: string;
  qualifyLeadSucceeded?: boolean;
}

function serialize(batch: TelemetryBatch, extras?: MeteringExtras): string {
  const turns =
    batch.turns.length > MAX_TURNS_PER_BATCH
      ? batch.turns.slice(0, MAX_TURNS_PER_BATCH)
      : batch.turns;
  // Elapsed call time, used as the reported audio seconds. Mid-call flushes have no
  // durationMs yet, so fall back to time since start; that also serves as the
  // heartbeat the server uses to close a call that never reports an end. The server
  // clamps this to the lifetime of the token it signed, so over-reporting gains
  // nothing.
  const elapsedMs =
    batch.record.durationMs ?? (batch.record.startedAt ? Date.now() - batch.record.startedAt : null);
  const audioSecondsCaptured =
    elapsedMs !== null && Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.round(elapsedMs / 1000) : undefined;
  return JSON.stringify({
    ...batch.record,
    callId: batch.callId,
    turns,
    ...(extras?.callToken ? { callToken: extras.callToken } : {}),
    ...(audioSecondsCaptured !== undefined ? { audioSecondsCaptured } : {}),
    ...(extras?.qualifyLeadSucceeded ? { qualifyLeadSucceeded: true } : {})
  });
}

export class TelemetryTransport {
  private readonly url: string;
  private readonly getExtras?: () => MeteringExtras;
  private readonly fetchImpl?: typeof fetch;
  private readonly sendBeaconImpl?: (url: string, data: Blob) => boolean;

  constructor(opts: TelemetryTransportOptions) {
    this.url = opts.url;
    this.getExtras = opts.getExtras;
    this.fetchImpl =
      opts.fetchImpl ||
      (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.sendBeaconImpl =
      opts.sendBeaconImpl ||
      (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
        ? navigator.sendBeacon.bind(navigator)
        : undefined);
  }

  /** Mid-call flush. Never awaited by the caller. */
  public send(batch: TelemetryBatch): void {
    const body = serialize(batch, this.getExtras?.());
    void this.post(body, 1);
  }

  /**
   * Final flush during unload. sendBeacon is the only transport the browser
   * promises to run here; if it is unavailable or refuses (queue full), fall
   * back to a keepalive fetch, which usually survives.
   */
  public sendFinal(batch: TelemetryBatch): void {
    const body = serialize(batch, this.getExtras?.());
    if (this.sendBeaconImpl) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        if (this.sendBeaconImpl(this.url, blob)) return;
      } catch {
        /* fall through */
      }
    }
    void this.post(body, 0);
  }

  private async post(body: string, retriesLeft: number): Promise<void> {
    if (!this.fetchImpl) return;
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      });
      // 4xx means we sent something the server will never accept. Retrying it
      // is just noise on the wire.
      if (!res.ok && res.status >= 500 && retriesLeft > 0) {
        await this.post(body, retriesLeft - 1);
      }
    } catch {
      if (retriesLeft > 0) {
        try {
          await this.post(body, retriesLeft - 1);
        } catch {
          /* swallowed by design */
        }
      }
    }
  }
}
