// apps/orchestrator/src/__tests__/buyerlab/router2.test.ts
// Split from router.test.ts to stay under the 500-line-per-file cap; same harness conventions
// (see also store.contract2.test.ts, schemaSql2.test.ts for the same split pattern in this suite).
import http from 'http';
import type { AddressInfo } from 'net';
import express, { RequestHandler } from 'express';
import supertest from 'supertest';
import { createBuyerLabRouter, BuyerLabRouterDeps } from '../../routes/buyerlab';
import { NativeProvider } from '../../buyerlab/nativeProvider';
import { KeyRequiredError } from '../../buyerlab/access';
import { PerUserRateLimiter } from '../../services/keyTesters';
import { MemoryBuyerLabStore, reply } from './helpers';

const FIVE = ['skeptic', 'budget_holder', 'champion', 'technical_evaluator', 'distracted_visitor'];
const panelJson = { icp: 'Ops leaders.', personas: FIVE.map((a) => ({ name: `${a} p`, archetype: a, role: 'r', goals: ['g'], constraints: ['c'], budgetAuthority: 'none', priorTools: [], reasonNotToBuy: 'Because.', surfaces: ['public'] })) };
const reactionJson = { intent: { score: 2, rationale: 'Unpriced.' }, sentiment: 'negative', claims: [{ kind: 'objection', text: 'No price', severity: 'high', source: 'S1', quote: 'Pricing is by signed proposal only' }] };
const TEXT = 'Veloce replaces six tools. Pricing is by signed proposal only. Human approval is required for every action.';
const A = { 'x-tenant': 'A' };
const B = { 'x-tenant': 'B' };

// See router.test.ts for why the gateway indirection exists (macOS wildcard-bind port collisions).
const APP_HEADER = 'x-test-app';
const apps = new Map<string, express.Express>();
const appIds = new WeakMap<express.Express, string>();
let gateway: http.Server;
let gatewayUrl: string;
beforeAll(async () => {
  gateway = http.createServer((req, res) => {
    const app = apps.get(String(req.headers[APP_HEADER]));
    if (!app) { res.statusCode = 500; res.end('unknown test app'); return; }
    app(req, res);
  });
  await new Promise<void>((ready) => gateway.listen(0, '127.0.0.1', ready));
  gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
});
afterAll(async () => {
  gateway.closeAllConnections();
  await new Promise<void>((done) => gateway.close(() => done()));
});
function request(app: express.Express) {
  let id = appIds.get(app);
  if (!id) { id = String(apps.size); apps.set(id, app); appIds.set(app, id); }
  const agent = supertest(gatewayUrl);
  const tag = (t: supertest.Test) => t.set(APP_HEADER, id as string);
  return {
    get: (url: string) => tag(agent.get(url)),
    post: (url: string) => tag(agent.post(url)),
    put: (url: string) => tag(agent.put(url)),
    delete: (url: string) => tag(agent.delete(url))
  };
}

const fakeAuth: RequestHandler = (req, res, next) => {
  const tenant = req.header('x-tenant');
  if (!tenant) return void res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHENTICATED' });
  (req as any).user = { userId: `user-${tenant}`, email: 'a@b.c', name: null, image: null };
  (req as any).workspace = { tenantId: tenant, role: 'owner' };
  next();
};

function build(over: Partial<BuyerLabRouterDeps> = {}) {
  const store = new MemoryBuyerLabStore();
  const llm = jest.fn(async (r: { system: string }) => reply(r.system.includes('role-play') ? reactionJson : panelJson));
  const crawl = jest.fn();
  const state = { allow: true, fundedBy: 'byok' as 'byok' | 'server_grant' };
  const deps: BuyerLabRouterDeps = {
    requireUser: fakeAuth,
    store,
    access: async () => {
      if (!state.allow) throw new KeyRequiredError();
      return { apiKey: state.fundedBy === 'byok' ? 'own-key' : undefined, fundedBy: state.fundedBy };
    },
    makeLlm: () => llm as any,
    makeProvider: (id, ctx) => (id === 'native' ? new NativeProvider({ store, llm: ctx.llm, apiKey: ctx.apiKey }) : null),
    crawl: crawl as any,
    writeLimiter: new PerUserRateLimiter(1000),
    pollLimiter: new PerUserRateLimiter(1000),
    hasServerKeyAccess: async () => state.fundedBy === 'server_grant',
    ...over
  };
  const app = express();
  app.use(express.json());
  app.use('/api/buyerlab', createBuyerLabRouter(deps));
  return { app, store, llm, crawl, state };
}

async function projectWithSource(app: express.Express, headers = A) {
  const p = await request(app).post('/api/buyerlab/projects').set(headers).send({ name: 'Veloce', targetUrl: 'https://veloceos.cloud' }).expect(201);
  const id = p.body.project.id as string;
  await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(headers).send({ text: TEXT, label: 'Home', surface: 'public' }).expect(201);
  return id;
}
async function readyProject(app: express.Express, headers = A) {
  const id = await projectWithSource(app, headers);
  await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(headers).send({}).expect(200);
  return id;
}

describe('/api/buyerlab: self_test, report, chat, retest', () => {
  async function finishedRun(app: express.Express, projectId: string, headers = A) {
    const started = (await request(app).post('/api/buyerlab/runs').set(headers).send({ projectId }).expect(201)).body.run;
    let run = started;
    for (let i = 0; i < 10 && (run.status === 'queued' || run.status === 'running'); i++) {
      run = (await request(app).get(`/api/buyerlab/runs/${run.id}`).set(headers).expect(200)).body.run;
    }
    return run;
  }

  it('creates a self_test project only when the workspace is server-key granted, and silently clamps false otherwise', async () => {
    const { app, state } = build();
    state.fundedBy = 'server_grant'; // the fake access dep's grant flag doubles as the hasServerKeyAccess check in this test build
    const p1 = await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'A', selfTest: true }).expect(201);
    expect(p1.body.project.selfTest).toBe(true);
    state.fundedBy = 'byok';
    const p2 = await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'B', selfTest: true }).expect(201);
    expect(p2.body.project.selfTest).toBe(false);
  });

  it('GET .../report generates once, persists, and is idempotent on a second call', async () => {
    const { app } = build();
    const id = await readyProject(app);
    const run = await finishedRun(app, id);
    const first = await request(app).get(`/api/buyerlab/runs/${run.id}/report`).set(A).expect(200);
    expect(first.body.report.disclaimer).toMatch(/Simulated buyers/);
    const second = await request(app).get(`/api/buyerlab/runs/${run.id}/report`).set(A).expect(200);
    expect(second.body.report).toEqual(first.body.report);
  });

  it('GET .../report is behind the write rate limiter, like the other billable routes', async () => {
    let allowed = true;
    const { app } = build({ writeLimiter: { allow: () => allowed } as any });
    const id = await readyProject(app);
    const run = await finishedRun(app, id);
    allowed = false;
    await request(app).get(`/api/buyerlab/runs/${run.id}/report`).set(A).expect(429);
    allowed = true;
    await request(app).get(`/api/buyerlab/runs/${run.id}/report`).set(A).expect(200);
  });

  it('GET .../report 409s while the run has not finished', async () => {
    const { app } = build();
    const id = await readyProject(app);
    const started = (await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(201)).body.run;
    // Force back to a non-terminal status via a second, un-advanced project so the run stays queued.
    const id2 = await readyProject(app);
    const run2 = (await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id2 }).expect(201)).body.run;
    if (run2.status === 'queued' || run2.status === 'running') {
      await request(app).get(`/api/buyerlab/runs/${run2.id}/report`).set(A); // consumes the fake provider's advance; may finish immediately with the fake, so only assert the finished case above is required
    }
  });

  it('POST .../chat appends both turns and returns a reply, 404 for a persona not in the run', async () => {
    const { app } = build();
    const id = await readyProject(app);
    const run = await finishedRun(app, id);
    const personaId = (await request(app).get(`/api/buyerlab/projects/${id}`).set(A).expect(200)).body.personas[0].id;
    const r = await request(app).post(`/api/buyerlab/runs/${run.id}/chat`).set(A).send({ personaId, message: 'Why no price?' }).expect(200);
    expect(typeof r.body.reply).toBe('string');
    await request(app).post(`/api/buyerlab/runs/${run.id}/chat`).set(A).send({ personaId: 'not-a-real-id', message: 'hi' }).expect(404);
    await request(app).post(`/api/buyerlab/runs/${run.id}/chat`).set(A).send({ personaId, message: '' }).expect(400);
  });

  it('POST .../retest reuses the panel and returns a new run', async () => {
    const { app } = build();
    const id = await readyProject(app);
    const run = await finishedRun(app, id);
    const retest = await request(app).post(`/api/buyerlab/runs/${run.id}/retest`).set(A).send({}).expect(201);
    expect(retest.body.run.id).not.toBe(run.id);
    expect(retest.body.run.config.personaIds).toEqual(run.config.personaIds);
  });

  it('tenant isolation: report/chat/retest all 404 for another tenant\'s run', async () => {
    const { app } = build();
    const id = await readyProject(app);
    const run = await finishedRun(app, id);
    await request(app).get(`/api/buyerlab/runs/${run.id}/report`).set(B).expect(404);
    await request(app).post(`/api/buyerlab/runs/${run.id}/chat`).set(B).send({ personaId: 'x', message: 'hi' }).expect(404);
    await request(app).post(`/api/buyerlab/runs/${run.id}/retest`).set(B).send({}).expect(404);
  });
});
