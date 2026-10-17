import catalog from '@voice-os/shared/plans.json';
import type { SubscriptionPlan } from '@voice-os/shared';

/** Same catalog the orchestrator charges from; see packages/shared/plans.json. */
export const PLANS = catalog.plans as SubscriptionPlan[];
export const COST_PER_VOICE_MINUTE_USD: number = catalog.costPerVoiceMinuteUsd;

export const SITE_URL = 'https://stratosgtm.vercel.app';

export const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
export const perMinute = (n: number) => `$${n.toFixed(2)}/min`;
