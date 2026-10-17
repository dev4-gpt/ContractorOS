import express from 'express';
import request from 'supertest';

jest.mock('../services/crmStore', () => ({
  crmStore: {
    ready: Promise.resolve(),
    getLeads: () => [],
    commitLead: jest.fn(),
    flush: jest.fn(),
    createOrUpdateLead: (lead: any) => ({ id: 'lead-1', notes: [], ...lead })
  }
}));
jest.mock('../services/brandVoiceService', () => ({
  brandVoiceService: { getProfileByCompany: () => null }
}));
jest.mock('../services/complianceService', () => ({
  complianceService: { getPolicy: () => ({ region: 'unknown' }) }
}));

const getSecrets = jest.fn();
jest.mock('../services/workspaceKeysService', () => ({
  workspaceKeysService: { getSecrets: (...args: any[]) => getSecrets(...args) }
}));

const createCompletion = jest.fn();
jest.mock('../services/deepseekService', () => ({
  deepseekService: { createCompletion: (...args: any[]) => createCompletion(...args) }
}));

const ensureForUser = jest.fn();
jest.mock('../services/workspaceService', () => ({
  workspaceService: { ensureForUser: (...args: any[]) => ensureForUser(...args) }
}));

jest.mock('../db/client', () => ({ isDatabaseConfigured: () => true }));

const verifyMock = jest.fn();
jest.mock('jose', () => ({
  ...jest.requireActual('jose'),
  jwtVerify: (...args: any[]) => verifyMock(...args),
  createRemoteJWKSet: () => (() => {}) as any
}));

describe('POST /api/voice/token BYOK', () => {
  const originalAssemblyKey = process.env.ASSEMBLYAI_API_KEY;
  const originalAuthBase = process.env.NEON_AUTH_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env.ASSEMBLYAI_API_KEY = 'server-assemblyai-key';
    process.env.NEON_AUTH_BASE_URL = 'https://ep-test.neonauth.example.neon.tech/neondb/auth';
    getSecrets.mockReset();
    ensureForUser.mockReset();
    verifyMock.mockReset();
  });

  afterEach(() => {
    process.env.ASSEMBLYAI_API_KEY = originalAssemblyKey;
    process.env.NEON_AUTH_BASE_URL = originalAuthBase;
    global.fetch = originalFetch;
  });

  it('uses the server key with no Authorization header', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 't1' }) });
    global.fetch = fetchSpy as any;

    const { tokenRouter } = require('../routes/token');
    const app = express();
    app.use(express.json());
    app.use('/api/voice', tokenRouter);

    await request(app).post('/api/voice/token').send({}).expect(200);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('agents.assemblyai.com');
    expect(init.headers.Authorization).toBe('Bearer server-assemblyai-key');
    expect(getSecrets).not.toHaveBeenCalled();
  });

  it('uses the signed-in caller\'s saved AssemblyAI key when present', async () => {
    verifyMock.mockResolvedValue({ payload: { sub: 'user-a', email: 'a@example.com' } });
    ensureForUser.mockResolvedValue({ tenantId: 'tenant-a', role: 'owner' });
    getSecrets.mockImplementation(async (_tenantId: string, platform: string) =>
      platform === 'assemblyai' ? { apiKey: 'users-own-assemblyai-key' } : null
    );
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 't1' }) });
    global.fetch = fetchSpy as any;

    const { tokenRouter } = require('../routes/token');
    const app = express();
    app.use(express.json());
    app.use('/api/voice', tokenRouter);

    await request(app).post('/api/voice/token').set('Authorization', 'Bearer fake').send({}).expect(200);

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer users-own-assemblyai-key');
  });

  it('falls back to the server key when the caller has no saved AssemblyAI key', async () => {
    verifyMock.mockResolvedValue({ payload: { sub: 'user-a', email: 'a@example.com' } });
    ensureForUser.mockResolvedValue({ tenantId: 'tenant-a', role: 'owner' });
    getSecrets.mockResolvedValue(null);
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 't1' }) });
    global.fetch = fetchSpy as any;

    const { tokenRouter } = require('../routes/token');
    const app = express();
    app.use(express.json());
    app.use('/api/voice', tokenRouter);

    await request(app).post('/api/voice/token').set('Authorization', 'Bearer fake').send({}).expect(200);

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer server-assemblyai-key');
  });

  it('falls back to the server key when the key store itself throws', async () => {
    // Reachable in production: DATABASE_URL set (so optionalUser resolves a
    // workspace) but MASTER_KEY missing, which makes getSecrets throw. Voice
    // must not hang or 500 for a signed-in caller because of that.
    verifyMock.mockResolvedValue({ payload: { sub: 'user-a', email: 'a@example.com' } });
    ensureForUser.mockResolvedValue({ tenantId: 'tenant-a', role: 'owner' });
    // A bad decrypt surfaces as a JSON.parse SyntaxError whose message quotes the
    // garbled plaintext, so the message must never reach the log.
    const leaky = new SyntaxError('Unexpected token in JSON at position 3: {"apiKey":"sk-live-SECRET"}');
    getSecrets.mockRejectedValue(leaky);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 't1' }) });
    global.fetch = fetchSpy as any;

    const { tokenRouter } = require('../routes/token');
    const app = express();
    app.use(express.json());
    app.use('/api/voice', tokenRouter);

    await request(app).post('/api/voice/token').set('Authorization', 'Bearer fake').send({}).expect(200);

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer server-assemblyai-key');
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('SyntaxError');
    expect(logged).not.toContain('sk-live-SECRET');
    warn.mockRestore();
  });

  it('falls back to the server key on an invalid token, without erroring', async () => {
    verifyMock.mockRejectedValue(new Error('bad signature'));
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 't1' }) });
    global.fetch = fetchSpy as any;

    const { tokenRouter } = require('../routes/token');
    const app = express();
    app.use(express.json());
    app.use('/api/voice', tokenRouter);

    const res = await request(app).post('/api/voice/token').set('Authorization', 'Bearer fake').send({});
    expect(res.status).toBe(200);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer server-assemblyai-key');
  });
});

describe('POST /api/voice/chat BYOK', () => {
  const originalAuthBase = process.env.NEON_AUTH_BASE_URL;

  beforeEach(() => {
    jest.resetModules();
    process.env.NEON_AUTH_BASE_URL = 'https://ep-test.neonauth.example.neon.tech/neondb/auth';
    getSecrets.mockReset();
    ensureForUser.mockReset();
    verifyMock.mockReset();
    createCompletion.mockReset();
    createCompletion.mockResolvedValue({ content: 'Understood.', isFallback: false });
  });

  afterEach(() => {
    process.env.NEON_AUTH_BASE_URL = originalAuthBase;
  });

  const buildApp = () => {
    const { tokenRouter } = require('../routes/token');
    const app = express();
    app.use(express.json());
    app.use('/api/voice', tokenRouter);
    return app;
  };

  it('uses the signed-in caller\'s saved DeepSeek key when present', async () => {
    verifyMock.mockResolvedValue({ payload: { sub: 'user-a', email: 'a@example.com' } });
    ensureForUser.mockResolvedValue({ tenantId: 'tenant-a', role: 'owner' });
    getSecrets.mockImplementation(async (_tenantId: string, platform: string) =>
      platform === 'deepseek' ? { apiKey: 'users-own-deepseek-key' } : null
    );

    await request(buildApp())
      .post('/api/voice/chat')
      .set('Authorization', 'Bearer fake')
      .send({ text: 'What does GrowthOS cost?' })
      .expect(200);

    expect(getSecrets).toHaveBeenCalledWith('tenant-a', 'deepseek');
    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'users-own-deepseek-key' })
    );
  });

  it('falls back to the server key when the caller has no saved DeepSeek key', async () => {
    verifyMock.mockResolvedValue({ payload: { sub: 'user-a', email: 'a@example.com' } });
    ensureForUser.mockResolvedValue({ tenantId: 'tenant-a', role: 'owner' });
    getSecrets.mockResolvedValue(null);

    await request(buildApp())
      .post('/api/voice/chat')
      .set('Authorization', 'Bearer fake')
      .send({ text: 'What does GrowthOS cost?' })
      .expect(200);

    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: undefined })
    );
  });
});
