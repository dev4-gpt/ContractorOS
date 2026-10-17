import Stripe from 'stripe';
import type { SubscriptionTierId } from '@voice-os/shared';

/**
 * Real Stripe Checkout.
 *
 * This replaces `simulateCheckout`, which fabricated a `cs_`-prefixed session id
 * and a checkout.omnivox.os URL, returned status 'active', and self-activated
 * the plan — a response shape indistinguishable from a real one to any caller,
 * for the one operation where "did money actually move?" matters most.
 *
 * When Stripe is not configured this reports that plainly. It never invents a
 * success.
 */

export interface CheckoutResult {
  configured: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  /** Present only when checkout could not be created, explaining why. */
  reason?: string;
}

export interface PlanPricing {
  id: SubscriptionTierId;
  name: string;
  priceMonthlyCents: number;
  priceAnnualMonthlyCents: number;
  minutesLimit: number;
}

export class StripeService {
  private client: Stripe | null = null;

  private getClient(): Stripe | null {
    if (this.client) return this.client;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    this.client = new Stripe(key);
    return this.client;
  }

  public isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  /** True while running against Stripe test keys, so the UI can say so. */
  public isTestMode(): boolean {
    return (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
  }

  /**
   * Creates a real Checkout Session in subscription mode.
   *
   * Prices are declared inline with `price_data` rather than referencing
   * pre-created Price objects, so the plan catalog stays defined in code — one
   * source of truth — instead of being split between this repo and the Stripe
   * dashboard where the two can silently drift.
   */
  public async createCheckoutSession(params: {
    tenantId: string;
    plan: PlanPricing;
    billingCycle: 'monthly' | 'annual';
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
  }): Promise<CheckoutResult> {
    const stripe = this.getClient();
    if (!stripe) {
      return {
        configured: false,
        reason: 'Stripe is not configured on this server (STRIPE_SECRET_KEY is unset).'
      };
    }

    const { plan, billingCycle } = params;
    const isAnnual = billingCycle === 'annual';
    // Annual is billed once a year at twelve times the discounted monthly rate.
    const unitAmount = isAnnual ? plan.priceAnnualMonthlyCents * 12 : plan.priceMonthlyCents;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            recurring: { interval: isAnnual ? 'year' : 'month' },
            product_data: {
              name: `StratosGTM — ${plan.name}`,
              description: `${plan.minutesLimit.toLocaleString()} voice minutes per month`
            }
          }
        }
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      // Echoed back on the webhook, which is how a completed payment is matched
      // to the tenant that started it. Without this the webhook cannot know who
      // paid.
      metadata: {
        tenantId: params.tenantId,
        planId: plan.id,
        billingCycle
      },
      subscription_data: {
        metadata: {
          tenantId: params.tenantId,
          planId: plan.id,
          billingCycle
        }
      }
    });

    if (!session.url) {
      return { configured: true, reason: 'Stripe did not return a checkout URL.' };
    }

    return { configured: true, checkoutUrl: session.url, sessionId: session.id };
  }

  /**
   * Verifies a webhook against the signing secret.
   *
   * Requires the raw request body: Express's JSON parser rewrites it and the
   * signature then never matches. Unverified webhooks must be rejected, since
   * anyone can POST a fake "payment succeeded".
   */
  public constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = this.getClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe) throw new Error('Stripe is not configured.');
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set; webhooks cannot be verified.');
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  /** Extracts the fields worth persisting from a subscription-shaped event. */
  public extractSubscriptionState(event: Stripe.Event): {
    tenantId: string | null;
    planId: string | null;
    billingCycle: string | null;
    status: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  } | null {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        tenantId: session.metadata?.tenantId ?? null,
        planId: session.metadata?.planId ?? null,
        billingCycle: session.metadata?.billingCycle ?? null,
        status: 'active',
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
        currentPeriodStart: null,
        currentPeriodEnd: null
      };
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription & {
        current_period_start?: number;
        current_period_end?: number;
      };
      return {
        tenantId: sub.metadata?.tenantId ?? null,
        planId: sub.metadata?.planId ?? null,
        billingCycle: sub.metadata?.billingCycle ?? null,
        // Mirror Stripe's own status rather than inventing a parallel lifecycle.
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
        stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : null,
        stripeSubscriptionId: sub.id,
        currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
      };
    }

    return null;
  }
}

export const stripeService = new StripeService();
