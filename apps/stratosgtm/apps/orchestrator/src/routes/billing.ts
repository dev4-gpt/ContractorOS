import { Router, Request, Response } from 'express';
import { billingService, WORKSPACE_TENANT_PREFIX } from '../services/billingService';
import { requireOwnerKey } from '../middleware/auth';
import { stripeService } from '../services/stripeService';
import { finalizeStaleCalls } from '../services/usageService';
import { createRequireUser, AuthedRequest } from '../middleware/requireUser';
import { createOptionalUser, OptionalAuthedRequest } from '../middleware/optionalUser';
import { workspaceService } from '../services/workspaceService';
import { isDatabaseConfigured } from '../db/client';
import type { SubscriptionTierId, ROIParameters } from '@voice-os/shared';

export const billingRouter = Router();

/** The only plan ids that may be billed. Anything else is rejected, never defaulted. */
const VALID_PLAN_IDS: SubscriptionTierId[] = ['starter', 'pro', 'enterprise'];

function isValidPlanId(value: unknown): value is SubscriptionTierId {
  return typeof value === 'string' && (VALID_PLAN_IDS as string[]).includes(value);
}

// GET /api/billing/plans
billingRouter.get('/plans', (_req: Request, res: Response) => {
  try {
    const plans = billingService.getPlans();
    res.json({
      status: 'success',
      plans,
      currency: 'USD',
      annualDiscountPct: 20
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Lazy stale-call reconciliation: there is no cron, so each usage read first
 * closes (bounded to 50) calls whose last heartbeat is over 5 minutes old.
 * Failure here must never break the read.
 */
async function reconcileStaleCalls() {
  try {
    await finalizeStaleCalls();
  } catch (err: any) {
    console.error('[Billing] Stale call reconciliation failed:', err?.message);
  }
}

const requireUser = createRequireUser({
  authBaseUrl: process.env.NEON_AUTH_BASE_URL,
  workspaces: workspaceService,
  storageReady: isDatabaseConfigured
});

// Best effort: a signed-in buyer's checkout is bound to their own workspace; an
// anonymous demo visitor still gets the legacy company-name path.
const optionalUser = createOptionalUser({
  authBaseUrl: process.env.NEON_AUTH_BASE_URL,
  workspaces: workspaceService,
  storageReady: isDatabaseConfigured
});

// GET /api/billing/usage/me — the signed-in console reads its own workspace usage.
// Declared before /usage/:clientId so 'me' is never treated as a client id.
billingRouter.get('/usage/me', requireUser, async (req: Request, res: Response) => {
  try {
    await reconcileStaleCalls();
    const { workspace } = req as AuthedRequest;
    const usage = await billingService.getTenantUsage(workspace.tenantId);
    res.json({ status: 'success', usage, persisted: usage.persisted, measuredFrom: usage.measuredFrom, source: usage.source });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/usage/:clientId
billingRouter.get('/usage/:clientId', requireOwnerKey, async (req: Request, res: Response) => {
  try {
    await reconcileStaleCalls();
    const { clientId } = req.params;
    const companyName = (req.query.company as string) || undefined;
    const usage = await billingService.getClientUsage(clientId, companyName);
    res.json({
      status: 'success',
      usage,
      persisted: usage.persisted,
      measuredFrom: usage.measuredFrom,
      source: usage.source
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/calculate-roi
billingRouter.post('/calculate-roi', (req: Request, res: Response) => {
  try {
    const {
      monthlyTraffic,
      averageContractValueUsd,
      currentConversionPct,
      afterHoursTrafficSharePct,
      voiceConversionPct,
      closeRatePct,
      planId,
      billingCycle
    } = req.body;
    // Optional percentages pass through undefined so the service applies its
    // documented defaults; a caller-supplied 0 is a real value and is kept.
    const optionalNumber = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    const params: ROIParameters = {
      monthlyTraffic: Number(monthlyTraffic) || 5000,
      averageContractValueUsd: Number(averageContractValueUsd) || 3500,
      currentConversionPct: optionalNumber(currentConversionPct),
      afterHoursTrafficSharePct: optionalNumber(afterHoursTrafficSharePct),
      voiceConversionPct: optionalNumber(voiceConversionPct),
      closeRatePct: optionalNumber(closeRatePct),
      planId: isValidPlanId(planId) ? planId : 'pro',
      billingCycle: billingCycle === 'annual' ? 'annual' : 'monthly'
    };

    const calculation = billingService.calculateRoi(params);
    res.json({
      status: 'success',
      result: calculation
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/subscribe
billingRouter.post('/subscribe', optionalUser, async (req: Request, res: Response) => {
  try {
    const { clientId, planId, billingCycle, email } = req.body;
    const authed = req as OptionalAuthedRequest;
    const workspace = authed.workspace;
    if (!planId || (!workspace && !clientId)) {
      return res.status(400).json({ error: 'Missing required fields: clientId, planId' });
    }
    // The workspace prefix is minted only here, from a verified session. A caller
    // who is not signed in must never be able to name someone else's workspace.
    if (!workspace && String(clientId).startsWith(WORKSPACE_TENANT_PREFIX)) {
      return res.status(400).json({ error: `clientId may not start with '${WORKSPACE_TENANT_PREFIX}'.` });
    }
    const checkoutTenant = workspace ? `${WORKSPACE_TENANT_PREFIX}${workspace.tenantId}` : String(clientId);
    if (!isValidPlanId(planId)) {
      return res.status(400).json({
        error: `Unknown planId '${planId}'. Must be one of: ${VALID_PLAN_IDS.join(', ')}`
      });
    }

    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly';
    const plan = billingService.getPlans().find((p) => p.id === planId);
    if (!plan) {
      return res.status(400).json({ error: `Unknown planId '${planId}'` });
    }

    // No payment provider means no checkout. Saying so beats the previous
    // behaviour of returning a Stripe-shaped session that charged nobody while
    // activating the plan anyway.
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        error: 'Billing is not configured on this server.',
        code: 'BILLING_UNCONFIGURED',
        message: 'Set STRIPE_SECRET_KEY to enable checkout.'
      });
    }

    const origin = req.header('origin') || process.env.CLIENT_URL || 'http://localhost:3000';
    const checkout = await stripeService.createCheckoutSession({
      tenantId: checkoutTenant,
      plan: {
        id: plan.id,
        name: plan.name,
        // The catalog is authored in dollars; Stripe bills in cents.
        priceMonthlyCents: Math.round(plan.priceMonthlyUsd * 100),
        priceAnnualMonthlyCents: Math.round(plan.priceAnnualMonthlyUsd * 100),
        minutesLimit: plan.voiceMinutesMonthly
      },
      billingCycle: cycle,
      successUrl: `${origin}/console?checkout=success&plan=${planId}`,
      cancelUrl: `${origin}/console?checkout=cancelled`,
      customerEmail: authed.user?.email ?? (typeof email === 'string' ? email : undefined)
    });

    if (!checkout.checkoutUrl) {
      return res.status(502).json({
        error: checkout.reason || 'Could not create a checkout session.',
        code: 'CHECKOUT_FAILED'
      });
    }

    res.json({
      status: 'success',
      // The plan is NOT active yet. It activates when Stripe confirms payment on
      // the webhook, which is the only source of truth for whether money moved.
      message: `Checkout session created for ${planId} (${cycle}). Subscription activates on payment confirmation.`,
      checkout: { checkoutUrl: checkout.checkoutUrl, sessionId: checkout.sessionId },
      testMode: stripeService.isTestMode()
    });
  } catch (err: any) {
    console.error('[Checkout Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/record-call
// Manual, in-memory only (persisted:false): it does NOT write usage_records. Real
// calls are metered from telemetry via usageService.finalizeCall. Kept for
// no-database local use; a missing deal value is 0, never an invented figure.
billingRouter.post('/record-call', requireOwnerKey, (req: Request, res: Response) => {
  try {
    const { clientId, durationSeconds, isAfterHours, leadCaptured, estimatedDealValueUsd } = req.body;
    if (!clientId || durationSeconds === undefined) {
      return res.status(400).json({ error: 'Missing clientId or durationSeconds' });
    }

    const duration = Number(durationSeconds);
    if (!Number.isFinite(duration) || duration < 0) {
      return res.status(400).json({ error: 'durationSeconds must be a non-negative number' });
    }

    // Deal value is only defaulted when genuinely absent. A caller-supplied 0 is a
    // real value (a disqualified lead) and must not be replaced by the default,
    // which would silently inflate the tenant's reported pipeline.
    let dealValue = 0;
    if (estimatedDealValueUsd !== undefined && estimatedDealValueUsd !== null) {
      const parsed = Number(estimatedDealValueUsd);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'estimatedDealValueUsd must be a non-negative number' });
      }
      dealValue = parsed;
    }

    const updated = billingService.recordCallUsage(
      clientId,
      duration,
      isAfterHours !== undefined ? Boolean(isAfterHours) : true,
      Boolean(leadCaptured),
      dealValue
    );

    res.json({
      status: 'success',
      usage: updated,
      persisted: false
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
