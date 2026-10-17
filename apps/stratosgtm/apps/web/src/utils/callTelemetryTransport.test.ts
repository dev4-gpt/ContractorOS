import { describe, it, expect, vi, afterEach } from 'vitest';
import { TelemetryTransport, TELEMETRY_INGEST_PATH } from './callTelemetryTransport';
import type { TelemetryBatch } from './callTelemetry';

function batch(over: Partial<TelemetryBatch['record']> = {}): TelemetryBatch {
  return {
    callId: 'call-1',
    record: {
      callId: 'call-1',
      persona: null,
      companyName: null,
      startedAt: 1_000_000,
      endedAt: null,
      durationMs: null,
      endReason: null,
      greetingTtfaMs: null,
      greetingBargeInOffsetMs: null,
      turnCount: 0,
      interruptionCount: 0,
      unattributedReplies: 0,
      ...over
    } as TelemetryBatch['record'],
    turns: []
  };
}

describe('TelemetryTransport metering fields', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const sentBody = (fetchImpl: ReturnType<typeof vi.fn>) => JSON.parse(fetchImpl.mock.calls[0][1].body as string);
  const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 200 });

  it('sends the server-signed callToken so the server can attribute the call', async () => {
    const fetchImpl = okFetch();
    const t = new TelemetryTransport({
      url: TELEMETRY_INGEST_PATH,
      fetchImpl: fetchImpl as any,
      getExtras: () => ({ callToken: 'tok-abc' })
    });

    t.send(batch());
    await Promise.resolve();

    expect(sentBody(fetchImpl).callToken).toBe('tok-abc');
    expect(sentBody(fetchImpl).callId).toBe('call-1');
  });

  it('omits callToken entirely when the server issued none, rather than sending an empty one', async () => {
    const fetchImpl = okFetch();
    const t = new TelemetryTransport({ url: TELEMETRY_INGEST_PATH, fetchImpl: fetchImpl as any, getExtras: () => ({}) });

    t.send(batch());
    await Promise.resolve();

    expect('callToken' in sentBody(fetchImpl)).toBe(false);
  });

  it('reads the extras at send time, so a lead captured mid-call is reported', async () => {
    const fetchImpl = okFetch();
    let captured = false;
    const t = new TelemetryTransport({
      url: TELEMETRY_INGEST_PATH,
      fetchImpl: fetchImpl as any,
      getExtras: () => ({ qualifyLeadSucceeded: captured })
    });

    t.send(batch());
    await Promise.resolve();
    expect('qualifyLeadSucceeded' in sentBody(fetchImpl)).toBe(false);

    captured = true;
    t.send(batch());
    await Promise.resolve();
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body as string).qualifyLeadSucceeded).toBe(true);
  });

  it('reports the finished call duration as audio seconds', async () => {
    const fetchImpl = okFetch();
    const t = new TelemetryTransport({ url: TELEMETRY_INGEST_PATH, fetchImpl: fetchImpl as any });

    t.send(batch({ durationMs: 61_400, endedAt: 1_061_400 }));
    await Promise.resolve();

    expect(sentBody(fetchImpl).audioSecondsCaptured).toBe(61);
  });

  it('falls back to elapsed time on a mid-call flush, which doubles as the heartbeat', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000 + 30_000);
    const fetchImpl = okFetch();
    const t = new TelemetryTransport({ url: TELEMETRY_INGEST_PATH, fetchImpl: fetchImpl as any });

    t.send(batch({ startedAt: 1_000_000, durationMs: null }));
    await Promise.resolve();

    expect(sentBody(fetchImpl).audioSecondsCaptured).toBe(30);
  });

  it('carries the same fields on the pagehide beacon, as an application/json blob', async () => {
    const sendBeaconImpl = vi.fn().mockReturnValue(true);
    const t = new TelemetryTransport({
      url: TELEMETRY_INGEST_PATH,
      sendBeaconImpl,
      getExtras: () => ({ callToken: 'tok-abc', qualifyLeadSucceeded: true })
    });

    t.sendFinal(batch({ durationMs: 12_000, endedAt: 1_012_000 }));

    const blob = sendBeaconImpl.mock.calls[0][1] as Blob;
    expect(blob.type).toBe('application/json');
    // jsdom's Blob has no .text(); FileReader is what it does implement.
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    const body = JSON.parse(text);
    expect(body.callToken).toBe('tok-abc');
    expect(body.audioSecondsCaptured).toBe(12);
    expect(body.qualifyLeadSucceeded).toBe(true);
  });
});
