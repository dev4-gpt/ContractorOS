import React from 'react';
import type { Outcome } from './types';

const button = 'rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';

interface Props {
  outcome: Outcome;
  previous: Outcome | null;
  busy: boolean;
  onRetest: () => void;
}

export const RetestView: React.FC<Props> = ({ outcome, previous, busy, onRetest }) => (
  <section className="space-y-2">
    <div className="flex items-center gap-2">
      <h2 className="text-base font-semibold">Re-test</h2>
      <button className={button} disabled={busy} onClick={onRetest}>Re-test</button>
    </div>
    <p className="text-xs opacity-70">Simulated buyers, not measured customers — a higher intent here is still a hypothesis, not a result.</p>
    {previous && (
      <ul className="space-y-1 text-sm">
        {outcome.personas.map((p) => {
          const before = previous.personas.find((x) => x.personaId === p.personaId);
          const delta = before ? p.intent.score - before.intent.score : null;
          return (
            <li key={p.personaId}>
              {p.name}: {before?.intent.score ?? '—'} → {p.intent.score}
              {delta !== null && <span className="ml-1">({delta >= 0 ? `+${delta}` : delta})</span>}
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
