import React, { useEffect, useState } from 'react';
import { Check, Sparkles, X, ArrowRight, Calculator, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import type { SubscriptionPlan, SubscriptionTierId, ROICalculationResult } from '@voice-os/shared';
import { apiUrl } from '../config/api';
import { bestEffortAuthFetch } from '../auth/authorizedFetch';

/**
 * Pricing and ROI.
 *
 * A view over the server, not a second copy of it. Prices come from
 * GET /api/billing/plans and ROI from POST /api/billing/calculate-roi, so this page
 * cannot drift from what checkout actually charges. It used to hardcode both, and
 * its Subscribe button showed "Activated PRO tier!" without charging anyone. It now
 * sends the visitor to Stripe Checkout; a plan becomes active only when Stripe's
 * webhook confirms payment.
 */

interface SubscriptionPlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Company name for an anonymous visitor. A signed-in buyer's checkout is bound to their own workspace by the server and this is ignored. */
  clientId: string;
  onOpenEmbedModal?: () => void;
  isGlass?: boolean;
  /** Plan to ring, e.g. from a /pricing "Get started" link (/?plan=pro). */
  highlightPlanId?: SubscriptionTierId;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export const SubscriptionPlansModal: React.FC<SubscriptionPlansModalProps> = ({
  isOpen,
  onClose,
  clientId,
  onOpenEmbedModal,
  highlightPlanId
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [monthlyTraffic, setMonthlyTraffic] = useState(5000);
  const [dealValue, setDealValue] = useState(3500);
  const [voiceConversionPct, setVoiceConversionPct] = useState(4.5);
  const [closeRatePct, setCloseRatePct] = useState(20);
  const [roi, setRoi] = useState<ROICalculationResult | null>(null);

  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionTierId | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || plans) return;
    fetch(apiUrl('/api/billing/plans'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setPlans(d.plans))
      .catch(() => setPlansError('Could not load pricing. Please try again.'));
  }, [isOpen, plans]);

  // Debounced so dragging a slider does not fire a request per pixel.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetch(apiUrl('/api/billing/calculate-roi'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyTraffic,
          averageContractValueUsd: dealValue,
          voiceConversionPct,
          closeRatePct,
          planId: 'pro',
          billingCycle
        })
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setRoi(d.result))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, monthlyTraffic, dealValue, voiceConversionPct, closeRatePct, billingCycle]);

  if (!isOpen) return null;

  const startCheckout = async (planId: SubscriptionTierId) => {
    setCheckoutPlan(planId);
    setCheckoutError(null);
    try {
      const res = await bestEffortAuthFetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, planId, billingCycle })
      });
      const body = await res.json();
      if (res.ok && body.checkout?.checkoutUrl) {
        window.location.href = body.checkout.checkoutUrl;
        return;
      }
      setCheckoutError(
        body.code === 'BILLING_UNCONFIGURED'
          ? 'Checkout is not configured on this server.'
          : body.error || 'Could not start checkout.'
      );
    } catch {
      setCheckoutError('Could not reach the billing service.');
    }
    setCheckoutPlan(null);
  };

  const slider = (
    label: string,
    value: string,
    input: React.InputHTMLAttributes<HTMLInputElement>,
    accent: string
  ) => (
    <div className="p-4 rounded-2xl bg-black/30 border border-white/5">
      <div className="flex justify-between items-center text-xs font-mono mb-2">
        <span className="text-slate-300">{label}</span>
        <span className={`font-bold text-sm ${accent}`}>{value}</span>
      </div>
      <input type="range" className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400" {...input} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-3xl border border-white/10 bg-[#121217]/95 text-slate-100 shadow-[0_20px_70px_rgba(0,0,0,0.6)] p-6 sm:p-8 my-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close pricing"
          className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Plans & pricing</h2>
          <p className="text-sm text-slate-400 mt-2">
            A voice agent that answers your website around the clock and writes every qualified lead into your CRM.
          </p>

          <div className="flex items-center justify-center gap-3 mt-6">
            <span className={`text-xs font-semibold ${billingCycle === 'monthly' ? 'text-white' : 'text-slate-400'}`}>Monthly</span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
              aria-label="Toggle annual billing"
              className="relative w-14 h-7 rounded-full bg-white/10 border border-white/20 p-1"
            >
              <div
                className={`w-5 h-5 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 shadow-md transition-transform ${
                  billingCycle === 'annual' ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-xs font-semibold flex items-center gap-1.5 ${billingCycle === 'annual' ? 'text-white' : 'text-slate-400'}`}>
              Annual
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] font-mono">20% OFF</span>
            </span>
          </div>
        </div>

        {plansError && <p className="text-center text-sm text-rose-300 mb-6">{plansError}</p>}
        {checkoutError && (
          <div className="mb-6 flex items-center justify-center gap-2 text-sm text-rose-300">
            <AlertTriangle className="w-4 h-4" />
            <span>{checkoutError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
          {(plans ?? []).map((plan) => {
            const price = billingCycle === 'annual' ? plan.priceAnnualMonthlyUsd : plan.priceMonthlyUsd;
            const featured = Boolean(plan.recommended);
            const busy = checkoutPlan === plan.id;
            const highlighted = plan.id === highlightPlanId;
            return (
              <div
                key={plan.id}
                data-highlighted={highlighted ? 'true' : undefined}
                className={`relative rounded-2xl p-6 flex flex-col justify-between ${
                  featured
                    ? 'border-2 border-amber-400/60 bg-gradient-to-b from-amber-500/[0.08] to-amber-500/[0.02] md:-translate-y-2'
                    : 'border border-white/10 bg-white/[0.02]'
                } ${highlighted ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#121217]' : ''}`}
              >
                {featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-200 text-slate-950 font-extrabold text-[10px] font-mono">
                    RECOMMENDED
                  </div>
                )}
                <div>
                  <div className={`text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${featured ? 'text-amber-300' : 'text-slate-400'}`}>
                    {featured && <Sparkles className="w-3.5 h-3.5" />}
                    <span>{plan.name}</span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-white">{usd(price)}</span>
                    <span className="text-xs text-slate-400">/mo{billingCycle === 'annual' ? ', billed yearly' : ''}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 min-h-[32px]">{plan.tagline}</p>
                  <div className="my-5 border-t border-white/10" />
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => startCheckout(plan.id)}
                  disabled={checkoutPlan !== null}
                  className={`mt-6 w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                    featured
                      ? 'bg-gradient-to-r from-amber-400 to-amber-200 text-slate-950 hover:from-amber-300'
                      : 'bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10'
                  }`}
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {busy ? 'Opening checkout…' : `Choose ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 mb-10">
          <ShieldCheck className="w-3.5 h-3.5" />
          Secure checkout by Stripe. A plan activates only after payment is confirmed.
        </p>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">ROI calculator</h3>
                <p className="text-xs text-slate-400">Set your own numbers. Every figure below is derived from them.</p>
              </div>
            </div>
            {onOpenEmbedModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenEmbedModal();
                }}
                className="px-4 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-xs font-mono font-bold flex items-center gap-2"
              >
                <span>Get the embed script</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {slider('Monthly website visitors', monthlyTraffic.toLocaleString(), {
              min: 1000, max: 50000, step: 500, value: monthlyTraffic,
              onChange: (e) => setMonthlyTraffic(Number(e.target.value))
            }, 'text-amber-300')}
            {slider('Average contract value', usd(dealValue), {
              min: 500, max: 15000, step: 250, value: dealValue,
              onChange: (e) => setDealValue(Number(e.target.value))
            }, 'text-emerald-300')}
            {slider('After-hours visitors who become a qualified voice lead', `${voiceConversionPct}%`, {
              min: 0.5, max: 10, step: 0.5, value: voiceConversionPct,
              onChange: (e) => setVoiceConversionPct(Number(e.target.value))
            }, 'text-amber-300')}
            {slider('Qualified leads that close', `${closeRatePct}%`, {
              min: 1, max: 60, step: 1, value: closeRatePct,
              onChange: (e) => setCloseRatePct(Number(e.target.value))
            }, 'text-emerald-300')}
          </div>

          {roi && (
            <>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-300/5 border border-emerald-400/30 p-5 mb-4">
                <div className="text-[11px] font-mono text-emerald-300 font-semibold">Break-even</div>
                <div className="text-lg sm:text-xl font-extrabold text-white mt-1">
                  One extra closed deal every {roi.monthsPerDealToBreakEven} months pays for the Pro plan
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {usd(roi.planCostMonthlyUsd)}/mo ÷ {usd(roi.averageContractValueUsd)} contract value. This depends only on price and deal size — not on any conversion assumption.
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="text-[11px] font-mono text-slate-400">After-hours visitors</div>
                  <div className="text-xl font-extrabold text-white mt-1">{roi.afterHoursVisitors.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{roi.assumptions.afterHoursTrafficSharePct}% of traffic</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="text-[11px] font-mono text-slate-400">Extra qualified leads</div>
                  <div className="text-xl font-extrabold text-amber-300 mt-1">+{roi.incrementalLeadsMonthly}/mo</div>
                  <div className="text-[10px] text-slate-500 mt-1">beyond what a form catches</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="text-[11px] font-mono text-slate-400">Extra closed revenue</div>
                  <div className="text-xl font-extrabold text-emerald-400 mt-1">{usd(roi.incrementalRevenueUsd)}/mo</div>
                  <div className="text-[10px] text-slate-500 mt-1">{roi.incrementalClosedDealsMonthly} deals at {roi.assumptions.closeRatePct}% close</div>
                </div>
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30">
                  <div className="text-[11px] font-mono text-amber-300 font-semibold">Return on the plan</div>
                  <div className="text-2xl font-black text-white mt-1">{roi.estimatedRoiMultiple}×</div>
                  <div className="text-[10px] text-amber-200/80 mt-1">on {usd(roi.planCostMonthlyUsd)}/mo Pro</div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 mt-4">
                A model, not a measured result. The voice conversion and close rates are your assumptions; StratosGTM has not
                measured them for your business. Revenue counts closed deals only — pipeline is not revenue.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
