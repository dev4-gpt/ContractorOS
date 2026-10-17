import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EvalsDashboard, latencyTile, pct } from './EvalsDashboard';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const run = (mode: 'offline' | 'measured') => ({
  suite: 's', mode, model: mode === 'measured' ? 'deepseek-flash' : null, toolSelectionModel: null,
  note: mode === 'offline' ? 'OFFLINE: a scripted stub replayed fixtures.' : 'MEASURED text-mode proxy.',
  k: 2, totalTasks: 1, suitePassPowerK: 0.25, passPowerKDefinition: 'def', totalTrials: 2, erroredTrials: 0, finishedAt: '2026-09-18T00:00:00Z',
  tasks: [{
    taskId: 'booking', name: 'Book a consultation', passes: 1, fails: 1, errors: 0, n: 2, passRate: 0.5, wilson95: { low: 0.095, high: 0.905 },
    trials: [{ taskId: 'booking', trial: 1, status: 'fail', latencyMs: 12, userTurns: ['book me'], replies: ['Booked.'], toolCalls: [], verdicts: [{ graderName: 'tool_succeeded:schedule_growth_consultation', passed: false, reason: 'never called', gating: true }] }]
  }]
});

const routes = (over: Record<string, () => Response> = {}) =>
  vi.fn(async (path: string, _init?: RequestInit) => {
    if (over[path]) return over[path]();
    if (path === '/api/evals/report') return json({ mode: 'no_data', reason: 'no_runs' });
    if (path === '/api/telemetry/summary') return json({ status: 'insufficient_data', sampleSize: 3, requiredSampleSize: 20 });
    return json({}, 404);
  });

describe('EvalsDashboard', () => {
  it('no_data: shows how to run the suite and NO numbers, no demo data', async () => {
    render(<EvalsDashboard fetcher={routes()} />);
    await waitFor(() => expect(screen.getByText('No eval run has been recorded.')).toBeInTheDocument());
    expect(screen.getByText(/npm run eval:offline/)).toBeInTheDocument();
    expect(screen.queryByText(/STATIC DEMO/i)).toBeNull();
    expect(screen.queryByText('88.4%')).toBeNull();
    expect(screen.queryByText(/pass@/)).toBeNull();
  });

  it('renders server data for a measured run: passes/n and the interval, not invented rates', async () => {
    render(<EvalsDashboard fetcher={routes({ '/api/evals/report': () => json({ mode: 'measured', run: run('measured') }) })} />);
    await waitFor(() => expect(screen.getByText('Book a consultation')).toBeInTheDocument());
    expect(screen.getByText('1/2 passed')).toBeInTheDocument();
    expect(screen.getByText(/95% CI 10%–91%/)).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText(/MEASURED — deepseek-flash/)).toBeInTheDocument();
    expect(screen.getAllByText(/text-mode proxy/i).length).toBeGreaterThan(0);
  });

  it('labels an offline run as NOT a model measurement', async () => {
    render(<EvalsDashboard fetcher={routes({ '/api/evals/report': () => json({ mode: 'offline', run: run('offline') }) })} />);
    await waitFor(() => expect(screen.getByText(/OFFLINE — NOT A MODEL MEASUREMENT/)).toBeInTheDocument());
  });

  it('voice latency tile shows — with the sample size when telemetry is insufficient', async () => {
    render(<EvalsDashboard fetcher={routes({ '/api/evals/report': () => json({ mode: 'offline', run: run('offline') }) })} />);
    await waitFor(() => expect(screen.getByTestId('latency-response').textContent).toBe('—'));
    expect(screen.getByText(/3 of 20 measured turns needed/)).toBeInTheDocument();
  });

  it('shows the running state, then renders the run the server returned', async () => {
    let release: (r: Response) => void = () => {};
    const fetcher = routes({
      '/api/evals/run': () => { throw new Error('unused'); }
    });
    const gated = vi.fn(async (path: string, init?: RequestInit) =>
      path === '/api/evals/run' ? new Promise<Response>((r) => { release = r; }) : fetcher(path, init)
    );
    render(<EvalsDashboard fetcher={gated} />);
    fireEvent.click(await screen.findByRole('button', { name: /Run offline check/ }));
    await waitFor(() => expect(screen.getByText(/Running the suite/)).toBeInTheDocument());
    release(json({ mode: 'offline', persisted: true, run: run('offline') }));
    await waitFor(() => expect(screen.getByText('Book a consultation')).toBeInTheDocument());
    expect(screen.queryByText(/Running the suite/)).toBeNull();
  });

  it('surfaces a refusal (no model key) instead of inventing a report', async () => {
    const fetcher = routes({ '/api/evals/run': () => json({ error: 'DEEPSEEK_API_KEY is not set', code: 'EVAL_NO_MODEL' }, 503) });
    render(<EvalsDashboard fetcher={fetcher} />);
    fireEvent.click(await screen.findByRole('button', { name: /Run measured/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('DEEPSEEK_API_KEY'));
    expect(screen.getByText('No eval run has been recorded.')).toBeInTheDocument();
  });

  it('an API failure is an error message, never a re-fabricated report', async () => {
    render(<EvalsDashboard fetcher={vi.fn(async () => { throw new Error('offline'); })} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not load'));
    expect(screen.queryByText(/passed/)).toBeNull();
  });
});

describe('helpers', () => {
  it('latencyTile only shows numbers for measured telemetry', () => {
    expect(latencyTile(null).value).toBe('—');
    expect(latencyTile({ status: 'insufficient_data', sampleSize: 0, requiredSampleSize: 20 }).detail).toContain('0 of 20');
    expect(latencyTile({ status: 'success', sampleSize: 40, responseLatencyMs: { p50: 700.4, p95: 1400.2, sampleSize: 40 } }).value).toBe('700ms p50 / 1400ms p95');
  });
  it('pct renders null as a dash', () => {
    expect(pct(null)).toBe('—');
    expect(pct(0.5)).toBe('50%');
  });
});
