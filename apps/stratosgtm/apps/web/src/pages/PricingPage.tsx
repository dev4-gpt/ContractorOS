import React, { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { PLANS, COST_PER_VOICE_MINUTE_USD, usd, perMinute } from './plans';
import { SiteHeader, SiteFooter, FaqList, focusRing, type FaqItem } from './SiteChrome';
import { useRevealMotion } from './motion';

type Cycle = 'monthly' | 'annual';

const recommended = PLANS.find((p) => p.recommended) ?? PLANS[0];
const annualSavingPct = Math.round((1 - recommended.priceAnnualMonthlyUsd / recommended.priceMonthlyUsd) * 100);
const lowestMonthly = Math.min(...PLANS.map((p) => p.priceMonthlyUsd));

export const PRICING_FAQ: FaqItem[] = [
  {
    question: 'What happens if I use more voice minutes than my plan includes?',
    answer: `Calls keep working. Minutes beyond your plan's allowance are billed at its overage rate: ${PLANS.map(
      (p) => `${perMinute(p.overageRatePerMinUsd)} on ${p.name}`
    ).join(', ')}. Every overage rate is above the ${perMinute(COST_PER_VOICE_MINUTE_USD)} the voice API costs, so extra minutes never sell below cost.`
  },
  {
    question: 'How much does annual billing save?',
    answer: `Paying yearly lowers the monthly rate by about ${annualSavingPct}%: ${PLANS.map(
      (p) => `${p.name} is ${usd(p.priceAnnualMonthlyUsd)} a month instead of ${usd(p.priceMonthlyUsd)}`
    ).join('; ')}.`
  },
  {
    question: 'Can I pay for a plan today?',
    answer:
      'Checkout runs on Stripe in test mode during the hackathon release, so no real card is charged. You can try the full flow with the test card 4242 4242 4242 4242. A plan only activates after Stripe confirms payment through a signature-verified webhook.'
  }
];

export const PricingPage: React.FC = () => {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const rootRef = useRef<HTMLDivElement>(null);
  useRevealMotion(rootRef);

  return (
    <div ref={rootRef} className="min-h-screen bg-slate-50 text-slate-800">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <section className="mx-auto max-w-2xl text-center">
          <h1 data-reveal="text" className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Pricing
          </h1>
          <p data-reveal="text" className="mt-4 text-lg text-slate-600">
            Plans start at {usd(lowestMonthly)} a month for a voice agent that answers your website around the clock and
            writes every qualified lead into your CRM.
          </p>
          <div
            role="group"
            aria-label="Billing cycle"
            className="mt-8 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
          >
            {(['monthly', 'annual'] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ${focusRing} ${
                  cycle === c ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {c === 'monthly' ? 'Monthly' : `Annual (save ${annualSavingPct}%)`}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Plans" className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const primary = cycle === 'annual' ? plan.priceAnnualMonthlyUsd : plan.priceMonthlyUsd;
            const secondary =
              cycle === 'annual'
                ? `or ${usd(plan.priceMonthlyUsd)}/month billed monthly`
                : `or ${usd(plan.priceAnnualMonthlyUsd)}/month billed annually`;
            return (
              <article
                key={plan.id}
                data-reveal="card"
                className={`flex flex-col rounded-2xl p-6 ${
                  plan.recommended
                    ? 'border-2 border-orange-600/60 bg-white shadow-sm'
                    : 'border border-slate-200 bg-white shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                  {plan.recommended && (
                    <span className="rounded-full bg-orange-600 px-2 py-0.5 align-middle text-[10px] font-extrabold text-slate-950">
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600">{plan.tagline}</p>
                <p className="mt-5">
                  <span className="text-4xl font-extrabold text-slate-900">{usd(primary)}</span>
                  <span className="text-sm text-slate-600">/month</span>
                </p>
                <p className="text-xs text-slate-600">{secondary}</p>
                <p className="mt-4 text-sm text-slate-600">
                  {`${plan.voiceMinutesMonthly.toLocaleString('en-US')} voice minutes included, then ${perMinute(plan.overageRatePerMinUsd)}`}
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={`/console?plan=${plan.id}`}
                  className={`mt-6 block cursor-pointer rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-colors duration-200 ${focusRing} ${
                    plan.recommended
                      ? 'bg-orange-600 text-slate-950 hover:bg-orange-500'
                      : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {`Get started with ${plan.name}`}
                </a>
              </article>
            );
          })}
        </section>

        <section className="mx-auto mt-20 max-w-3xl">
          <h2 data-reveal="text" className="text-2xl font-bold text-slate-900">
            Pricing questions
          </h2>
          <FaqList items={PRICING_FAQ} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};
