import { resolveTenantId, upsertSubscription, getSubscription, getUsageAggregate } from '../db/repository';
import { isDatabaseConfigured } from '../db/client';
import { billingPeriodStart, computeBilledMinutes } from './usageService';
import type {
  SubscriptionPlan,
  SubscriptionTierId,
  ClientUsageTelemetry,
  ROIParameters,
  ROICalculationResult
} from '@voice-os/shared';
import catalog from '@voice-os/shared/plans.json';

/**
 * Plan catalog — the single source of truth. The console's plans modal fetches this
 * from GET /api/billing/plans, and the prerendered /pricing page reads the same
 * packages/shared/plans.json at build time, so neither can drift from checkout.
 *
 * Priced from real cost. AssemblyAI's Voice Agent API is $4.50/hour all-in
 * ($0.075/min: speech recognition, LLM, voice, turn detection, tool calling), plus
 * Stripe's 2.9% + $0.30. Each tier holds ~72% gross margin monthly (~66% annual)
 * even if a customer uses every included minute; typical usage is lower, so real
 * margins run higher. Overage never sells below cost: 72% / 67% / 60%.
 *
 * An earlier catalog costed minutes at the $0.0025/min streaming-STT rate, which is
 * not what the product runs on, and claimed 87-93% margins. Those were wrong.
 *
 * Features list only what the code does today. Anything not yet built is left out
 * rather than promised.
 */
export const COST_PER_VOICE_MINUTE_USD: number = catalog.costPerVoiceMinuteUsd;

/**
 * The catalog lives in packages/shared/plans.json so the prerendered /pricing
 * page shows exactly what checkout charges and what the margin tests check.
 */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = catalog.plans as SubscriptionPlan[];

const MEMORY_MEASURED_FROM = 'in-memory only (no DATABASE_URL); not persisted and not measured from calls';
const DB_MEASURED_FROM = 'usage_records: billable, finalized calls in the current billing period';

/**
 * Marks a checkout tenant that the server itself resolved from a verified session
 * (`ws:<organizations.id>`). Anything else is a company name from the anonymous
 * demo and goes through resolveTenantId, which never lands in a signed-in
 * workspace. Only the checkout route may mint this prefix.
 */
export const WORKSPACE_TENANT_PREFIX = 'ws:';

export class BillingService {
  /**
   * Only used when there is no DATABASE_URL. Entries are created on demand at
   * zero and are always reported with persisted:false. There is no demo seed.
   */
  private clientUsageMap: Map<string, ClientUsageTelemetry> = new Map();

  public getPlans(): SubscriptionPlan[] {
    return SUBSCRIPTION_PLANS;
  }

  private monthWindow(now = new Date()) {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1000).toISOString()
    };
  }

  private memoryUsage(clientId: string, companyName?: string): ClientUsageTelemetry {
    if (!this.clientUsageMap.has(clientId)) {
      const { start, end } = this.monthWindow();
      this.clientUsageMap.set(clientId, {
        clientId,
        companyName: companyName || clientId,
        // Not entitled to anything until Stripe confirms a subscription.
        planId: 'starter',
        billingCycle: 'monthly',
        billingCycleStart: start,
        billingCycleEnd: end,
        minutesUsed: 0,
        minutesLimit: 0,
        callsCount: 0,
        leadsCaptured: 0,
        pipelineGeneratedUsd: 0,
        persisted: false,
        measuredFrom: MEMORY_MEASURED_FROM,
        source: 'memory'
      });
    }
    return this.clientUsageMap.get(clientId)!;
  }

  /** Usage for an already-resolved tenant, aggregated from usage_records. */
  public async getTenantUsage(tenantId: string, companyName?: string): Promise<ClientUsageTelemetry> {
    const sub = await getSubscription(tenantId);
    const periodStart = billingPeriodStart(sub);
    const aggregate = await getUsageAggregate(tenantId, periodStart);
    if (!aggregate) return this.memoryUsage(tenantId, companyName);

    const planId = (sub?.planId as SubscriptionTierId) || 'starter';
    const periodEnd =
      sub?.currentPeriodEnd ??
      new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1) - 1000);
    return {
      clientId: tenantId,
      companyName: companyName || tenantId,
      planId,
      billingCycle: sub?.billingCycle === 'annual' ? 'annual' : 'monthly',
      billingCycleStart: periodStart.toISOString(),
      billingCycleEnd: periodEnd.toISOString(),
      minutesUsed: aggregate.minutesUsed,
      minutesLimit: sub?.minutesLimit ?? 0,
      callsCount: aggregate.callsCount,
      leadsCaptured: aggregate.leadsCaptured,
      pipelineGeneratedUsd: aggregate.pipelineGeneratedUsd,
      subscriptionStatus: sub?.status,
      stripeCustomerId: sub?.stripeCustomerId ?? undefined,
      stripeSubscriptionId: sub?.stripeSubscriptionId ?? undefined,
      persisted: true,
      measuredFrom: DB_MEASURED_FROM,
      source: 'usage_records'
    };
  }

  /**
   * DB-backed usage: resolveTenantId -> getSubscription -> getUsageAggregate.
   * With no database it returns the in-memory record with persisted:false.
   */
  public async getClientUsage(clientId: string, companyName?: string): Promise<ClientUsageTelemetry> {
    const tenantId = await resolveTenantId(clientId);
    if (!tenantId) return this.memoryUsage(clientId, companyName);
    return this.getTenantUsage(tenantId, companyName || clientId);
  }

  /**
   * In-memory only (no-DATABASE_URL path). Live calls are metered by
   * usageService.finalizeCall from telemetry, not by this method.
   */
  public recordCallUsage(
    clientId: string,
    durationSeconds: number,
    isAfterHours: boolean = true,
    leadCaptured: boolean = false,
    estimatedDealValueUsd: number = 0
  ): ClientUsageTelemetry {
    void isAfterHours;
    const usage = this.memoryUsage(clientId);
    usage.minutesUsed += computeBilledMinutes(durationSeconds);
    usage.callsCount += 1;
    if (leadCaptured) {
      usage.leadsCaptured += 1;
      usage.pipelineGeneratedUsd += estimatedDealValueUsd;
    }
    return usage;
  }

  public updateSubscription(
    clientId: string,
    planId: SubscriptionTierId,
    billingCycle: 'monthly' | 'annual' = 'monthly'
  ): ClientUsageTelemetry {
    const usage = this.memoryUsage(clientId);
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId) || SUBSCRIPTION_PLANS[1];

    usage.planId = planId;
    usage.billingCycle = billingCycle;
    usage.minutesLimit = plan.voiceMinutesMonthly;

    this.clientUsageMap.set(clientId, usage);
    return usage;
  }

  /**
   * Worked ROI model. Every output derives from assumptions the caller controls and
   * which are echoed back; nothing here is a measured outcome.
   *
   * Corrects the previous version, which valued every voice lead as pipeline
   * (including ones the contact form would have caught anyway), applied no close
   * rate, divided pipeline by software cost as if pipeline were revenue, and
   * hardcoded the plan price — together overstating ROI by roughly the inverse of
   * the close rate.
   *
   * Lead with `breakEvenDealsPerMonth` when presenting this: it depends only on
   * plan price and contract value, not on the unmeasured conversion assumptions.
   */
  public calculateRoi(params: ROIParameters): ROICalculationResult {
    const pct = (value: number | undefined, fallback: number) =>
      Math.min(100, Math.max(0, Number.isFinite(value as number) ? (value as number) : fallback));

    const traffic = Math.max(100, params.monthlyTraffic || 5000);
    const acv = Math.max(100, params.averageContractValueUsd || 3500);
    const afterHoursPct = pct(params.afterHoursTrafficSharePct, 32);
    const baselinePct = pct(params.currentConversionPct, 0.8);
    const voicePct = pct(params.voiceConversionPct, 4.5);
    const closeRatePct = pct(params.closeRatePct, 20);

    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === (params.planId || 'pro')) || SUBSCRIPTION_PLANS[1];
    const planCostMonthlyUsd =
      params.billingCycle === 'annual' ? plan.priceAnnualMonthlyUsd : plan.priceMonthlyUsd;

    const afterHoursVisitors = Math.round(traffic * (afterHoursPct / 100));
    const staticFormBaselineLeads = Math.round(afterHoursVisitors * (baselinePct / 100));
    const expectedSpokenLeads = Math.round(afterHoursVisitors * (voicePct / 100));
    const incrementalLeads = Math.max(0, expectedSpokenLeads - staticFormBaselineLeads);

    const incrementalPipelineUsd = incrementalLeads * acv;
    const incrementalClosedDeals = Math.round(incrementalLeads * (closeRatePct / 100) * 10) / 10;
    const incrementalRevenueUsd = Math.round(incrementalClosedDeals * acv);
    const netRevenueGainUsd = incrementalRevenueUsd - planCostMonthlyUsd;
    const estimatedRoiMultiple =
      planCostMonthlyUsd > 0 ? Math.round((incrementalRevenueUsd / planCostMonthlyUsd) * 10) / 10 : 0;

    const breakEvenDealsPerMonth = Math.round((planCostMonthlyUsd / acv) * 100) / 100;
    const monthsPerDealToBreakEven =
      planCostMonthlyUsd > 0 ? Math.round((acv / planCostMonthlyUsd) * 10) / 10 : 0;

    return {
      monthlyTraffic: traffic,
      averageContractValueUsd: acv,
      afterHoursVisitors,
      expectedSpokenLeadsMonthly: expectedSpokenLeads,
      staticFormBaselineLeadsMonthly: staticFormBaselineLeads,
      incrementalLeadsMonthly: incrementalLeads,
      incrementalPipelineUsd,
      incrementalClosedDealsMonthly: incrementalClosedDeals,
      incrementalRevenueUsd,
      netRevenueGainUsd,
      planCostMonthlyUsd,
      estimatedRoiMultiple,
      breakEvenDealsPerMonth,
      monthsPerDealToBreakEven,
      assumptions: {
        afterHoursTrafficSharePct: afterHoursPct,
        currentConversionPct: baselinePct,
        voiceConversionPct: voicePct,
        closeRatePct
      }
    };
  }

  /**
   * Applies subscription state from a signature-verified Stripe webhook.
   *
   * This is the only path that may activate a paid plan. The previous
   * `simulateCheckout` activated it locally and returned a fabricated Stripe-
   * shaped session, so a plan could go "active" with no payment anywhere.
   * Activation now requires Stripe to confirm the money moved.
   */
  public async applySubscriptionState(state: {
    tenantId: string;
    planId: string | null;
    billingCycle: string | null;
    status: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  }): Promise<void> {
    const planId = (state.planId as SubscriptionTierId) || 'starter';
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
    if (!plan) {
      console.warn(`[Billing] Webhook referenced unknown plan '${state.planId}'; ignoring.`);
      return;
    }

    const cycle = state.billingCycle === 'annual' ? 'annual' : 'monthly';
    // Only a paying status grants the plan's minutes. A past_due or canceled
    // subscription must not keep its allowance.
    const isEntitled = state.status === 'active' || state.status === 'trialing';
    const minutesLimit = isEntitled ? plan.voiceMinutesMonthly : 0;

    this.updateSubscription(state.tenantId, planId, cycle);

    const usage = this.memoryUsage(state.tenantId);
    usage.planId = planId;
    usage.subscriptionStatus = state.status;
    usage.minutesLimit = minutesLimit;
    usage.stripeCustomerId = state.stripeCustomerId || usage.stripeCustomerId;
    usage.stripeSubscriptionId = state.stripeSubscriptionId || usage.stripeSubscriptionId;

    // Persist. A payment confirmation that only reaches memory is worse than
    // useless: the customer is charged and the entitlement disappears on the
    // next restart. Failing to write must therefore be loud, not swallowed.
    const tenantId = state.tenantId.startsWith(WORKSPACE_TENANT_PREFIX)
      ? isDatabaseConfigured()
        ? state.tenantId.slice(WORKSPACE_TENANT_PREFIX.length)
        : null
      : await resolveTenantId(state.tenantId);
    if (tenantId) {
      await upsertSubscription(tenantId, {
        planId,
        billingCycle: cycle,
        status: state.status,
        stripeCustomerId: state.stripeCustomerId,
        stripeSubscriptionId: state.stripeSubscriptionId,
        minutesLimit,
        currentPeriodStart: state.currentPeriodStart,
        currentPeriodEnd: state.currentPeriodEnd
      });
    } else {
      console.warn(
        `[Billing] No database configured — subscription for ${state.tenantId} is in memory only and will be lost on restart.`
      );
    }
  }
}

export const billingService = new BillingService();
