import React from 'react';
import type { Estimate, Progress, Run } from './types';

const button = 'rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';
const usd = (n: number) => (n < 0.01 ? 'less than $0.01' : `about $${n.toFixed(2)}`);

interface Props {
  estimate: Estimate | null;
  canRun: boolean;
  run: Run | null;
  progress: Progress | null;
  busy: boolean;
  onStart: () => void;
}

export const RunStep: React.FC<Props> = ({ estimate, canRun, run, progress, busy, onStart }) => {
  const active = run?.status === 'queued' || run?.status === 'running';
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">Run</h2>
      {estimate && (
        <p className="text-xs opacity-80">{`This run makes about ${estimate.calls} model calls, ${usd(estimate.usdUpperBound)} at most. ${estimate.note}`}</p>
      )}
      <button className={button} disabled={busy || !canRun || active} onClick={onStart}>Run buyer panel</button>
      {active && <p role="status" className="text-sm">{progress ? `${progress.completedSteps} of ${progress.totalSteps} buyers done` : 'Starting'}</p>}
      {run?.status === 'failed' && <p role="alert" className="text-sm text-red-500">{`The run failed (${run.errorCode ?? 'unknown'}).`}</p>}
      {run?.status === 'budget_exhausted' && <p className="text-sm">The call budget ran out, so this outcome is partial.</p>}
    </div>
  );
};
