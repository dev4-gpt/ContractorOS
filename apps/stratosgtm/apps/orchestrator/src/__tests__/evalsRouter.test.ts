import express from 'express';
import request from 'supertest';
import { runOfflineSuite } from '../evals/runner';

let dbConfigured = true;
jest.mock('../db/client', () => ({ isDatabaseConfigured: () => dbConfigured }));
const saveEvalRun = jest.fn();
const getLatestEvalRun = jest.fn();
jest.mock('../db/repository/evals', () => ({
  saveEvalRun: (...a: any[]) => saveEvalRun(...a),
  getLatestEvalRun: (...a: any[]) => getLatestEvalRun(...a)
}));

function app() {
  const { evalsRouter } = require('../routes/evals');
  const a = express();
  a.use(express.json());
  a.use('/api/evals', evalsRouter);
  return a;
}

describe('/api/evals', () => {
  const env = { ...process.env };
  beforeEach(() => {
    dbConfigured = true;
    saveEvalRun.mockReset();
    getLatestEvalRun.mockReset();
    delete process.env.ORCHESTRATOR_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    process.env.NODE_ENV = 'test';
  });
  afterAll(() => {
    process.env = env;
  });

  it('GET /report answers no_data (never a fabricated report) when nothing is stored', async () => {
    getLatestEvalRun.mockResolvedValue(null);
    const res = await request(app()).get('/api/evals/report').expect(200);
    expect(res.body.mode).toBe('no_data');
    expect(res.body.run).toBeUndefined();
    expect(res.body.availableTasks.length).toBeGreaterThan(0);
  });

  it('GET /report answers no_data without a datastore', async () => {
    dbConfigured = false;
    const res = await request(app()).get('/api/evals/report').expect(200);
    expect(res.body).toMatchObject({ mode: 'no_data', reason: 'no_datastore' });
  });

  it('GET /report prefers measured over offline and reports the stored mode', async () => {
    const off = await runOfflineSuite({ k: 1 });
    getLatestEvalRun.mockImplementation(async (m: string) => (m === 'offline' ? { id: 'r1', source: 'ci', gitSha: null, createdAt: new Date().toISOString(), suite: off } : null));
    const res = await request(app()).get('/api/evals/report').expect(200);
    expect(res.body.mode).toBe('offline');
    expect(res.body.run.model).toBeNull();
    expect(getLatestEvalRun.mock.calls.map((c) => c[0])).toEqual(['measured', 'offline']);
  });

  it('POST /run refuses a measured run with 503 when no model key is configured', async () => {
    const res = await request(app()).post('/api/evals/run').send({}).expect(503);
    expect(res.body.code).toBe('EVAL_NO_MODEL');
    expect(saveEvalRun).not.toHaveBeenCalled();
  });

  it('POST /run enforces the time bound: full suite k<=2, single task k<=5', async () => {
    process.env.DEEPSEEK_API_KEY = 'k';
    await request(app()).post('/api/evals/run').send({ k: 3 }).expect(400);
    await request(app()).post('/api/evals/run').send({ taskId: 'booking', k: 6 }).expect(400);
    await request(app()).post('/api/evals/run').send({ taskId: 'nope' }).expect(400);
  });

  it('POST /run offline runs the stub, is labelled offline, and persists', async () => {
    saveEvalRun.mockResolvedValue('run-1');
    const res = await request(app()).post('/api/evals/run').send({ mode: 'offline', taskId: 'booking', k: 2 }).expect(200);
    expect(res.body).toMatchObject({ mode: 'offline', runId: 'run-1', persisted: true });
    expect(res.body.run.model).toBeNull();
    expect(res.body.run.tasks[0].passes).toBe(2);
    expect(saveEvalRun).toHaveBeenCalledWith(expect.objectContaining({ mode: 'offline' }), 'server', null);
  });

  it('POST /run requires the owner key when one is configured', async () => {
    process.env.ORCHESTRATOR_API_KEY = 'secret';
    await request(app()).post('/api/evals/run').send({ mode: 'offline' }).expect(401);
    await request(app()).post('/api/evals/runs').send({}).expect(401);
  });

  it('POST /runs stores a valid CI run, and rebuilds aggregates from trials', async () => {
    saveEvalRun.mockResolvedValue('run-2');
    const off = await runOfflineSuite({ k: 1 });
    // Tamper with the claimed aggregates: the server must ignore them.
    const body = { ...off, suitePassPowerK: 0.99, tasks: off.tasks.map((t) => ({ ...t, passes: 0, passRate: 1 })), source: 'ci', gitSha: 'abc123' };
    const res = await request(app()).post('/api/evals/runs').send(body).expect(201);
    expect(res.body).toEqual({ runId: 'run-2', mode: 'offline' });
    const stored = saveEvalRun.mock.calls[0][0];
    expect(stored.tasks.every((t: any) => t.passes === 1)).toBe(true);
    expect(stored.suitePassPowerK).toBe(1);
    expect(saveEvalRun.mock.calls[0].slice(1)).toEqual(['ci', 'abc123']);
  });

  it('POST /runs rejects a measured run with no model, and a pass its verdicts do not support', async () => {
    const off = await runOfflineSuite({ k: 1 });
    await request(app()).post('/api/evals/runs').send({ ...off, mode: 'measured', model: null }).expect(400);
    const forged = JSON.parse(JSON.stringify(off));
    forged.tasks[0].trials[0].verdicts[0].passed = false;
    await request(app()).post('/api/evals/runs').send(forged).expect(400);
    expect(saveEvalRun).not.toHaveBeenCalled();
  });

  it('POST /runs refuses without a datastore rather than pretending it stored', async () => {
    dbConfigured = false;
    const off = await runOfflineSuite({ k: 1 });
    const res = await request(app()).post('/api/evals/runs').send(off).expect(503);
    expect(res.body.code).toBe('EVAL_NO_DATASTORE');
  });
});
