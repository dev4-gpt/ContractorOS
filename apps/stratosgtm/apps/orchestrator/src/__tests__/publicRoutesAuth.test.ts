import express from 'express';
import request from 'supertest';

// Regression: setting ORCHESTRATOR_API_KEY in production (to lock the owner-only
// routes) made the browser's own calls 401, because the public demo routes shared
// the same key check and a browser cannot hold that key. Checkout and the voice
// agent's CRM tools must stay reachable; only the admin-only routes take the key.
function app() {
  const { crmRouter } = require('../routes/crm');
  const { billingRouter } = require('../routes/billing');
  const a = express();
  a.use(express.json());
  a.use('/api/crm', crmRouter);
  a.use('/api/billing', billingRouter);
  return a;
}

describe('public routes stay reachable when the owner key is set', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.ORCHESTRATOR_API_KEY = 'owner-secret';
    process.env.NODE_ENV = 'production';
    delete process.env.STRIPE_SECRET_KEY;
  });
  afterAll(() => {
    process.env = env;
  });

  it.each([
    ['POST', '/api/crm/tools/execute'],
    ['GET', '/api/crm/leads'],
    ['GET', '/api/crm/members'],
    ['GET', '/api/crm/local-profile'],
    ['POST', '/api/billing/subscribe']
  ])('%s %s is not gated by the owner key', async (method, path) => {
    const a = app();
    const res = method === 'GET' ? await request(a).get(path) : await request(a).post(path).send({});
    expect(res.status).not.toBe(401);
  });

  it.each([
    ['GET', '/api/crm/telemetry'],
    ['POST', '/api/crm/scrape']
  ])('%s %s still requires the owner key', async (method, path) => {
    const a = app();
    const res = method === 'GET' ? await request(a).get(path) : await request(a).post(path).send({});
    expect(res.status).toBe(401);
  });

  it('admin-only routes fail closed in production when no owner key is configured', async () => {
    delete process.env.ORCHESTRATOR_API_KEY;
    const res = await request(app()).get('/api/crm/telemetry');
    expect(res.status).toBe(503);
  });
});
