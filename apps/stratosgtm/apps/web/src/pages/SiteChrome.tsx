import React from 'react';

export interface FaqItem {
  question: string;
  answer: string;
}

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

export const SiteHeader: React.FC = () => (
  <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
    <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <a
        href="/"
        className={`cursor-pointer rounded font-bold tracking-tight text-slate-900 transition-colors duration-200 ${focusRing}`}
      >
        StratosGTM
      </a>
      <div className="flex items-center gap-5 text-sm">
        <a
          href="/"
          className={`cursor-pointer rounded text-slate-600 transition-colors duration-200 hover:text-slate-900 ${focusRing}`}
        >
          Product
        </a>
        <a
          href="/pricing"
          className={`cursor-pointer rounded text-slate-600 transition-colors duration-200 hover:text-slate-900 ${focusRing}`}
        >
          Pricing
        </a>
        <a
          href="/console"
          className={`cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white transition-colors duration-200 hover:bg-blue-700 ${focusRing}`}
        >
          Try the live demo
        </a>
      </div>
    </nav>
  </header>
);

export const SiteFooter: React.FC = () => (
  <footer className="mt-24 border-t border-slate-200">
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>StratosGTM — built on the AssemblyAI Voice Agent API. MIT licensed.</p>
      <nav aria-label="Footer" className="flex flex-wrap gap-5">
        <a
          href="/"
          className={`cursor-pointer rounded transition-colors duration-200 hover:text-slate-900 ${focusRing}`}
        >
          Product
        </a>
        <a
          href="/pricing"
          className={`cursor-pointer rounded transition-colors duration-200 hover:text-slate-900 ${focusRing}`}
        >
          Pricing
        </a>
        <a
          href="/widget-preview"
          className={`cursor-pointer rounded transition-colors duration-200 hover:text-slate-900 ${focusRing}`}
        >
          Widget demo
        </a>
        <a
          href="https://github.com/dev4-gpt/VoiceAI"
          className={`cursor-pointer rounded transition-colors duration-200 hover:text-slate-900 ${focusRing}`}
        >
          Source code
        </a>
        <a
          href="/privacy.html"
          className={`cursor-pointer rounded transition-colors duration-200 hover:text-slate-900 ${focusRing}`}
        >
          Privacy
        </a>
        <a
          href="/terms.html"
          className={`cursor-pointer rounded transition-colors duration-200 hover:text-slate-900 ${focusRing}`}
        >
          Terms
        </a>
      </nav>
    </div>
  </footer>
);

export const FaqList: React.FC<{ items: FaqItem[] }> = ({ items }) => (
  <div className="mt-8 space-y-4">
    {items.map((item) => (
      <div
        key={item.question}
        data-reveal="card"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h3 className="text-base font-semibold text-slate-900">{item.question}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.answer}</p>
      </div>
    ))}
  </div>
);
