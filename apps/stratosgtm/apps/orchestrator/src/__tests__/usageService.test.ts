const repo = {
  resolveTenantId: jest.fn(),
  getSubscription: jest.fn(),
  getUsageAggregate: jest.fn(),
  finalizeCallUsage: jest.fn(),
  attachCallBilling: jest.fn(),
  getCallRecordByCallId: jest.fn(),
  listStaleOpenCalls: jest.fn(),
  markCallLeadCaptured: jest.fn(),
  findSiteKey: jest.fn(),
  insertSiteKey: jest.fn()
};
jest.mock('../db/repository', () => ({
  resolveTenantId: (...a: any[]) => repo.resolveTenantId(...a),
  getSubscription: (...a: any[]) => repo.getSubscription(...a),
  getUsageAggregate: (...a: any[]) => repo.getUsageAggregate(...a),
  finalizeCallUsage: (...a: any[]) => repo.finalizeCallUsage(...a),
  attachCallBilling: (...a: any[]) => repo.attachCallBilling(...a),
  getCallRecordByCallId: (...a: any[]) => repo.getCallRecordByCallId(...a),
  listStaleOpenCalls: (...a: any[]) => repo.listStaleOpenCalls(...a),
  markCallLeadCaptured: (...a: any[]) => repo.markCallLeadCaptured(...a),
  findSiteKey: (...a: any[]) => repo.findSiteKey(...a),
  insertSiteKey: (...a: any[]) => repo.insertSiteKey(...a)
}));

import {
  computeBilledSeconds,
  computeBilledMinutes,
  billingPeriodStart,
  evaluateEntitlement,
  checkEntitlement,
  finalizeCall,
  finalizeStaleCalls,
  resolveCallAttribution,
  onTelemetryIngest
} from '../services/usageService';
import { signCallToken } from '../services/callTokenService';

describe('computeBilledSeconds / minutes', () => {
  const iat = 1_000;
  it('clamps a 10x over-report to the token lifetime', () => {
    // 60s elapsed, client claims 600s.
    expect(computeBilledSeconds({ reportedAudioSeconds: 600, tokenIatSeconds: iat, endedAtMs: (iat + 60) * 1000, maxSessionSeconds: 3600 })).toBe(60);
  });
  it('clamps to maxSessionSeconds even if the call ran longer', () => {
    expect(computeBilledSeconds({ reportedAudioSeconds: 9999, tokenIatSeconds: iat, endedAtMs: (iat + 9999) * 1000, maxSessionSeconds: 300 })).toBe(300);
  });
  it('accepts an under-report', () => {
    expect(computeBilledSeconds({ reportedAudioSeconds: 20, tokenIatSeconds: iat, endedAtMs: (iat + 60) * 1000, maxSessionSeconds: 3600 })).toBe(20);
  });
  it('never goes negative when endedAt precedes iat', () => {
    expect(computeBilledSeconds({ reportedAudioSeconds: 50, tokenIatSeconds: iat, endedAtMs: (iat - 5) * 1000, maxSessionSeconds: 3600 })).toBe(0);
  });
  it('rounds minutes up with a floor of 1', () => {
    expect(computeBilledMinutes(0)).toBe(1);
    expect(computeBilledMinutes(1)).toBe(1);
    expect(computeBilledMinutes(60)).toBe(1);
    expect(computeBilledMinutes(61)).toBe(2);
    expect(computeBilledMinutes(150)).toBe(3);
  });
});

describe('billingPeriodStart', () => {
  it('uses the subscription period, else the UTC calendar month', () => {
    const d = new Date('2026-09-10T00:00:00Z');
    expect(billingPeriodStart({ currentPeriodStart: d })).toEqual(d);
    expect(billingPeriodStart(null, new Date('2026-09-18T12:00:00Z'))).toEqual(new Date('2026-09-01T00:00:00Z'));
  });
});

describe('entitlement', () => {
  it('exhausted -> not allowed, no session', () => {
    const e = evaluateEntitlement(100, 100);
    expect(e).toMatchObject({ allowed: false, minutesRemaining: 0, maxSessionSeconds: 0 });
  });
  it('>= 90% -> MINUTES_LOW', () => {
    expect(evaluateEntitlement(90, 100)).toMatchObject({ allowed: true, warning: 'MINUTES_LOW' });
    expect(evaluateEntitlement(89, 100).warning).toBeUndefined();
  });
  it('maxSessionSeconds = min(3600, remaining*60)', () => {
    expect(evaluateEntitlement(0, 1500).maxSessionSeconds).toBe(3600);
    expect(evaluateEntitlement(95, 100).maxSessionSeconds).toBe(300);
  });

  describe('checkEntitlement', () => {
    const OLD = process.env.DATABASE_URL;
    beforeEach(() => {
      process.env.DATABASE_URL = 'postgres://test';
      Object.values(repo).forEach((f) => f.mockReset());
    });
    afterEach(() => {
      process.env.DATABASE_URL = OLD;
    });

    it('combines subscription limit with the aggregate for the period', async () => {
      const start = new Date('2026-09-10T00:00:00Z');
      repo.getSubscription.mockResolvedValue({ minutesLimit: 1500, currentPeriodStart: start });
      repo.getUsageAggregate.mockResolvedValue({ minutesUsed: 1400 });
      const e = await checkEntitlement('t1');
      expect(repo.getUsageAggregate).toHaveBeenCalledWith('t1', start);
      expect(e).toMatchObject({ allowed: true, minutesRemaining: 100, warning: 'MINUTES_LOW', maxSessionSeconds: 3600 });
    });
    it('refuses a tenant with no subscription (no trial configured)', async () => {
      repo.getSubscription.mockResolvedValue(null);
      repo.getUsageAggregate.mockResolvedValue({ minutesUsed: 0 });
      expect((await checkEntitlement('t1')).allowed).toBe(false);
    });
    it('reports metered:false without a database', async () => {
      delete process.env.DATABASE_URL;
      expect(await checkEntitlement('t1')).toMatchObject({ allowed: true, metered: false });
    });
  });
});

describe('resolveCallAttribution', () => {
  beforeEach(() => Object.values(repo).forEach((f) => f.mockReset()));

  it('signed-in console -> workspace tenant, billable', async () => {
    expect(await resolveCallAttribution({ channel: 'console', workspaceTenantId: 'w1' })).toEqual({ tenantId: 'w1', source: 'console', billable: true });
  });
  it('anonymous console -> demo, not billable', async () => {
    repo.resolveTenantId.mockResolvedValue('demo-id');
    expect(await resolveCallAttribution({ channel: 'console' })).toEqual({ tenantId: 'demo-id', source: 'console_anon', billable: false });
  });
  it('widget with valid key and allowed origin -> key tenant', async () => {
    repo.findSiteKey.mockResolvedValue({ tenantId: 'owner', allowedOrigins: ['https://site.com'], revokedAt: null });
    expect(await resolveCallAttribution({ channel: 'widget', siteKey: 'k', origin: 'https://site.com' })).toEqual({ tenantId: 'owner', source: 'widget', billable: true });
  });
  it.each([
    ['wrong origin', { tenantId: 'owner', allowedOrigins: ['https://site.com'], revokedAt: null }, 'https://evil.com'],
    ['revoked key', { tenantId: 'owner', allowedOrigins: ['https://site.com'], revokedAt: new Date() }, 'https://site.com'],
    ['unknown key', null, 'https://site.com']
  ])('widget with %s -> unattributed, not billable', async (_n, key, origin) => {
    repo.findSiteKey.mockResolvedValue(key);
    repo.resolveTenantId.mockResolvedValue('unattr');
    expect(await resolveCallAttribution({ channel: 'widget', siteKey: 'k', origin: origin as string })).toEqual({ tenantId: 'unattr', source: 'widget_unattributed', billable: false });
  });
});

/** In-memory stand-in for call_records + usage_records with the real idempotency rules. */
function fakeStore(rows: any[]) {
  const usage = new Map<string, any>();
  repo.listStaleOpenCalls.mockImplementation(async (_older: Date, limit: number) =>
    rows.filter((r) => r.status === 'open').slice(0, limit)
  );
  repo.getSubscription.mockResolvedValue(null);
  repo.finalizeCallUsage.mockImplementation(async (callId: string, tenantId: string, ev: any) => {
    const key = `${tenantId}:${ev.sessionId}`;
    const inserted = !usage.has(key);
    if (inserted) usage.set(key, ev);
    rows.find((r) => r.callId === callId).status = 'finalized';
    return inserted;
  });
  return usage;
}

const openCall = (over: Record<string, any> = {}) => ({
  callId: 'call-1',
  tenantId: 'forgeable',
  status: 'open',
  billingTenantId: 'tenant-a',
  billable: true,
  billingSource: 'console',
  tokenIat: new Date('2026-09-18T10:00:00Z'),
  maxSessionSeconds: 3600,
  audioSecondsCaptured: 125,
  durationMs: null,
  leadCaptured: true,
  startedAt: new Date('2026-09-18T10:00:00Z'),
  endedAt: null,
  updatedAt: new Date('2026-09-18T10:03:00Z'),
  ...over
});

describe('finalize', () => {
  beforeEach(() => Object.values(repo).forEach((f) => f.mockReset()));

  it('finalizeStaleCalls writes exactly once when run twice', async () => {
    const rows = [openCall()];
    const usage = fakeStore(rows);
    const now = new Date('2026-09-18T10:20:00Z');

    expect(await finalizeStaleCalls(now)).toBe(1);
    expect(await finalizeStaleCalls(now)).toBe(0);
    expect(usage.size).toBe(1);
    const ev = usage.get('tenant-a:call-1');
    expect(ev).toMatchObject({ billedMinutes: 3, durationSeconds: 125, billable: true, leadCaptured: true, dealValueCents: 0 });
    expect(ev.periodStart).toEqual(new Date('2026-09-01T00:00:00Z'));
  });

  it('a stale call ends at its last heartbeat, capping over-reported audio', async () => {
    const rows = [openCall({ audioSecondsCaptured: 5000 })];
    const usage = fakeStore(rows);
    await finalizeStaleCalls(new Date('2026-09-18T11:00:00Z'));
    expect(usage.get('tenant-a:call-1').durationSeconds).toBe(180); // heartbeat 3 min after iat
  });

  it('bounds a batch to 50 rows', async () => {
    fakeStore([]);
    await finalizeStaleCalls();
    expect(repo.listStaleOpenCalls.mock.calls[0][1]).toBe(50);
  });

  it('a call with no verified token is parked non-billable on unattributed', async () => {
    const rows = [openCall({ billingTenantId: null, billable: false, billingSource: null })];
    fakeStore(rows);
    repo.resolveTenantId.mockResolvedValue('unattr');
    await finalizeCall(rows[0] as any);
    expect(repo.finalizeCallUsage.mock.calls[0][1]).toBe('unattr');
    expect(repo.finalizeCallUsage.mock.calls[0][2]).toMatchObject({ billable: false });
  });

  it('skips already-finalized calls', async () => {
    const r = await finalizeCall(openCall({ status: 'finalized' }) as any);
    expect(r.written).toBe(false);
    expect(repo.finalizeCallUsage).not.toHaveBeenCalled();
  });
});

describe('onTelemetryIngest', () => {
  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    process.env.CALL_TOKEN_SECRET = 'test-secret';
  });

  it('attaches verified token claims, ignoring a token minted for another call', async () => {
    const { token } = signCallToken({ callId: 'call-1', tenantId: 'tenant-a', source: 'console', billable: true, maxSessionSeconds: 600 });
    await onTelemetryIngest({ callToken: token, audioSecondsCaptured: 42.4 }, { callId: 'call-1', endedAt: null });
    expect(repo.attachCallBilling).toHaveBeenCalledWith('call-1', expect.objectContaining({ billingTenantId: 'tenant-a', audioSecondsCaptured: 42, maxSessionSeconds: 600 }));

    repo.attachCallBilling.mockReset();
    await onTelemetryIngest({ callToken: token }, { callId: 'other-call', endedAt: null });
    expect(repo.attachCallBilling).not.toHaveBeenCalled();
  });

  it('finalizes when the payload carries an end', async () => {
    repo.getCallRecordByCallId.mockResolvedValue(openCall());
    repo.getSubscription.mockResolvedValue(null);
    repo.finalizeCallUsage.mockResolvedValue(true);
    await onTelemetryIngest({}, { callId: 'call-1', endedAt: new Date() });
    expect(repo.finalizeCallUsage).toHaveBeenCalledTimes(1);
  });
});
