// apps/orchestrator/src/__tests__/buyerlab/router.test.ts
import http from 'http';
import type { AddressInfo } from 'net';
import express, { RequestHandler } from 'express';
import supertest from 'supertest';
import { createBuyerLabRouter, BuyerLabRouterDeps } from '../../routes/buyerlab';
import { NativeProvider } from '../../buyerlab/nativeProvider';
import { KeyRequiredError } from '../../buyerlab/access';
import { UnsafeUrlError } from '../../buyerlab/ssrf';
import { PerUserRateLimiter } from '../../services/keyTesters';
import { MemoryBuyerLabStore, reply } from './helpers';

const FIVE = ['skeptic', 'budget_holder', 'champion', 'technical_evaluator', 'distracted_visitor'];
const panelJson = { icp: 'Ops leaders.', personas: FIVE.map((a) => ({ name: `${a} p`, archetype: a, role: 'r', goals: ['g'], constraints: ['c'], budgetAuthority: 'none', priorTools: [], reasonNotToBuy: 'Because.', surfaces: ['public'] })) };
const reactionJson = { intent: { score: 2, rationale: 'Unpriced.' }, sentiment: 'negative', claims: [{ kind: 'objection', text: 'No price', severity: 'high', source: 'S1', quote: 'Pricing is by signed proposal only' }] };
const TEXT = 'Veloce replaces six tools. Pricing is by signed proposal only. Human approval is required for every action.';
const A = { 'x-tenant': 'A' };
const B = { 'x-tenant': 'B' };

// supertest's own `app.listen(0)` binds the wildcard address (`::`) but then connects to 127.0.0.1:<port>. On macOS
// a wildcard bind can be handed a port that another process already listens on at 127.0.0.1 (IDE helpers, language
// servers, other test runs), and the connection then goes to that process: a stray 404/400 that never reaches this
// app. So one server is bound to 127.0.0.1 explicitly (the kernel then refuses any port held there) before any
// request is sent, and each app under test is reached through it by a header. `listen(0, '127.0.0.1')` cannot be
// handed to supertest directly: it resolves the host asynchronously, supertest sees no address and re-listens on `::`.
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

describe('/api/buyerlab', () => {
  it.each([
    ['get', '/projects'], ['post', '/projects'], ['get', '/projects/x'], ['delete', '/projects/x'], ['post', '/projects/x/ingest'],
    ['post', '/projects/x/panel'], ['put', '/projects/x/panel'], ['post', '/runs'], ['get', '/runs/x'], ['get', '/runs/x/outcome']
  ])('%s %s needs a signed-in user', async (method, path) => {
    const { app } = build();
    await (request(app) as any)[method](`/api/buyerlab${path}`).expect(401);
  });

  describe('projects', () => {
    it('creates, lists and validates', async () => {
      const { app } = build();
      await request(app).post('/api/buyerlab/projects').set(A).send({}).expect(400);
      await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'x'.repeat(200) }).expect(400);
      await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'V', targetUrl: 'ftp://x' }).expect(400);
      const ok = await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'Veloce', targetUrl: 'https://veloceos.cloud', brief: 'A brief' }).expect(201);
      expect(ok.body.project).toMatchObject({ name: 'Veloce', targetUrl: 'https://veloceos.cloud' });
      expect((await request(app).get('/api/buyerlab/projects').set(A).expect(200)).body.projects).toHaveLength(1);
    });

    it('caps projects per workspace', async () => {
      const { app } = build();
      for (let i = 0; i < 20; i++) await request(app).post('/api/buyerlab/projects').set(A).send({ name: `p${i}` }).expect(201);
      expect((await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'one more' }).expect(409)).body.code).toBe('PROJECT_LIMIT');
    });

    it('returns source summaries without the text, the panel, the latest run and an estimate', async () => {
      const { app } = build();
      const id = await readyProject(app);
      const r = (await request(app).get(`/api/buyerlab/projects/${id}`).set(A).expect(200)).body;
      expect(r.sources[0]).toMatchObject({ kind: 'upload', surface: 'public', label: 'Home', words: 17 });
      expect(r.sources[0]).not.toHaveProperty('text');
      expect(r.personas).toHaveLength(5);
      expect(r.latestRun).toBeNull();
      expect(r.estimate).toMatchObject({ calls: 5 });
    });

    it('deletes a project, then answers 404', async () => {
      const { app } = build();
      const id = await projectWithSource(app);
      await request(app).delete(`/api/buyerlab/projects/${id}`).set(A).expect(204);
      await request(app).get(`/api/buyerlab/projects/${id}`).set(A).expect(404);
    });

    it('rate-limits writes per user', async () => {
      const { app } = build({ writeLimiter: new PerUserRateLimiter(2) });
      await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'a' }).expect(201);
      await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'b' }).expect(201);
      expect((await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'c' }).expect(429)).body.code).toBe('RATE_LIMITED');
    });
  });

  describe('ingest', () => {
    const page = (text = 'Buyer facing copy. '.repeat(30)) => ({ pages: [{ url: 'https://a.com/', title: 'Home', headings: ['H'], text, status: 200 }], skipped: [{ url: 'https://a.com/x', reason: 'robots' }], truncated: false });
    async function empty(app: express.Express) {
      return (await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'V' }).expect(201)).body.project.id as string;
    }

    it('crawls a URL into public sources and reports what it skipped', async () => {
      const { app, crawl } = build();
      crawl.mockResolvedValue(page());
      const id = await empty(app);
      const r = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'https://a.com/' }).expect(201);
      expect(crawl).toHaveBeenCalledWith('https://a.com/', expect.objectContaining({ maxPages: 12 }));
      expect(r.body.added[0]).toMatchObject({ kind: 'crawl', surface: 'public', label: 'Home', url: 'https://a.com/' });
      expect(r.body.skipped).toEqual([{ url: 'https://a.com/x', reason: 'robots' }]);
      expect(r.body.added[0]).not.toHaveProperty('text');
    });

    it('rejects something that is not a URL before crawling', async () => {
      const { app, crawl } = build();
      const id = await empty(app);
      await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'not a url' }).expect(400);
      expect(crawl).not.toHaveBeenCalled();
    });

    it('does not store identical text twice', async () => {
      const { app, crawl } = build();
      crawl.mockResolvedValue(page());
      const id = await empty(app);
      await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'https://a.com/' }).expect(201);
      const again = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'https://a.com/' }).expect(201);
      expect(again.body).toMatchObject({ added: [], duplicates: 1 });
    });

    it('answers 400 UNSAFE_URL for a URL the guard refuses', async () => {
      const { app, crawl } = build();
      crawl.mockRejectedValue(new UnsafeUrlError('no', 'private_address'));
      const id = await empty(app);
      const r = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'http://169.254.169.254/' }).expect(400);
      expect(r.body).toMatchObject({ code: 'UNSAFE_URL', reason: 'private_address' });
    });

    it('tells the user to paste text when a page has no readable text', async () => {
      const { app, crawl } = build();
      crawl.mockResolvedValue({ pages: [], skipped: [{ url: 'https://a.com/', reason: 'thin_content' }], truncated: false });
      const id = await empty(app);
      const r = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'https://a.com/' }).expect(422);
      expect(r.body.code).toBe('NO_READABLE_TEXT');
      expect(r.body.error).toMatch(/paste/i);
    });

    it('accepts pasted text tagged with its surface, and rejects bad input', async () => {
      const { app } = build();
      const id = await empty(app);
      const r = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ text: TEXT, label: 'Approvals page', surface: 'signed_in', kind: 'upload' }).expect(201);
      expect(r.body.added[0]).toMatchObject({ kind: 'upload', surface: 'signed_in', label: 'Approvals page', url: null });
      await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ text: 'too short' }).expect(400);
      await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ text: TEXT, surface: 'weird' }).expect(400);
      await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ text: TEXT + ' x', kind: 'agent' }).expect(400);
      await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({}).expect(400);
    });

    it('caps sources per project', async () => {
      const { app } = build();
      const id = await empty(app);
      for (let i = 0; i < 40; i++) await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ text: `Source number ${i}. `.repeat(10) }).expect(201);
      expect((await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ text: 'One more source. '.repeat(10) }).expect(409)).body.code).toBe('SOURCE_LIMIT');
    });
  });

  describe('panel', () => {
    it('needs a key or a grant', async () => {
      const { app, state, llm } = build();
      const id = await projectWithSource(app);
      state.allow = false;
      const r = await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(A).send({}).expect(402);
      expect(r.body.code).toBe('KEY_REQUIRED');
      expect(llm).not.toHaveBeenCalled();
    });

    it('needs at least one source', async () => {
      const { app } = build();
      const id = (await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'V' })).body.project.id;
      expect((await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(A).send({}).expect(409)).body.code).toBe('NO_SOURCES');
    });

    it('infers a panel with the five required archetypes and saves it', async () => {
      const { app } = build();
      const id = await projectWithSource(app);
      const r = await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(A).send({}).expect(200);
      expect(r.body.personas.map((p: any) => p.archetype)).toEqual(FIVE);
      expect(r.body.personas.every((p: any) => p.edited === false && typeof p.id === 'string')).toBe(true);
      expect(r.body.icp).toBe('Ops leaders.');
    });

    it('answers 502 PANEL_INCOMPLETE when the model keeps omitting archetypes', async () => {
      const { app, llm } = build();
      llm.mockImplementation(async () => reply({ icp: 'x', personas: [panelJson.personas[0]] }));
      const id = await projectWithSource(app);
      const r = await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(A).send({}).expect(502);
      expect(r.body).toMatchObject({ code: 'PANEL_INCOMPLETE' });
      expect(r.body.missing).toContain('champion');
    });

    it('saves edits, marks them edited, and will not overwrite them without force', async () => {
      const { app } = build();
      const id = await readyProject(app);
      const edited = await request(app).put(`/api/buyerlab/projects/${id}/panel`).set(A).send({ personas: [{ name: 'My buyer', archetype: 'champion', surfaces: ['public'], reasonNotToBuy: 'Too pricey.' }] }).expect(200);
      expect(edited.body.personas).toHaveLength(1);
      expect(edited.body.personas[0]).toMatchObject({ edited: true, archetype: 'champion' });
      expect((await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(A).send({}).expect(409)).body.code).toBe('PANEL_EDITED');
      await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(A).send({ force: true }).expect(200);
    });

    it('rejects an edit that contains an invalid persona, rather than silently dropping it', async () => {
      const { app } = build();
      const id = await readyProject(app);
      const r = await request(app).put(`/api/buyerlab/projects/${id}/panel`).set(A).send({ personas: [{ name: 'Ok' }, { archetype: 'champion' }] }).expect(400);
      expect(r.body.code).toBe('INVALID_PERSONA');
      await request(app).put(`/api/buyerlab/projects/${id}/panel`).set(A).send({ personas: [] }).expect(400);
    });
  });

  describe('runs', () => {
    it('runs a panel to a verified outcome: start, poll, read', async () => {
      const { app } = build();
      const id = await readyProject(app);
      const started = await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(201);
      expect(started.body.run).toMatchObject({ status: 'queued', provider: 'native', fundedBy: 'byok', callBudget: 7 });
      expect(started.body.estimate).toMatchObject({ calls: 5 });
      const runId = started.body.run.id as string;

      const polled = await request(app).get(`/api/buyerlab/runs/${runId}`).set(A).expect(200);
      expect(polled.body.run.status).toBe('done');
      expect(polled.body.progress).toMatchObject({ completedSteps: 5, totalSteps: 5, done: true });

      const out = await request(app).get(`/api/buyerlab/runs/${runId}/outcome`).set(A).expect(200);
      expect(out.body.outcome.disclaimer).toMatch(/^Simulated buyers, not measured customers/);
      expect(out.body.outcome.verification).toEqual({ kept: 5, dropped: 0 });
      expect(out.body.outcome.personas[0].claims[0].quote).toBe('Pricing is by signed proposal only');
      expect(JSON.stringify(out.body)).not.toMatch(/probabilit|conversion rate|revenue/i);

      const detail = await request(app).get(`/api/buyerlab/projects/${id}`).set(A).expect(200);
      expect(detail.body.latestRun.id).toBe(runId);
    });

    it('records who paid: a server grant is not a free credit', async () => {
      const { app, state } = build();
      state.fundedBy = 'server_grant';
      const id = await readyProject(app);
      expect((await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(201)).body.run.fundedBy).toBe('server_grant');
    });

    it('refuses to start without a key or a grant, and says where to add one', async () => {
      const { app, state } = build();
      const id = await readyProject(app);
      state.allow = false;
      const r = await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(402);
      expect(r.body).toMatchObject({ code: 'KEY_REQUIRED' });
      expect(r.body.error).toMatch(/key/i);
    });

    it('does not need a key to read a finished run', async () => {
      const { app, state } = build();
      const id = await readyProject(app);
      const runId = (await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(201)).body.run.id;
      await request(app).get(`/api/buyerlab/runs/${runId}`).set(A).expect(200);
      state.allow = false;
      expect((await request(app).get(`/api/buyerlab/runs/${runId}`).set(A).expect(200)).body.run.status).toBe('done');
    });

    it('needs a key to advance an unfinished run', async () => {
      const { app, state } = build();
      const id = await readyProject(app);
      const runId = (await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(201)).body.run.id;
      state.allow = false;
      await request(app).get(`/api/buyerlab/runs/${runId}`).set(A).expect(402);
    });

    it('rejects an unavailable engine, a project with no sources, and a bad budget', async () => {
      const { app } = build();
      const ready = await readyProject(app);
      expect((await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: ready, provider: 'mirofish' }).expect(501)).body.code).toBe('PROVIDER_UNAVAILABLE');
      await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: ready, provider: 'gpt' }).expect(400);
      await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: ready, budget: 0 }).expect(409);
      await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: ready, budget: '5' }).expect(400);
      const bare = (await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'Bare' })).body.project.id;
      expect((await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: bare }).expect(409)).body.code).toBe('NO_SOURCES');
    });

    it('answers 404 NO_OUTCOME before a run has produced one', async () => {
      const { app } = build();
      const id = await readyProject(app);
      const runId = (await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(201)).body.run.id;
      expect((await request(app).get(`/api/buyerlab/runs/${runId}/outcome`).set(A).expect(404)).body.code).toBe('NO_OUTCOME');
    });

    it('blocks both panel routes while a run is queued or running, and unblocks once it reaches a terminal status', async () => {
      const { app, store } = build();
      const id = await readyProject(app);
      const runId = (await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(201)).body.run.id as string;

      const postBlocked = await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(A).send({}).expect(409);
      expect(postBlocked.body.code).toBe('RUN_ACTIVE');
      const putBlocked = await request(app)
        .put(`/api/buyerlab/projects/${id}/panel`)
        .set(A)
        .send({ personas: [{ name: 'My buyer', archetype: 'champion', surfaces: ['public'], reasonNotToBuy: 'Too pricey.' }] })
        .expect(409);
      expect(putBlocked.body.code).toBe('RUN_ACTIVE');

      await store.updateRun('A', runId, { status: 'done' });

      await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(A).send({ force: true }).expect(200);
      await request(app)
        .put(`/api/buyerlab/projects/${id}/panel`)
        .set(A)
        .send({ personas: [{ name: 'My buyer', archetype: 'champion', surfaces: ['public'], reasonNotToBuy: 'Too pricey.' }] })
        .expect(200);
    });
  });

  describe('tenant isolation: another workspace\'s ids are simply not found', () => {
    it('answers 404 (never 403, never data) on every route', async () => {
      const { app } = build();
      const id = await readyProject(app, A);
      const runId = (await request(app).post('/api/buyerlab/runs').set(A).send({ projectId: id }).expect(201)).body.run.id;
      await request(app).get(`/api/buyerlab/runs/${runId}`).set(A).expect(200);

      expect((await request(app).get('/api/buyerlab/projects').set(B).expect(200)).body.projects).toEqual([]);
      await request(app).get(`/api/buyerlab/projects/${id}`).set(B).expect(404);
      await request(app).delete(`/api/buyerlab/projects/${id}`).set(B).expect(404);
      await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(B).send({ text: TEXT }).expect(404);
      await request(app).post(`/api/buyerlab/projects/${id}/panel`).set(B).send({}).expect(404);
      await request(app).put(`/api/buyerlab/projects/${id}/panel`).set(B).send({ personas: [{ name: 'x' }] }).expect(404);
      await request(app).post('/api/buyerlab/runs').set(B).send({ projectId: id }).expect(404);
      await request(app).get(`/api/buyerlab/runs/${runId}`).set(B).expect(404);
      await request(app).get(`/api/buyerlab/runs/${runId}/outcome`).set(B).expect(404);
      await request(app).get(`/api/buyerlab/projects/${id}`).set(A).expect(200);
    });

    it('treats a malformed id as not found', async () => {
      const { app } = build();
      await request(app).get('/api/buyerlab/projects/..%2F..%2Fetc').set(A).expect(404);
      await request(app).get(`/api/buyerlab/runs/${'x'.repeat(200)}`).set(A).expect(404);
    });
  });
});

describe('/api/buyerlab boundary hygiene', () => {
  const NUL = '\u0000';
  const LONE = '\uD83D';
  const wellFormed = (s: string) => s === (s as any).toWellFormed();

  async function empty(app: express.Express) {
    return (await request(app).post('/api/buyerlab/projects').set(A).send({ name: 'V' }).expect(201)).body.project.id as string;
  }

  it('strips NUL from name and brief, and never answers 500', async () => {
    const { app } = build();
    const r = await request(app).post('/api/buyerlab/projects').set(A).send({ name: `Vel${NUL}oce`, brief: `A${NUL} brief` }).expect(201);
    expect(r.body.project.name).toBe('Veloce');
    expect(r.body.project.brief).toBe('A brief');
  });

  it('rejects a name that is only NULs, as empty', async () => {
    const { app } = build();
    await request(app).post('/api/buyerlab/projects').set(A).send({ name: `${NUL}${NUL}` }).expect(400);
  });

  it('stores pasted text and label without NUL, and well-formed', async () => {
    const { app, store } = build();
    const id = await empty(app);
    const r = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ text: `${TEXT}${NUL} more${LONE}`, label: `Ho${NUL}me${LONE}` }).expect(201);
    expect(r.body.added[0].label).toBe('Home\uFFFD');
    const [src] = await store.listSources('A', id);
    expect(src.text).not.toContain(NUL);
    expect(wellFormed(src.text)).toBe(true);
    expect(src.text.endsWith('more\uFFFD')).toBe(true);
  });

  it('stores a crawled page clean: text, title, label and headings', async () => {
    const { app, crawl, store } = build();
    crawl.mockResolvedValue({ pages: [{ url: 'https://a.com/', title: `Ti${NUL}tle${LONE}`, headings: [`H${NUL}1`, `H${LONE}2`], text: `Buyer ${NUL}copy. `.repeat(30), status: 200 }], skipped: [], truncated: false });
    const id = await empty(app);
    const r = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'https://a.com/' }).expect(201);
    expect(r.body.added[0].label).toBe('Title\uFFFD');
    const [src] = await store.listSources('A', id);
    expect(src.text).not.toContain(NUL);
    expect(src.text.startsWith('Buyer copy. ')).toBe(true);
    expect(src.meta).toEqual({ status: 200, headings: ['H1', 'H\uFFFD2'] });
    expect(JSON.stringify(src)).not.toContain('\\u0000');
  });

  it('caps crawled page text at 200,000 characters', async () => {
    const { app, crawl, store } = build();
    crawl.mockResolvedValue({ pages: [{ url: 'https://a.com/', title: 'Big', headings: [], text: 'word '.repeat(60_000), status: 200 }], skipped: [], truncated: false });
    const id = await empty(app);
    await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'https://a.com/' }).expect(201);
    const [src] = await store.listSources('A', id);
    expect(src.text.length).toBeLessThanOrEqual(200_000);
    expect(src.text.length).toBeGreaterThan(199_000);
  });

  it('caps the echoed skipped list at 50 entries of 200 characters, on success and on 422', async () => {
    const { app, crawl } = build();
    const skipped = Array.from({ length: 60 }, (_, i) => ({ url: `https://a.com/${i}/${'x'.repeat(300)}`, reason: 'robots' }));
    const id = await empty(app);
    crawl.mockResolvedValueOnce({ pages: [{ url: 'https://a.com/', title: 'Home', headings: [], text: 'Buyer facing copy. '.repeat(30), status: 200 }], skipped, truncated: false });
    const ok = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'https://a.com/' }).expect(201);
    expect(ok.body.skipped).toHaveLength(50);
    expect(ok.body.skipped.every((s: any) => s.url.length === 200 && s.reason === 'robots')).toBe(true);
    crawl.mockResolvedValueOnce({ pages: [], skipped, truncated: false });
    const none = await request(app).post(`/api/buyerlab/projects/${id}/ingest`).set(A).send({ url: 'https://a.com/' }).expect(422);
    expect(none.body.skipped).toHaveLength(50);
    expect(none.body.skipped[0].url).toHaveLength(200);
  });
});
