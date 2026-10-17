import React from 'react';
import type { Outcome, Report, ReportFinding, ReportRecommendation } from './types';

const button = 'rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';

function quotesFor(claimIds: string[], outcome: Outcome): string[] {
  const claims = outcome.personas.flatMap((p) => [...p.claims, ...p.conversation]);
  return claimIds.map((id) => claims.find((c) => c.id === id)?.quote).filter((q): q is string => !!q);
}

interface Props {
  report: Report | null;
  outcome: Outcome;
  busy: boolean;
  onGenerate: () => void;
}

export const ReportView: React.FC<Props> = ({ report, outcome, busy, onGenerate }) => (
  <section className="space-y-3">
    <div className="flex items-center gap-2">
      <h2 className="text-base font-semibold">Report</h2>
      {!report && <button className={button} disabled={busy} onClick={onGenerate}>Generate report</button>}
    </div>
    {report && (
      <div className="space-y-3">
        <p className="text-sm font-medium">{report.headline}</p>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide opacity-70">Findings</h3>
          <ul className="mt-1 space-y-2">
            {report.findings.map((f: ReportFinding, i: number) => (
              <li key={i} className="rounded border border-slate-500/20 p-2">
                <p className="text-sm">{f.text}</p>
                {quotesFor(f.claimIds, outcome).map((q, j) => <blockquote key={j} className="mt-1 border-l-2 border-slate-500/40 pl-2 text-xs italic">{q}</blockquote>)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide opacity-70">Recommendations</h3>
          <ul className="mt-1 space-y-2">
            {report.recommendations.map((r: ReportRecommendation, i: number) => (
              <li key={i} className="rounded border border-slate-500/20 p-2">
                <p className="text-sm">{r.text}</p>
                {r.rewrite && <p className="mt-1 rounded bg-slate-500/10 p-2 text-xs">{r.rewrite}</p>}
                {quotesFor(r.claimIds, outcome).map((q, j) => <blockquote key={j} className="mt-1 border-l-2 border-slate-500/40 pl-2 text-xs italic">{q}</blockquote>)}
              </li>
            ))}
          </ul>
        </div>
        {report.conversationAttempted === false && (
          <p className="text-xs opacity-70">Stage 4 (buyer-to-agent conversation) was not run for this project, so nothing here comes from a live conversation.</p>
        )}
        <p className="text-xs opacity-70">{report.disclaimer}</p>
      </div>
    )}
  </section>
);
