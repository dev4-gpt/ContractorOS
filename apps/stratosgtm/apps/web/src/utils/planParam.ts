import type { SubscriptionTierId } from '@voice-os/shared';

const TIERS: readonly SubscriptionTierId[] = ['starter', 'pro', 'enterprise'];

/** Reads ?plan=<tier> from a location.search string; the /pricing page links here. */
export function parsePlanParam(search: string): SubscriptionTierId | null {
  const value = new URLSearchParams(search).get('plan');
  return TIERS.includes(value as SubscriptionTierId) ? (value as SubscriptionTierId) : null;
}
