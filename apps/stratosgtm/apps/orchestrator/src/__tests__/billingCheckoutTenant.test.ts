import express from 'express';
import request from 'supertest';

// The checkout tenant decides whose workspace a paid plan lands on. It must come
// from the verified session, never from a name the browser sends.
const createCheckoutSession = jest.fn();
jest.mock('../services/stripeService', () => ({
  stripeService: {
    isConfigured: () => true,
    isTestMode: () => true,
    createCheckoutSession: (...a: any[]) => createCheckoutSession(...a)
  }
}));
// Stand-in for the real JWT middleware: a test header plays "verified session".
jest.mock('../middleware/optionalUser', () => ({
  createOptionalUser: () => (req: any, _res: any, next: any) => {
    const ws = req.header('x-test-workspace');
    if (ws) {
      req.workspace = { tenantId: ws };
      req.user = { userId: 'u1', email: 'buyer@example.com', name: null, image: null };
    }
    next();
  }
}));

function app() {
  const { billingRouter } = require('../routes/billing');
  const a = express();
  a.use(express.json());
  a.use('/api/billing', billingRouter);
  return a;
}

describe('POST /api/billing/subscribe tenant binding', () => {
  beforeEach(() => {
    createCheckoutSession.mockReset();
    createCheckoutSession.mockResolvedValue({ checkoutUrl: 'https://checkout.example/cs_test_1', sessionId: 'cs_test_1' });
    delete process.env.ORCHESTRATOR_API_KEY;
  });

  it('binds a signed-in checkout to the caller workspace and ignores the browser-supplied name', async () => {
    const res = await request(app())
      .post('/api/billing/subscribe')
      .set('x-test-workspace', 'org-123')
      .send({ clientId: 'Someone Elses Company', planId: 'starter', billingCycle: 'monthly' })
      .expect(200);
    expect(res.body.checkout.checkoutUrl).toBeTruthy();
    const params = createCheckoutSession.mock.calls[0][0];
    expect(params.tenantId).toBe('ws:org-123');
    expect(params.customerEmail).toBe('buyer@example.com');
  });

  it('a signed-in checkout needs no clientId at all', async () => {
    await request(app())
      .post('/api/billing/subscribe')
      .set('x-test-workspace', 'org-123')
      .send({ planId: 'pro' })
      .expect(200);
    expect(createCheckoutSession.mock.calls[0][0].tenantId).toBe('ws:org-123');
  });

  it('returns to the console, not the marketing page', async () => {
    await request(app())
      .post('/api/billing/subscribe')
      .set('origin', 'https://stratosgtm.vercel.app')
      .set('x-test-workspace', 'org-123')
      .send({ planId: 'starter' })
      .expect(200);
    const params = createCheckoutSession.mock.calls[0][0];
    expect(params.successUrl).toBe('https://stratosgtm.vercel.app/console?checkout=success&plan=starter');
    expect(params.cancelUrl).toBe('https://stratosgtm.vercel.app/console?checkout=cancelled');
  });

  it('an anonymous demo visitor keeps the company-name path', async () => {
    await request(app())
      .post('/api/billing/subscribe')
      .send({ clientId: 'Demo Studio', planId: 'starter' })
      .expect(200);
    expect(createCheckoutSession.mock.calls[0][0].tenantId).toBe('Demo Studio');
  });

  it('rejects an anonymous caller who tries to forge a workspace tenant', async () => {
    await request(app())
      .post('/api/billing/subscribe')
      .send({ clientId: 'ws:org-123', planId: 'starter' })
      .expect(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects an anonymous request with no clientId', async () => {
    await request(app()).post('/api/billing/subscribe').send({ planId: 'starter' }).expect(400);
  });
});
