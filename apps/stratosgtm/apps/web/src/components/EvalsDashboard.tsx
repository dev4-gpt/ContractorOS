import React, { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '../config/api';
import { ownerRequestError } from '../utils/ownerRequestError';
import { ShieldCheck, Play, ChevronDown, ChevronUp, Clock, Activity, FlaskConical, Cpu } from 'lucide-react';

interface Verdict { graderName: string; passed: boolean; reason: string; gating: boolean; skipped?: boolean }
interface Trial {
  taskId: string;
  trial: number;
  status: 'pass' | 'fail' | 'error';
  verdicts: Verdict[];
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown>; failed: boolean }>;
  replies: string[];
  userTurns: string[];
  latencyMs: number;
  error?: string;
}
interface TaskResult {
  taskId: string;
  name: string;
  passes: number;
  fails: number;
  errors: number;
  n: number;
  passRate: number | null;
  wilson95: { low: number; high: number } | null;
  trials: Trial[];
}
export interface EvalRun {
  suite: string;
  mode: 'measured' | 'offline';
  model: string | null;
  toolSelectionModel: string | null;
  note: string;
  k: number;
  totalTasks: number;
  tasks: TaskResult[];
  suitePassPowerK: number | null;
  passPowerKDefinition: string;
  totalTrials: number;
  erroredTrials: number;
  truncated?: boolean;
  finishedAt: string;
}
type ReportResponse =
  | { mode: 'no_data'; reason?: string }
  | { mode: 'measured' | 'offline'; run: EvalRun; recordedAt?: string; source?: string };

interface LatencyDist { p50: number; p95: number; sampleSize: number }
type TelemetrySummary =
  | { status: 'insufficient_data'; sampleSize: number; requiredSampleSize: number }
  | { status: 'success'; sampleSize: number; responseLatencyMs: LatencyDist };

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export const pct = (x: number | null | undefined): string => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(0)}%`);

/** What a voice latency tile shows. Never a number unless the server says it is measured. */
export function latencyTile(t: TelemetrySummary | null): { value: string; detail: string } {
  if (!t) return { value: '—', detail: 'telemetry unavailable' };
  if (t.status !== 'success') return { value: '—', detail: `insufficient data: ${t.sampleSize} of ${t.requiredSampleSize} measured turns needed` };
  return { value: `${Math.round(t.responseLatencyMs.p50)}ms p50 / ${Math.round(t.responseLatencyMs.p95)}ms p95`, detail: `${t.sampleSize} measured turns` };
}

interface Props {
  theme?: 'glass' | 'cyber';
  fetcher?: Fetcher;
}

const defaultFetcher: Fetcher = (path, init) => fetch(apiUrl(path), init);

export const EvalsDashboard: React.FC<Props> = ({ theme = 'glass', fetcher = defaultFetcher }) => {
  const isGlass = theme === 'glass';
  const [state, setState] = useState<'loading' | 'ready' | 'running'>('loading');
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetcher('/api/evals/report');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport((await res.json()) as ReportResponse);
      setError(null);
    } catch (e: any) {
      setReport(null);
      setError(`Could not load the eval report (${e?.message || 'network error'}).`);
    }
    try {
      const res = await fetcher('/api/telemetry/summary');
      setTelemetry(res.ok ? ((await res.json()) as TelemetrySummary) : null);
    } catch {
      setTelemetry(null);
    }
    setState('ready');
  }, [fetcher]);

  useEffect(() => { void load(); }, [load]);

  const run = async (mode: 'offline' | 'measured') => {
    setState('running');
    setError(null);
    try {
      const res = await fetcher('/api/evals/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.code === 'EVAL_NO_MODEL' ? body.error : body?.error || ownerRequestError(res.status, body));
        setState('ready');
        return;
      }
      setReport({ mode: body.run.mode, run: body.run, source: 'server' });
      if (body.persisted === false) setError('The run finished but was not stored (no datastore); it will disappear on reload.');
    } catch (e: any) {
      setError(`Run failed (${e?.message || 'network error'}).`);
    }
    setState('ready');
  };

  const card = isGlass ? 'bg-[#fdfcf9] border-[#e8e4dc] text-slate-800' : 'bg-slate-950/80 border-slate-800 text-slate-200';
  const muted = isGlass ? 'text-slate-500' : 'text-slate-400';
  const btn = 'flex items-center space-x-2 px-3 py-2 rounded-xl font-semibold text-xs border transition-all disabled:opacity-50';
  const run_ = report && report.mode !== 'no_data' ? report.run : null;
  const lat = latencyTile(telemetry);
  const busy = state === 'running';

  return (
    <div className={`flex flex-col h-full rounded-2xl border backdrop-blur-xl p-5 shadow-2xl space-y-5 relative overflow-hidden ${
      isGlass ? 'bg-[#fdfcf9]/80 border-[#e8e4dc]/90 text-slate-800' : 'bg-slate-900/60 border-slate-800/80 text-slate-100'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 border-slate-500/20">
        <div className="flex items-center space-x-2.5">
          <ShieldCheck className="w-5 h-5 text-purple-600" />
          <div>
            <h3 className="text-base font-semibold">Agent evals</h3>
            <p className={`text-xs ${muted}`}>Deterministic graders over real tool calls. Reports passes out of trials with a 95% interval.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => run('offline')} disabled={busy} className={`${btn} ${card}`}>
            <FlaskConical className="w-4 h-4" /><span>Run offline check</span>
          </button>
          <button onClick={() => run('measured')} disabled={busy} className={`${btn} bg-purple-600 text-white border-purple-600`}>
            <Play className="w-4 h-4" /><span>Run measured (1 trial per task)</span>
          </button>
        </div>
      </div>

      {busy && (
        <div role="status" className={`rounded-xl border px-3 py-2 text-xs font-mono flex items-center space-x-2 ${card}`}>
          <Cpu className="w-4 h-4 animate-spin" /><span>Running the suite. A measured run makes live model calls and can take up to 45 seconds.</span>
        </div>
      )}
      {error && <div role="alert" className="rounded-xl border px-3 py-2 text-xs font-mono bg-red-50 border-red-300 text-red-900">{error}</div>}

      {state === 'loading' && <div className={`text-sm font-mono ${muted}`}>Loading eval report…</div>}

      {state !== 'loading' && !run_ && (
        <div className={`rounded-xl border p-5 space-y-2 text-sm ${card}`}>
          <div className="font-semibold">No eval run has been recorded.</div>
          <p className={`text-xs ${muted}`}>Nothing is shown here until a real run exists. To produce one:</p>
          <pre className="text-[11px] font-mono whitespace-pre-wrap">{`# harness check, no API key, seconds (labelled OFFLINE, not a model measurement)
npm run eval:offline --workspace packages/evals -- --post https://<your-host>

# measured against DeepSeek (needs DEEPSEEK_API_KEY)
npm run eval --workspace packages/evals -- --k 3 --post https://<your-host>`}</pre>
          <p className={`text-xs ${muted}`}>Or use the buttons above. Posting from the CLI needs ORCHESTRATOR_API_KEY.</p>
        </div>
      )}

      {run_ && (
        <>
          <div role="status" className={`rounded-xl border px-3 py-2 text-[11px] font-mono leading-relaxed ${
            run_.mode === 'offline' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-sky-50 border-sky-300 text-sky-900'
          }`}>
            <span className="font-bold">{run_.mode === 'offline' ? 'OFFLINE — NOT A MODEL MEASUREMENT.' : `MEASURED — ${run_.model ?? 'model unknown'} (text-mode proxy).`}</span>{' '}
            {run_.note}
            {run_.truncated ? ' The run hit its time budget, so some trials were not started.' : ''}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className={`p-3.5 rounded-xl border ${card}`}>
              <div className={`text-xs font-mono ${muted}`}>Suite pass^{run_.k}</div>
              <div className="text-2xl font-bold font-mono mt-1">{pct(run_.suitePassPowerK)}</div>
              <div className={`text-[11px] ${muted}`}>Every task passing all {run_.k} tries. Point estimate.</div>
            </div>
            <div className={`p-3.5 rounded-xl border ${card}`}>
              <div className={`text-xs font-mono ${muted}`}>Trials</div>
              <div className="text-2xl font-bold font-mono mt-1">{run_.totalTrials}</div>
              <div className={`text-[11px] ${muted}`}>{run_.totalTasks} tasks · {run_.erroredTrials} errored (unscored)</div>
            </div>
            <div className={`p-3.5 rounded-xl border ${card}`}>
              <div className={`text-xs font-mono flex items-center space-x-1.5 ${muted}`}><Clock className="w-3.5 h-3.5" /><span>Voice response latency</span></div>
              <div className="text-lg font-bold font-mono mt-1" data-testid="latency-response">{lat.value}</div>
              <div className={`text-[11px] ${muted}`}>{lat.detail}</div>
            </div>
            <div className={`p-3.5 rounded-xl border ${card}`}>
              <div className={`text-xs font-mono flex items-center space-x-1.5 ${muted}`}><Activity className="w-3.5 h-3.5" /><span>Voice telemetry sample</span></div>
              <div className="text-lg font-bold font-mono mt-1" data-testid="latency-sample">{telemetry ? telemetry.sampleSize : '—'}</div>
              <div className={`text-[11px] ${muted}`}>from /api/telemetry/summary</div>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {run_.tasks.map((t) => {
              const isOpen = open === t.taskId;
              return (
                <div key={t.taskId} className={`rounded-xl border overflow-hidden ${card}`}>
                  <button className="w-full p-3.5 flex items-center justify-between text-left" onClick={() => setOpen(isOpen ? null : t.taskId)} aria-expanded={isOpen}>
                    <div>
                      <div className="font-semibold text-xs">{t.name}</div>
                      <div className={`text-[10px] font-mono ${muted}`}>{t.taskId}{t.errors ? ` · ${t.errors} errored` : ''}</div>
                    </div>
                    <div className="flex items-center space-x-3 font-mono text-xs">
                      <span>{t.passes}/{t.n} passed</span>
                      <span className={muted}>{t.wilson95 ? `95% CI ${pct(t.wilson95.low)}–${pct(t.wilson95.high)}` : 'no scored trials'}</span>
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-500/20 p-4 space-y-3">
                      {t.trials.map((tr) => (
                        <div key={tr.trial} className="text-[11px] font-mono space-y-1">
                          <div className="font-bold">Trial {tr.trial}: {tr.status.toUpperCase()} <span className={`font-normal ${muted}`}>({tr.latencyMs}ms)</span></div>
                          {tr.error && <div>Error: {tr.error}</div>}
                          {tr.userTurns.map((u, i) => (
                            <div key={i}><span className={muted}>User:</span> {u}<br /><span className={muted}>Agent:</span> {tr.replies[i] ?? '(no reply)'}</div>
                          ))}
                          <div><span className={muted}>Tools:</span> {tr.toolCalls.length ? tr.toolCalls.map((c) => `${c.name}${c.failed ? ' (failed)' : ''}`).join(', ') : 'none'}</div>
                          <ul>
                            {tr.verdicts.map((v, i) => (
                              <li key={i}>{v.skipped ? 'SKIP' : v.passed ? 'PASS' : 'FAIL'}{v.gating ? '' : ' (non-gating)'} {v.graderName}: {v.reason}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
