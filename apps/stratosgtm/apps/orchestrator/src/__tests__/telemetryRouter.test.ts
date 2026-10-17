import express from 'express';
import request from 'supertest';

const persistCallTelemetry = jest.fn();
const loadTelemetryWindow = jest.fn();
const getCallTelemetry = jest.fn();

jest.mock('../db/repository', () => ({
  persistCallTelemetry: (...args: any[]) => persistCallTelemetry(...args),
  loadTelemetryWindow: (...args: any[]) => loadTelemetryWindow(...args),
  getCallTelemetry: (...args: any[]) => getCallTelemetry(...args)
}));

const isDatabaseConfigured = jest.fn(() => true);
jest.mock('../db/client', () => ({
  isDatabaseConfigured: () => isDatabaseConfigured()
}));

function buildApp() {
  const { telemetryRouter } = require('../routes/telemetry');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/telemetry', telemetryRouter);
  return app;
}

function callBody(overrides: Record<string, unknown> = {}) {
  return {
    callId: 'call-abc',
    persona: 'inbound',
    companyName: 'Acme',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_060_000,
    durationMs: 60_000,
    endReason: 'user_ended',
    greetingTtfaMs: 820,
    turnCount: 2,
    interruptionCount: 1,
    turns: [
      { turnIndex: 0, userPerceivedLatencyMs: 1640, endpointingDelayMs: 1000, postEndpointLatencyMs: 640, generationLatencyMs: 310, segmentCount: 1, interrupted: false },
      { turnIndex: 1, userPerceivedLatencyMs: 1710, endpointingDelayMs: 1000, postEndpointLatencyMs: 710, generationLatencyMs: 350, segmentCount: 2, interrupted: true }
    ],
    ...overrides
  };
}

describe('POST /api/telemetry/calls', () => {
  beforeEach(() => {
    jest.resetModules();
    persistCallTelemetry.mockReset();
    isDatabaseConfigured.mockReturnValue(true);
  });

  it('accepts a measured call and reports how many turns were stored', async () => {
    persistCallTelemetry.mockResolvedValue({ persisted: true, turnsWritten: 2 });

    const res = await request(buildApp())
      .post('/api/telemetry/calls')
      .send(callBody())
      .expect(202);

    expect(res.body).toEqual({ status: 'accepted', callId: 'call-abc', turnsAccepted: 2 });
    const [persisted] = persistCallTelemetry.mock.calls[0];
    expect(persisted.callId).toBe('call-abc');
    expect(persisted.greetingTtfaMs).toBe(820);
    expect(persisted.turns).toHaveLength(2);
    expect(persisted.turns[0]).toMatchObject({
      userPerceivedLatencyMs: 1640,
      endpointingDelayMs: 1000,
      postEndpointLatencyMs: 640,
      segmentCount: 1
    });
    expect(persisted.turns[1].segmentCount).toBe(2);
    expect(persisted.startedAt).toBeInstanceOf(Date);
  });

  it('rejects a payload with more than 200 turns', async () => {
    const turns = Array.from({ length: 201 }, (_, i) => ({ turnIndex: i, userPerceivedLatencyMs: 500 }));
    const res = await request(buildApp())
      .post('/api/telemetry/calls')
      .send(callBody({ turns }))
      .expect(400);

    expect(res.body.code).toBe('TOO_MANY_TURNS');
    expect(persistCallTelemetry).not.toHaveBeenCalled();
  });

  it('rejects a payload over the byte cap before touching the datastore', async () => {
    // 256KB+ of padding inside a structurally valid body.
    const res = await request(buildApp())
      .post('/api/telemetry/calls')
      .send(callBody({ endReason: 'x'.repeat(300 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(persistCallTelemetry).not.toHaveBeenCalled();
  });

  it('rejects a payload with no callId', async () => {
    const res = await request(buildApp())
      .post('/api/telemetry/calls')
      .send(callBody({ callId: undefined }))
      .expect(400);
    expect(res.body.code).toBe('INVALID_PAYLOAD');
  });

  it('says the sample was discarded when there is no datastore, rather than faking a write', async () => {
    isDatabaseConfigured.mockReturnValue(false);
    const res = await request(buildApp()).post('/api/telemetry/calls').send(callBody()).expect(202);
    expect(res.body).toMatchObject({ status: 'discarded', reason: 'no_datastore', turnsAccepted: 0 });
    expect(persistCallTelemetry).not.toHaveBeenCalled();
  });

  it('does not let an ingest failure escape as an unhandled rejection', async () => {
    persistCallTelemetry.mockRejectedValue(new Error('neon down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(buildApp()).post('/api/telemetry/calls').send(callBody()).expect(500);
    expect(res.body.code).toBe('INGEST_FAILED');
    spy.mockRestore();
  });

  it('accepts a beacon body sent as application/json', async () => {
    persistCallTelemetry.mockResolvedValue({ persisted: true, turnsWritten: 2 });
    await request(buildApp())
      .post('/api/telemetry/calls')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(callBody()))
      .expect(202);
  });
});

describe('GET /api/telemetry/summary', () => {
  beforeEach(() => {
    jest.resetModules();
    loadTelemetryWindow.mockReset();
    isDatabaseConfigured.mockReturnValue(true);
  });

  it('returns insufficient_data with a sample size below 20 measured turns, and no percentiles', async () => {
    loadTelemetryWindow.mockResolvedValue({
      turns: Array.from({ length: 19 }, () => ({
        userPerceivedLatencyMs: 1600,
        endpointingDelayMs: 1000,
        postEndpointLatencyMs: 600,
        generationLatencyMs: 300,
        interrupted: false
      })),
      greetingTtfaMs: [800],
      callCount: 4
    });

    const res = await request(buildApp()).get('/api/telemetry/summary').expect(200);

    expect(res.body.status).toBe('insufficient_data');
    expect(res.body.metric).toBe('userPerceivedLatencyMs');
    expect(res.body.sampleSize).toBe(19);
    expect(res.body.requiredSampleSize).toBe(20);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('p50');
    expect(serialized).not.toContain('p95');
  });

  it('returns percentiles once 20 measured turns exist', async () => {
    loadTelemetryWindow.mockResolvedValue({
      turns: Array.from({ length: 20 }, (_, i) => ({
        userPerceivedLatencyMs: 1500 + i,
        endpointingDelayMs: 1000,
        postEndpointLatencyMs: 500 + i,
        generationLatencyMs: 200 + i,
        interrupted: false
      })),
      greetingTtfaMs: [800],
      callCount: 6
    });

    const res = await request(buildApp()).get('/api/telemetry/summary?days=30').expect(200);

    expect(res.body.status).toBe('success');
    expect(res.body.sampleSize).toBe(20);
    expect(res.body.windowDays).toBe(30);
    expect(res.body.userPerceivedLatencyMs.p50).toBe(1509);
    expect(res.body.userPerceivedLatencyMs.p95).toBe(1518);
    // The narrow interval is present only as a labelled component, and never as the headline.
    expect(res.body.components.postEndpointLatencyMs.p50).toBe(509);
    expect(res.body.components.endpointingDelayMs.p50).toBe(1000);
    expect(res.body.responseLatencyMs).toBeUndefined();
    // Only one call, so the greeting distribution stays gated on its own.
    expect(res.body.greetingTtfaMs.status).toBe('insufficient_data');
  });

  it('stays insufficient_data when every stored turn lacks the headline, however many there are', async () => {
    loadTelemetryWindow.mockResolvedValue({
      turns: Array.from({ length: 100 }, () => ({
        userPerceivedLatencyMs: null,
        endpointingDelayMs: null,
        postEndpointLatencyMs: 8,
        generationLatencyMs: 1,
        interrupted: false
      })),
      greetingTtfaMs: [],
      callCount: 10
    });
    const res = await request(buildApp()).get('/api/telemetry/summary').expect(200);
    expect(res.body.status).toBe('insufficient_data');
    expect(res.body.sampleSize).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain('p50');
  });

  it('reports insufficient_data rather than an error when there is no datastore', async () => {
    isDatabaseConfigured.mockReturnValue(false);
    const res = await request(buildApp()).get('/api/telemetry/summary').expect(200);
    expect(res.body.status).toBe('insufficient_data');
    expect(res.body.sampleSize).toBe(0);
    expect(res.body.reason).toBe('no_datastore');
  });

  it('clamps the window to a sane range', async () => {
    loadTelemetryWindow.mockResolvedValue({ turns: [], greetingTtfaMs: [], callCount: 0 });
    const res = await request(buildApp()).get('/api/telemetry/summary?days=9999').expect(200);
    expect(res.body.windowDays).toBe(90);
  });
});
