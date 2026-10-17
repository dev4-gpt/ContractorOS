import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Info, X } from 'lucide-react';
import { authorizedFetch } from '../auth/authorizedFetch';

/**
 * What a buyer sees after Stripe sends them back. A plan becomes active only when
 * Stripe's signed webhook reaches the server, which can lag the redirect by a few
 * seconds, so this reads the workspace's real plan state instead of assuming the
 * payment worked. It says "received" until the server confirms "active".
 */

type Outcome = 'success' | 'cancelled';

interface Usage {
  planId?: string;
  subscriptionStatus?: string;
  minutesLimit?: number;
}

type View =
  | { kind: 'hidden' }
  | { kind: 'cancelled' }
  | { kind: 'confirming'; plan: string }
  | { kind: 'active'; plan: string; minutes: number }
  | { kind: 'slow'; plan: string }
  | { kind: 'signed_out'; plan: string };

const POLL_MS = 2000;
const MAX_POLLS = 10;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function readCheckoutParams(search: string): { outcome: Outcome; plan: string } | null {
  const q = new URLSearchParams(search);
  const outcome = q.get('checkout');
  if (outcome !== 'success' && outcome !== 'cancelled') return null;
  return { outcome, plan: (q.get('plan') || '').toLowerCase() };
}

export const CheckoutBanner: React.FC<{ search?: string }> = ({ search: searchProp }) => {
  const [view, setView] = useState<View>({ kind: 'hidden' });
  // Read the URL once. The effect below strips the query, so re-reading it on a
  // later render would see an empty string and cancel the poll mid-flight.
  const [search] = useState(() => searchProp ?? window.location.search);

  useEffect(() => {
    const params = readCheckoutParams(search);
    if (!params) return;
    // Drop the query so a refresh does not replay the message.
    window.history.replaceState({}, '', window.location.pathname);

    if (params.outcome === 'cancelled') {
      setView({ kind: 'cancelled' });
      return;
    }

    let cancelled = false;
    setView({ kind: 'confirming', plan: params.plan });

    (async () => {
      for (let i = 0; i < MAX_POLLS && !cancelled; i++) {
        try {
          const res = await authorizedFetch('/api/billing/usage/me');
          if (res.ok) {
            const body = (await res.json()) as { usage?: Usage };
            const u = body.usage;
            if (u?.subscriptionStatus === 'active' && (!params.plan || u.planId === params.plan)) {
              if (!cancelled) setView({ kind: 'active', plan: u.planId || params.plan, minutes: u.minutesLimit ?? 0 });
              return;
            }
          }
        } catch (err: any) {
          if (err?.name === 'SignedOutError') {
            if (!cancelled) setView({ kind: 'signed_out', plan: params.plan });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (!cancelled) setView({ kind: 'slow', plan: params.plan });
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  if (view.kind === 'hidden') return null;

  const plan = 'plan' in view && view.plan ? cap(view.plan) : 'your';
  let icon = <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  let text = '';
  switch (view.kind) {
    case 'cancelled':
      icon = <Info className="h-4 w-4 text-slate-500" />;
      text = 'Checkout cancelled. You have not been charged.';
      break;
    case 'confirming':
      icon = <Loader2 className="h-4 w-4 animate-spin text-slate-500" />;
      text = 'Payment received. Confirming your plan...';
      break;
    case 'active':
      text = `Payment received. Your ${plan} plan is active${view.minutes ? `: ${view.minutes.toLocaleString('en-US')} voice minutes a month` : ''}.`;
      break;
    case 'slow':
      icon = <Info className="h-4 w-4 text-amber-600" />;
      text = `Payment received. Activating ${plan === 'your' ? 'your' : `your ${plan}`} plan is taking longer than usual. Refresh in a minute, and email us if it still is not active.`;
      break;
    case 'signed_out':
      icon = <Info className="h-4 w-4 text-amber-600" />;
      text = 'Payment received. Sign in with the account you want the plan on to see it.';
      break;
  }

  return (
    <div
      role="status"
      className="fixed left-1/2 top-20 z-[60] flex w-[min(48rem,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm"
    >
      <span className="flex items-center gap-2">
        {icon}
        {text}
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setView({ kind: 'hidden' })}
        className="text-slate-400 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
