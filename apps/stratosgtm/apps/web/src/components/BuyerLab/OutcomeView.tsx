import React from 'react';
import type { Outcome, Surface } from './types';

const chip = 'inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-slate-500/15 text-slate-600 dark:text-slate-300';
const surfaceLabel = (s: Surface) => (s === 'signed_in' ? 'signed in' : 'public');
const KIND = { objection: 'Objection', confusion: 'Confusion', delight: 'Delight' } as const;
const REASON: Record<string, string> = {
  quote_not_found: 'the quote is not in the material it was shown',
  no_quote: 'no quote given',
  unknown_source: 'it cited material it was not shown',
  surface_not_allowed: 'it cited a part of the product it was not shown',
  agent_source: 'it cited a conversation, not the product copy',
  malformed: 'unusable'
};

export const OutcomeView: React.FC<{ outcome: Outcome }> = ({ outcome }) => {
  const { verification: v, agreement } = outcome;
  const claims = (n: number) => (n === 1 ? 'claim' : 'claims');
  return (
    <section aria-label="Buyer panel outcome" className="space-y-4">
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium">{outcome.disclaimer}</p>
      {outcome.partial && (
        <p role="status" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {`${outcome.partial.missingPersonaIds.length} of ${outcome.panelSize} buyers did not finish, so this outcome is partial.`}
        </p>
      )}
      <p className="text-xs opacity-80">
        {`${v.kept} ${claims(v.kept)} kept with a verbatim quote, ${v.dropped} ${claims(v.dropped)} dropped for lacking one. ${outcome.callsUsed} model calls, ${outcome.provider} engine${outcome.model ? ` (${outcome.model})` : ''}.`}
      </p>
      {agreement.split && <p className="text-sm">{`Buyers disagree: intent runs from ${agreement.intentMin} to ${agreement.intentMax} out of 10.`}</p>}

      {outcome.personas.map((p) => (
        <article key={p.personaId} className="rounded-lg border border-slate-500/30 p-3 space-y-2">
          <header className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{p.name}</h3>
            <span className={chip}>{p.archetype.replace(/_/g, ' ')}</span>
            <span className="text-sm">{`Intent ${p.intent.score}/10`}</span>
            <span className="text-xs opacity-70">{p.sentiment}</span>
          </header>
          <p className="text-sm">{p.intent.rationale}</p>
          <ul className="space-y-2">
            {p.claims.map((c) => (
              <li key={c.id} className="rounded border border-slate-500/20 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={chip}>{KIND[c.kind]}</span>
                  {c.severity && <span className={chip}>{c.severity}</span>}
                  <span className={chip}>{surfaceLabel(c.surface)}</span>
                </div>
                <p className="mt-1 text-sm">{c.text}</p>
                <blockquote className="mt-1 border-l-2 border-slate-500/40 pl-2 text-xs italic">{c.quote}</blockquote>
              </li>
            ))}
          </ul>
          {p.dropped.length > 0 && (
            <p className="text-xs opacity-70">{`Not shown: ${p.dropped.map((d) => `\u201c${d.text}\u201d (${REASON[d.reason] ?? d.reason})`).join('; ')}`}</p>
          )}
        </article>
      ))}

      <details className="text-xs">
        <summary className="cursor-pointer">What the buyers were shown</summary>
        <ul className="mt-1 space-y-0.5">
          {outcome.coverage.sources.map((s) => (
            <li key={s.id}>{`${s.label} (${surfaceLabel(s.surface)}, ${s.words} words)`}</li>
          ))}
        </ul>
      </details>
    </section>
  );
};
