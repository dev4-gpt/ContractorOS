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
jest.mock('../services/deepseekService', () => ({ deepseekService: { createCompletion: jest.fn() } }));

const ensureForUser = jest.fn();
jest.mock('../services/workspaceService', () => ({
  workspaceService: { ensureForUser: (...args: any[]) => ensureForUser(...args) }
}));

let dbConfigured = true;
jest.mock('../db/client', () => ({ isDatabaseConfigured: () => dbConfigured }));

const resolveCallAttribution = jest.fn();
const checkEntitlement = jest.fn();
const hasServerKeyAccess = jest.fn();
jest.mock('../services/usageService', () => ({
  resolveCallAttribution: (...args: any[]) => resolveCallAttribution(...args),
  checkEntitlement: (...args: any[]) => checkEntitlement(...args),
  hasServerKeyAccess: (...args: any[]) => hasServerKeyAccess(...args)
}));

let tokenConfigured = true;
const signCallToken = jest.fn();
jest.mock('../services/callTokenService', () => ({
  isCallTokenConfigured: () => tokenConfigured,
  signCallToken: (...args: any[]) => signCallToken(...args)
}));

const verifyMock = jest.fn();
jest.mock('jose', () => ({
  ...jest.requireActual('jose'),
  jwtVerify: (...args: any[]) => verifyMock(...args),
  createRemoteJWKSet: () => (() => {}) as any
}));

function entitlement(over: Record<string, unknown> = {}) {
  return {
    allowed: true,
    minutesUsed: 10,
    minutesLimit: 500,
    minutesRemaining: 490,
    maxSessionSeconds: 3600,
    metered: true,
    ...over
  };
}

describe('POST /api/voice/token metering', () => {
  const originalKey = process.env.ASSEMBLYAI_API_KEY;
  const originalAuth = process.env.NEON_AUTH_BASE_URL;
  const originalFetch = global.fetch;
  let fetchSpy: jest.Mock;

  const build = () => {
    const { tokenRouter } = require('../routes/token');
    const app = express();
    app.use(express.json());
    app.use('/api/voice', tokenRouter);
    return app;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env.ASSEMBLYAI_API_KEY = 'server-assemblyai-key';
    process.env.NEON_AUTH_BASE_URL = 'https://ep-test.neonauth.example.neon.tech/neondb/auth';
    dbConfigured = true;
    tokenConfigured = true;
    resolveCallAttribution.mockReset();
    checkEntitlement.mockReset();
    hasServerKeyAccess.mockReset();
    // Default: nobody has been granted the server's keys and nobody has their own.
    hasServerKeyAccess.mockResolvedValue(false);
    getSecrets.mockReset();
    getSecrets.mockResolvedValue(null);
    delete process.env.ANON_MAX_SESSION_SECONDS;
    signCallToken.mockReset();
    ensureForUser.mockReset();
    verifyMock.mockReset();
    signCallToken.mockReturnValue({ token: 'signed-call-token', claims: {} });
    fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'aai-token' }) });
    global.fetch = fetchSpy as any;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.ASSEMBLYAI_API_KEY = originalKey;
    process.env.NEON_AUTH_BASE_URL = originalAuth;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('refuses with 402 and never calls AssemblyAI when the allowance is used up', async () => {
    resolveCallAttribution.mockResolvedValue({ tenantId: 't1', source: 'console', billable: true });
    checkEntitlement.mockResolvedValue(entitlement({ allowed: false, minutesUsed: 500, minutesRemaining: 0 }));

    const res = await request(build()).post('/api/voice/token').send({}).expect(402);

    expect(res.body.code).toBe('MINUTES_EXHAUSTED');
    expect(res.body.minutesUsed).toBe(500);
    expect(res.body.minutesLimit).toBe(500);
    // The whole point of enforcing at mint time: a refused call costs nothing.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(signCallToken).not.toHaveBeenCalled();
  });

  it('caps the AssemblyAI session to the remaining allowance', async () => {
    resolveCallAttribution.mockResolvedValue({ tenantId: 't1', source: 'console', billable: true });
    checkEntitlement.mockResolvedValue(entitlement({ minutesRemaining: 3, maxSessionSeconds: 180 }));

    await request(build()).post('/api/voice/token').send({}).expect(200);

    // The vendor ends the session, since there is no mid-call cutoff on our side.
    expect(String(fetchSpy.mock.calls[0][0])).toContain('max_session_duration_seconds=180');
  });

  it('never lets the cap exceed one hour', async () => {
    resolveCallAttribution.mockResolvedValue({ tenantId: 't1', source: 'console', billable: true });
    checkEntitlement.mockResolvedValue(entitlement({ maxSessionSeconds: 99999 }));

    await request(build()).post('/api/voice/token').send({}).expect(200);

    expect(String(fetchSpy.mock.calls[0][0])).toContain('max_session_duration_seconds=3600');
  });

  it('returns a signed call token bound to the server-chosen tenant, and the low-minutes warning', async () => {
    resolveCallAttribution.mockResolvedValue({ tenantId: 'tenant-x', source: 'console', billable: true });
    checkEntitlement.mockResolvedValue(entitlement({ warning: 'MINUTES_LOW', minutesRemaining: 40, maxSessionSeconds: 2400 }));

    const res = await request(build()).post('/api/voice/token').send({ company: 'Forged Corp' }).expect(200);

    expect(res.body.callToken).toBe('signed-call-token');
    expect(typeof res.body.callId).toBe('string');
    expect(res.body.warning).toBe('MINUTES_LOW');
    expect(res.body.minutesRemaining).toBe(40);
    const claims = signCallToken.mock.calls[0][0];
    expect(claims.tenantId).toBe('tenant-x');
    expect(claims.billable).toBe(true);
    expect(claims.maxSessionSeconds).toBe(2400);
    expect(claims.callId).toBe(res.body.callId);
  });

  it('does not let the client-supplied company decide attribution', async () => {
    resolveCallAttribution.mockResolvedValue({ tenantId: 'demo-tenant', source: 'console_anon', billable: false });

    await request(build()).post('/api/voice/token').send({ company: 'Victim Inc' }).expect(200);

    const input = resolveCallAttribution.mock.calls[0][0];
    expect(JSON.stringify(input)).not.toContain('Victim Inc');
  });

  it('does not check the allowance for a non-billable (anonymous) call', async () => {
    resolveCallAttribution.mockResolvedValue({ tenantId: 'demo-tenant', source: 'console_anon', billable: false });

    await request(build()).post('/api/voice/token').send({}).expect(200);

    expect(checkEntitlement).not.toHaveBeenCalled();
    expect(signCallToken.mock.calls[0][0].billable).toBe(false);
  });

  it('treats a request carrying a siteKey as a widget call', async () => {
    resolveCallAttribution.mockResolvedValue({ tenantId: 'owner', source: 'widget', billable: true });
    checkEntitlement.mockResolvedValue(entitlement());

    await request(build())
      .post('/api/voice/token')
      .set('Origin', 'https://customer.example')
      .send({ siteKey: 'pk_live_abc' })
      .expect(200);

    expect(resolveCallAttribution).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'widget', siteKey: 'pk_live_abc', origin: 'https://customer.example' })
    );
  });

  it('fails OPEN when metering itself throws: voice must not die for bookkeeping', async () => {
    resolveCallAttribution.mockRejectedValue(new Error('connection terminated'));

    const res = await request(build()).post('/api/voice/token').send({}).expect(200);

    expect(res.body.token).toBe('aai-token');
    expect(res.body.callToken).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('max_session_duration_seconds=3600');
  });

  it('skips metering entirely, without error, when there is no database', async () => {
    dbConfigured = false;

    const res = await request(build()).post('/api/voice/token').send({}).expect(200);

    expect(resolveCallAttribution).not.toHaveBeenCalled();
    expect(res.body.callToken).toBeUndefined();
  });

  it('mints unsigned, but still enforces the allowance, when CALL_TOKEN_SECRET is not set', async () => {
    tokenConfigured = false;
    resolveCallAttribution.mockResolvedValue({ tenantId: 't1', source: 'console', billable: true });
    checkEntitlement.mockResolvedValue(entitlement({ allowed: false }));

    await request(build()).post('/api/voice/token').send({}).expect(402);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not enforce when the datastore reports the tenant is not metered', async () => {
    resolveCallAttribution.mockResolvedValue({ tenantId: 't1', source: 'console', billable: true });
    checkEntitlement.mockResolvedValue(entitlement({ allowed: false, metered: false }));

    await request(build()).post('/api/voice/token').send({}).expect(200);
  });

  describe('no free credits for clients', () => {
    const signedIn = () => {
      verifyMock.mockResolvedValue({ payload: { sub: 'user-a', email: 'a@example.com' } });
      ensureForUser.mockResolvedValue({ tenantId: 'tenant-a', role: 'owner' });
    };

    it('caps an anonymous demo session at five minutes by default', async () => {
      resolveCallAttribution.mockResolvedValue({ tenantId: 'demo', source: 'console_anon', billable: false });

      await request(build()).post('/api/voice/token').send({}).expect(200);

      expect(String(fetchSpy.mock.calls[0][0])).toContain('max_session_duration_seconds=300');
    });

    it('caps an unattributed widget session the same way', async () => {
      resolveCallAttribution.mockResolvedValue({ tenantId: 'unattr', source: 'widget_unattributed', billable: false });

      await request(build()).post('/api/voice/token').send({}).expect(200);

      expect(String(fetchSpy.mock.calls[0][0])).toContain('max_session_duration_seconds=300');
    });

    it('honours ANON_MAX_SESSION_SECONDS, but never below a minute or above an hour', async () => {
      resolveCallAttribution.mockResolvedValue({ tenantId: 'demo', source: 'console_anon', billable: false });

      process.env.ANON_MAX_SESSION_SECONDS = '120';
      await request(build()).post('/api/voice/token').send({}).expect(200);
      expect(String(fetchSpy.mock.calls[0][0])).toContain('max_session_duration_seconds=120');

      process.env.ANON_MAX_SESSION_SECONDS = '5';
      await request(build()).post('/api/voice/token').send({}).expect(200);
      expect(String(fetchSpy.mock.calls[1][0])).toContain('max_session_duration_seconds=60');

      process.env.ANON_MAX_SESSION_SECONDS = '999999';
      await request(build()).post('/api/voice/token').send({}).expect(200);
      expect(String(fetchSpy.mock.calls[2][0])).toContain('max_session_duration_seconds=3600');
    });

    it('refuses a signed-in workspace with no subscription, no own key and no grant', async () => {
      signedIn();
      resolveCallAttribution.mockResolvedValue({ tenantId: 'tenant-a', source: 'console', billable: true });
      checkEntitlement.mockResolvedValue(entitlement({ allowed: false, minutesUsed: 0, minutesLimit: 0, minutesRemaining: 0 }));

      const res = await request(build()).post('/api/voice/token').set('Authorization', 'Bearer x').send({}).expect(402);

      expect(res.body.code).toBe('MINUTES_EXHAUSTED');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('lets a workspace use its own AssemblyAI key without touching our allowance', async () => {
      signedIn();
      getSecrets.mockImplementation(async (_tenant: string, platform: string) =>
        platform === 'assemblyai' ? { apiKey: 'clients-own-key' } : null
      );
      resolveCallAttribution.mockResolvedValue({ tenantId: 'tenant-a', source: 'console', billable: true });
      // Would refuse if it were consulted.
      checkEntitlement.mockResolvedValue(entitlement({ allowed: false }));

      await request(build()).post('/api/voice/token').set('Authorization', 'Bearer x').send({}).expect(200);

      expect(checkEntitlement).not.toHaveBeenCalled();
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer clients-own-key');
      // They pay AssemblyAI directly, so the call is not billable against our minutes.
      expect(signCallToken.mock.calls[0][0].billable).toBe(false);
    });

    it('lets an owner-granted workspace use the server key, and still records its usage', async () => {
      signedIn();
      hasServerKeyAccess.mockResolvedValue(true);
      resolveCallAttribution.mockResolvedValue({ tenantId: 'tenant-a', source: 'console', billable: true });
      checkEntitlement.mockResolvedValue(entitlement({ allowed: false }));

      await request(build()).post('/api/voice/token').set('Authorization', 'Bearer x').send({}).expect(200);

      expect(hasServerKeyAccess).toHaveBeenCalledWith('tenant-a');
      expect(checkEntitlement).not.toHaveBeenCalled();
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer server-assemblyai-key');
      expect(signCallToken.mock.calls[0][0].billable).toBe(true);
    });

    it('still honours a paid subscription for a workspace with neither a key nor a grant', async () => {
      signedIn();
      resolveCallAttribution.mockResolvedValue({ tenantId: 'tenant-a', source: 'console', billable: true });
      checkEntitlement.mockResolvedValue(entitlement({ minutesRemaining: 200, maxSessionSeconds: 3600 }));

      await request(build()).post('/api/voice/token').set('Authorization', 'Bearer x').send({}).expect(200);

      expect(checkEntitlement).toHaveBeenCalledWith('tenant-a');
    });
  });
});
