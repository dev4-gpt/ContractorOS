import { BillingService, SUBSCRIPTION_PLANS, COST_PER_VOICE_MINUTE_USD } from '../services/billingService';
import catalog from '@voice-os/shared/plans.json';

const resolveTenantId = jest.fn();
const upsertSubscription = jest.fn();
let dbConfigured = true;
jest.mock('../db/client', () => ({ isDatabaseConfigured: () => dbConfigured }));
const getSubscription = jest.fn();
const getUsageAggregate = jest.fn();
jest.mock('../db/repository', () => ({
  resolveTenantId: (...a: any[]) => resolveTenantId(...a),
  upsertSubscription: (...a: any[]) => upsertSubscription(...a),
  getSubscription: (...a: any[]) => getSubscription(...a),
  getUsageAggregate: (...a: any[]) => getUsageAggregate(...a),
  finalizeCallUsage: jest.fn(),
  attachCallBilling: jest.fn(),
  getCallRecordByCallId: jest.fn(),
  listStaleOpenCalls: jest.fn(),
  markCallLeadCaptured: jest.fn(),
  findSiteKey: jest.fn(),
  insertSiteKey: jest.fn()
}));

describe('BillingService — pricing, usage and ROI', () => {
  let service: BillingService;

  beforeEach(() => {
    service = new BillingService();
    resolveTenantId.mockReset().mockResolvedValue(null);
    getSubscription.mockReset().mockResolvedValue(null);
    getUsageAggregate.mockReset().mockResolvedValue(null);
  });

  it('exposes the three tiers at their current prices', () => {
    const plans = service.getPlans();
    expect(plans.map((p) => p.id)).toEqual(['starter', 'pro', 'enterprise']);

    const pro = plans.find((p) => p.id === 'pro')!;
    expect(pro.priceMonthlyUsd).toBe(449);
    expect(pro.priceAnnualMonthlyUsd).toBe(359);
    expect(pro.voiceMinutesMonthly).toBe(1500);
    expect(pro.recommended).toBe(true);
  });

  describe('margin floor', () => {
    // Guards against re-pricing below cost. Voice is $0.075/min all-in; Stripe
    // takes 2.9% + $0.30. These hold even if a customer uses every minute.
    const stripeFee = (amount: number) => amount * 0.029 + 0.3;

    it.each(SUBSCRIPTION_PLANS.map((p) => [p.id, p]))(
      '%s keeps >= 65%% gross margin at full use of included minutes',
      (_id, plan) => {
        const cogs = plan.voiceMinutesMonthly * COST_PER_VOICE_MINUTE_USD;
        const monthly = (plan.priceMonthlyUsd - cogs - stripeFee(plan.priceMonthlyUsd)) / plan.priceMonthlyUsd;
        const annualFeePerMonth = stripeFee(plan.priceAnnualMonthlyUsd * 12) / 12;
        const annual =
          (plan.priceAnnualMonthlyUsd - cogs - annualFeePerMonth) / plan.priceAnnualMonthlyUsd;
        expect(monthly).toBeGreaterThanOrEqual(0.65);
        expect(annual).toBeGreaterThanOrEqual(0.65);
      }
    );

    it.each(SUBSCRIPTION_PLANS.map((p) => [p.id, p]))('%s never sells overage minutes below cost', (_id, plan) => {
      const margin =
        (plan.overageRatePerMinUsd - COST_PER_VOICE_MINUTE_USD - plan.overageRatePerMinUsd * 0.029) /
        plan.overageRatePerMinUsd;
      expect(margin).toBeGreaterThanOrEqual(0.55);
    });
  });

  it('does not provision unknown clients with a paid plan', async () => {
    // This used to auto-create any unknown id on Pro with 2,500 minutes.
    const usage = await service.getClientUsage('test_client_42', 'NovaTech');
    expect(usage.companyName).toBe('NovaTech');
    expect(usage.minutesLimit).toBe(0);
    expect(usage.minutesUsed).toBe(0);
  });

  it('reports no-database usage as in-memory with persisted:false and no fabricated fields', async () => {
    const usage = await service.getClientUsage('lead_ak_901');
    expect(usage.persisted).toBe(false);
    expect(usage.source).toBe('memory');
    expect(usage.minutesUsed).toBe(0);
    expect(usage.pipelineGeneratedUsd).toBe(0);
    expect(usage).not.toHaveProperty('estimatedRoiMultiplier');
    expect(usage).not.toHaveProperty('cacSavedUsd');
  });

  it('reads usage from the DB aggregate for the subscription period', async () => {
    const periodStart = new Date('2026-09-10T00:00:00Z');
    resolveTenantId.mockResolvedValue('tenant-1');
    getSubscription.mockResolvedValue({
      planId: 'pro',
      billingCycle: 'monthly',
      status: 'active',
      minutesLimit: 1500,
      currentPeriodStart: periodStart,
      currentPeriodEnd: new Date('2026-10-10T00:00:00Z'),
      stripeCustomerId: null,
      stripeSubscriptionId: null
    });
    getUsageAggregate.mockResolvedValue({
      minutesUsed: 42,
      callsCount: 5,
      leadsCaptured: 2,
      pipelineGeneratedUsd: 0
    });

    const usage = await service.getClientUsage('acme', 'Acme');
    expect(getUsageAggregate).toHaveBeenCalledWith('tenant-1', periodStart);
    expect(usage).toMatchObject({
      minutesUsed: 42,
      minutesLimit: 1500,
      callsCount: 5,
      leadsCaptured: 2,
      persisted: true,
      source: 'usage_records',
      planId: 'pro'
    });
  });

  it('records in-memory call minutes, and defaults deal value to 0', () => {
    const updated = service.recordCallUsage('lead_ak_901', 180, true, true);
    expect(updated.minutesUsed).toBe(3);
    expect(updated.leadsCaptured).toBe(1);
    expect(updated.pipelineGeneratedUsd).toBe(0);
  });

  describe('ROI model', () => {
    const base = { monthlyTraffic: 10000, averageContractValueUsd: 5000 };

    it('counts only incremental leads, and only closed deals as revenue', () => {
      const roi = service.calculateRoi(base);
      expect(roi.afterHoursVisitors).toBe(3200); // 32% of 10,000
      expect(roi.expectedSpokenLeadsMonthly).toBe(144); // 4.5% of 3,200
      expect(roi.staticFormBaselineLeadsMonthly).toBe(26); // 0.8% of 3,200
      expect(roi.incrementalLeadsMonthly).toBe(118);
      expect(roi.incrementalPipelineUsd).toBe(118 * 5000);
      // 20% default close rate. Pipeline is NOT revenue.
      expect(roi.incrementalClosedDealsMonthly).toBe(23.6);
      expect(roi.incrementalRevenueUsd).toBe(118000);
      expect(roi.incrementalRevenueUsd).toBeLessThan(roi.incrementalPipelineUsd);
      expect(roi.planCostMonthlyUsd).toBe(449);
      expect(roi.estimatedRoiMultiple).toBe(262.8);
    });

    it('respects a caller-supplied zero close rate instead of defaulting it', () => {
      const roi = service.calculateRoi({ ...base, closeRatePct: 0 });
      expect(roi.incrementalRevenueUsd).toBe(0);
      expect(roi.estimatedRoiMultiple).toBe(0);
      expect(roi.assumptions.closeRatePct).toBe(0);
    });

    it('computes break-even from price and contract value alone', () => {
      // The robust headline: it does not depend on the unmeasured conversion rates.
      const a = service.calculateRoi({ ...base, voiceConversionPct: 1 });
      const b = service.calculateRoi({ ...base, voiceConversionPct: 9 });
      expect(a.breakEvenDealsPerMonth).toBe(b.breakEvenDealsPerMonth);
      expect(a.breakEvenDealsPerMonth).toBe(0.09); // 449 / 5000
      expect(a.monthsPerDealToBreakEven).toBe(11.1); // 5000 / 449
    });

    it('prices against the chosen plan and billing cycle', () => {
      const roi = service.calculateRoi({ ...base, planId: 'starter', billingCycle: 'annual' });
      expect(roi.planCostMonthlyUsd).toBe(119);
    });
  });

  describe('subscription activation', () => {
    // The previous test here asserted that simulateCheckout returned a
    // `cs_`-prefixed id and a checkout.omnivox.os URL with status 'active' —
    // it locked in a fabricated payment. Activation now requires a
    // signature-verified Stripe webhook, which is the only thing that knows
    // whether money actually moved.

    const webhookState = (overrides: Record<string, unknown> = {}) => ({
      tenantId: 'test_client_checkout',
      planId: 'enterprise',
      billingCycle: 'annual',
      status: 'active',
      stripeCustomerId: 'cus_test123',
      stripeSubscriptionId: 'sub_test123',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      ...overrides
    });

    it('activates the plan when Stripe confirms payment', async () => {
      await service.applySubscriptionState(webhookState() as any);

      const client = await service.getClientUsage('test_client_checkout');
      expect(client.planId).toBe('enterprise');
      expect(client.billingCycle).toBe('annual');
      expect(client.minutesLimit).toBe(5000);
      expect(client.subscriptionStatus).toBe('active');
      expect(client.stripeSubscriptionId).toBe('sub_test123');
    });

    it('grants no minutes when the subscription is not in a paying state', async () => {
      // past_due and canceled customers must lose their allowance, or a failed
      // payment would still buy a month of voice minutes.
      for (const status of ['past_due', 'canceled', 'incomplete', 'unpaid']) {
        await service.applySubscriptionState(webhookState({ tenantId: `t_${status}`, status }) as any);
        expect((await service.getClientUsage(`t_${status}`)).minutesLimit).toBe(0);
      }
    });

    it('grants minutes while trialing', async () => {
      await service.applySubscriptionState(webhookState({ tenantId: 't_trial', status: 'trialing' }) as any);
      expect((await service.getClientUsage('t_trial')).minutesLimit).toBe(5000);
    });

    it('ignores a webhook naming an unknown plan rather than defaulting one', async () => {
      await service.applySubscriptionState(
        webhookState({ tenantId: 't_unknown', planId: 'free-forever' }) as any
      );
      // Must not silently provision a paid tier for a plan that does not exist.
      expect((await service.getClientUsage('t_unknown')).planId).not.toBe('free-forever');
      expect((await service.getClientUsage('t_unknown')).subscriptionStatus).toBeUndefined();
    });
  });

  describe('plan catalog source', () => {
    it('reads plans and voice cost from the shared catalog', () => {
      expect(SUBSCRIPTION_PLANS).toEqual(catalog.plans);
      expect(COST_PER_VOICE_MINUTE_USD).toBe(catalog.costPerVoiceMinuteUsd);
    });
  });

  describe('webhook tenant resolution', () => {
    const state = (tenantId: string) => ({
      tenantId,
      planId: 'starter',
      billingCycle: 'annual',
      status: 'active',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      currentPeriodStart: null,
      currentPeriodEnd: null
    });
    let service: BillingService;
    beforeEach(() => {
      service = new BillingService();
      resolveTenantId.mockReset().mockResolvedValue('name-resolved-id');
      upsertSubscription.mockReset();
      dbConfigured = true;
    });

    it('writes a workspace checkout straight to that workspace, without a name lookup', async () => {
      await service.applySubscriptionState(state('ws:org-123') as any);
      expect(resolveTenantId).not.toHaveBeenCalled();
      expect(upsertSubscription).toHaveBeenCalledWith('org-123', expect.objectContaining({ planId: 'starter', status: 'active', minutesLimit: 500 }));
    });

    it('keeps resolving an anonymous company-name checkout by name', async () => {
      await service.applySubscriptionState(state('Demo Studio') as any);
      expect(resolveTenantId).toHaveBeenCalledWith('Demo Studio');
      expect(upsertSubscription).toHaveBeenCalledWith('name-resolved-id', expect.any(Object));
    });

    it('does not persist a workspace checkout when no database is configured', async () => {
      dbConfigured = false;
      await service.applySubscriptionState(state('ws:org-123') as any);
      expect(upsertSubscription).not.toHaveBeenCalled();
    });
  });
});
