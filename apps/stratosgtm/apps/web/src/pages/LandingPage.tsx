import React, { useRef } from 'react';
import { PLANS, usd, perMinute } from './plans';
import { SiteHeader, SiteFooter, FaqList, focusRing, type FaqItem } from './SiteChrome';
import { useRevealMotion } from './motion';

export const LANDING_H1 = 'A voice agent that qualifies your website visitors';

/** The 13 US all-party-consent states the compliance layer asks permission in (README, "US compliance layer"). */
export const CONSENT_STATES = ['CA', 'CT', 'DE', 'FL', 'IL', 'MD', 'MA', 'MI', 'MT', 'NV', 'NH', 'PA', 'WA'];

const cheapest = PLANS.reduce((a, b) => (b.priceMonthlyUsd < a.priceMonthlyUsd ? b : a));
const recommended = PLANS.find((p) => p.recommended) ?? PLANS[0];
const annualSavingPct = Math.round((1 - recommended.priceAnnualMonthlyUsd / recommended.priceMonthlyUsd) * 100);

export const PRODUCT_FAQ: FaqItem[] = [
  {
    question: 'What is StratosGTM?',
    answer:
      'StratosGTM is a browser voice agent for B2B websites. A visitor clicks, speaks, and is answered in real time, with no phone number and no download. While it talks, the agent calls tools that create the lead, record budget, authority, need and timeline, and capture a consultation request in a Postgres-backed CRM, so the lead exists before the call ends. It runs on the AssemblyAI Voice Agent API and embeds on any site with one script tag.'
  },
  {
    question: 'Is it legal to have an AI voice agent talk to my website visitors?',
    answer: `Two US rules matter most. Some states require telling people they are talking to an AI, so StratosGTM adds that disclosure to the start of every greeting on the server, where a client cannot skip it. ${CONSENT_STATES.length} states require every party to consent before a conversation is recorded, and real-time transcription can count as recording. In those states, and whenever the visitor's location is unknown, the agent asks permission before it listens and stores a record of that consent. This is an engineering implementation of published statutes, not legal advice; have counsel review the disclosure wording before using it with customers.`
  },
  {
    question: 'How do I add the voice agent to my website?',
    answer:
      'Paste one script tag into your site: the embed.js snippet with your company name. It adds a "Talk to Anna" button. When a visitor clicks it, the browser asks for microphone access, fetches a short-lived token from the StratosGTM server, and streams audio directly to AssemblyAI. Your API key never reaches the browser, and you can restrict which domains are allowed to load the widget.'
  },
  {
    question: 'How much does StratosGTM cost?',
    answer: `Plans start at ${usd(cheapest.priceMonthlyUsd)} a month. ${PLANS.map(
      (p) => `${p.name} is ${usd(p.priceMonthlyUsd)} a month with ${p.voiceMinutesMonthly.toLocaleString('en-US')} voice minutes, then ${perMinute(p.overageRatePerMinUsd)}`
    ).join('. ')}. Paying annually lowers each rate by about ${annualSavingPct}%. Full details are on the pricing page.`
  },
  {
    question: 'What data does StratosGTM store?',
    answer:
      'For each conversation it stores the lead the agent creates, including company, what the visitor is looking for, and their budget, authority, need and timeline answers, plus consent records showing the region, the rule applied, the disclosure text and timestamps. Audio goes straight from the visitor’s browser to AssemblyAI and never passes through StratosGTM servers. Third-party credentials you connect are encrypted with AES-256-GCM before they are stored.'
  }
];

const PILLARS = [
  {
    title: 'Answers in voice, in the browser',
    body: 'A visitor clicks, speaks, and is heard. There is no phone number to dial and nothing to download.'
  },
  {
    title: 'Takes real actions mid-conversation',
    body: 'The agent calls tools while it talks: it creates the lead, records budget, authority, need and timeline, and captures a consultation request. Each result lands in the CRM while the call is still going.'
  },
  {
    title: 'Handles US disclosure and consent first',
    body: 'It tells the visitor they are talking to an AI before anything else, and in all-party-consent states it asks permission before transcribing, then keeps an audit record of that consent.'
  }
];

const STEPS = [
  {
    title: 'A short-lived token is issued',
    body: 'The StratosGTM server requests a temporary AssemblyAI token. The API key never reaches the browser.'
  },
  {
    title: 'Audio streams straight to AssemblyAI',
    body: 'The browser captures 24 kHz mono audio and streams it over a WebSocket to the AssemblyAI Voice Agent API.'
  },
  {
    title: 'The agent calls tools as it talks',
    body: 'Seven tools are registered with the agent, including create_or_update_lead, qualify_lead and schedule_growth_consultation. Each call runs on the server.'
  },
  {
    title: 'Results return mid-conversation',
    body: 'The tool result goes back to the agent so it keeps talking with real data, and the lead appears in the CRM before the call ends.'
  }
];

const REAL_TODAY = [
  'Browser voice calls on the AssemblyAI Voice Agent API',
  'Tool calls that create and qualify CRM leads',
  'Embeddable widget running real voice sessions',
  'AI disclosure and consent gating, with persisted records',
  'Postgres persistence and encrypted credentials',
  'Stripe Checkout with webhook-driven activation (test mode)'
];

const NOT_YET = [
  'Multi-tenant login and accounts',
  'Usage metering from live calls',
  'Calendar integration (bookings are recorded on the lead)',
  'Measured latency (no latency figures are claimed)',
  'Embedding-based retrieval (knowledge lookup is keyword-based)'
];

export const LandingPage: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  useRevealMotion(rootRef);

  return (
    <div ref={rootRef} className="min-h-screen bg-slate-50 text-slate-800">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6">
        <section className="mx-auto max-w-3xl py-20 text-center">
          <h1 data-reveal="text" className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {LANDING_H1}
          </h1>
          <p data-reveal="text" className="mt-6 text-lg leading-relaxed text-slate-600">
            StratosGTM answers your website around the clock, qualifies the visitor out loud, and writes the lead into
            your CRM while the call is still going, with US AI-disclosure and recording-consent rules built in.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="/console"
              className={`cursor-pointer rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition-colors duration-200 hover:bg-blue-700 ${focusRing}`}
            >
              Try the live demo
            </a>
            <a
              href="/pricing"
              className={`cursor-pointer rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-900 transition-colors duration-200 hover:bg-slate-100 ${focusRing}`}
            >
              See pricing
            </a>
          </div>
        </section>

        <section aria-labelledby="what-it-does" className="py-12">
          <h2 data-reveal="text" id="what-it-does" className="text-2xl font-bold text-slate-900">What it does</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.title} data-reveal="card" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="py-12">
          <h2 data-reveal="text" id="how-it-works" className="text-2xl font-bold text-slate-900">How it works</h2>
          <ol className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.title} data-reveal="card" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="font-mono text-xs text-blue-600">{`Step ${i + 1}`}</p>
                <h3 className="mt-1 font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="compliance" className="py-12">
          <h2 data-reveal="text" id="compliance" className="text-2xl font-bold text-slate-900">US compliance layer</h2>
          <p className="mt-4 max-w-3xl leading-relaxed text-slate-600">
            The AI disclosure is added to the greeting on the server, so no session can start without it. In the
            all-party-consent states below, the agent asks for explicit opt-in before transcribing. When the visitor’s
            location is unknown, the strictest policy applies. Consent records are append-only and saved before the call
            starts. This is an engineering implementation of published statutes, not legal advice.
          </p>
          <ul aria-label="All-party-consent states" className="mt-6 flex flex-wrap gap-2">
            {CONSENT_STATES.map((code) => (
              <li
                key={code}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-700"
              >
                {code}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="real-today" className="py-12">
          <h2 data-reveal="text" id="real-today" className="text-2xl font-bold text-slate-900">What is real today</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div data-reveal="card" className="rounded-2xl border border-emerald-600/30 bg-emerald-50 p-6">
              <h3 className="font-semibold text-emerald-800">Working now</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {REAL_TODAY.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div data-reveal="card" className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-semibold text-slate-900">Not built yet</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {NOT_YET.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq" className="py-12">
          <h2 data-reveal="text" id="faq" className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
          <FaqList items={PRODUCT_FAQ} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};
