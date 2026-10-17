import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BuyerLab } from './BuyerLab';
import { OutcomeView } from './OutcomeView';
import type { Outcome } from './types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const project = { id: 'p1', name: 'Veloce', targetUrl: 'https://veloceos.cloud', brief: null, createdAt: '2026-09-21T00:00:00.000Z', selfTest: false };
const source = { id: 's1', kind: 'upload', surface: 'signed_in', label: 'Approvals page', url: null, words: 120, fetchedAt: '2026-09-21T00:00:00.000Z' };
const persona = (id: string, archetype: string, name: string) => ({ id, archetype, surfaces: ['public'], edited: false, spec: { name, role: 'Head of Ops', goals: [], constraints: [], budgetAuthority: 'none', priorTools: [], reasonNotToBuy: 'No price.' } });
const detail = (over: Record<string, unknown> = {}) => ({
  project, sources: [source], personas: [persona('u1', 'skeptic', 'Sam Skeptic'), persona('u2', 'champion', 'Cha Champion')],
  latestRun: null, estimate: { calls: 2, approxInputTokens: 4000, approxOutputTokens: 3000, usdUpperBound: 0.0048, note: 'Upper bound at deepseek-flash list prices.' }, ...over
});
const outcome = (over: Partial<Outcome> = {}): Outcome => ({
  provider: 'native', model: 'deepseek-flash', panelSize: 2,
  coverage: { sources: [{ id: 's1', label: 'Approvals page', url: null, surface: 'signed_in', words: 120 }] },
  personas: [
    { personaId: 'u1', name: 'Sam Skeptic', archetype: 'skeptic', surfaces: ['public'], intent: { score: 2, rationale: 'No price is shown.' }, sentiment: 'negative',
      claims: [{ id: 'u1:1', kind: 'objection', text: 'I cannot tell what it costs', severity: 'high', sourceId: 's1', surface: 'signed_in', quote: 'Pricing is by signed proposal only' }],
      dropped: [{ text: 'It is cheap', reason: 'quote_not_found' }], conversation: [] },
    { personaId: 'u2', name: 'Cha Champion', archetype: 'champion', surfaces: ['public'], intent: { score: 7, rationale: 'Saves time.' }, sentiment: 'positive', claims: [], dropped: [], conversation: [] }
  ],
  agreement: { intentMin: 2, intentMax: 7, split: true }, verification: { kept: 1, dropped: 1 }, partial: null, callsUsed: 2,
  generatedAt: '2026-09-21T10:00:00.000Z', disclaimer: 'Simulated buyers, not measured customers. These are hypotheses to test with real buyers.', ...over
});

type Handler = (init?: RequestInit) => Response | Promise<Response>;
function scripted(routes: Record<string, Handler>) {
  return vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path}`;
    const h = routes[key];
    if (!h) throw new Error(`unscripted request: ${key}`);
    return h(init);
  });
}
const base = (extra: Record<string, Handler> = {}) => scripted({ 'GET /api/buyerlab/projects': () => json({ projects: [project] }), 'GET /api/buyerlab/projects/p1': () => json(detail()), ...extra });
const renderTab = (fetcher: ReturnType<typeof scripted>, props: Record<string, unknown> = {}) =>
  render(<BuyerLab signedIn isGlass={false} onOpenKeys={vi.fn()} fetcher={fetcher} {...props} />);

describe('BuyerLab', () => {
  it('asks a signed-out visitor to sign in and calls nothing', () => {
    const fetcher = scripted({});
    renderTab(fetcher, { signedIn: false });
    expect(screen.getByText('Sign in to use Buyer Lab.')).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('opens the first project with its sources tagged by surface and its panel', async () => {
    renderTab(base());
    expect(await screen.findByText('Approvals page')).toBeInTheDocument();
    expect(screen.getByText('signed in')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sam Skeptic')).toBeInTheDocument();
    expect(screen.getByText(/about 2 model calls/i)).toBeInTheDocument();
  });

  it('creates a project when there are none', async () => {
    let sent: unknown;
    const fetcher = scripted({
      'GET /api/buyerlab/projects': () => json({ projects: [] }),
      'POST /api/buyerlab/projects': (init) => {
        sent = JSON.parse(String(init?.body));
        return json({ project }, 201);
      },
      'GET /api/buyerlab/projects/p1': () => json(detail({ sources: [], personas: [], estimate: null }))
    });
    renderTab(fetcher);
    fireEvent.change(await screen.findByLabelText('Project name'), { target: { value: 'Veloce' } });
    fireEvent.change(screen.getByLabelText('Website address (optional)'), { target: { value: 'https://veloceos.cloud' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Add what buyers will see')).toBeInTheDocument();
    expect(sent).toEqual({ name: 'Veloce', targetUrl: 'https://veloceos.cloud' });
  });

  it('pastes page text tagged with the chosen surface', async () => {
    let sent: unknown;
    const fetcher = base({
      'POST /api/buyerlab/projects/p1/ingest': (init) => {
        sent = JSON.parse(String(init?.body));
        return json({ added: [], duplicates: 0, skipped: [], truncated: false }, 201);
      }
    });
    renderTab(fetcher);
    await screen.findByText('Approvals page');
    fireEvent.change(screen.getByLabelText('Page text'), { target: { value: 'x'.repeat(60) } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Dashboard' } });
    fireEvent.change(screen.getByLabelText('Shown to buyers who are'), { target: { value: 'signed_in' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pasted text' }));
    await waitFor(() => expect(sent).toEqual({ text: 'x'.repeat(60), label: 'Dashboard', surface: 'signed_in' }));
  });

  it('warns not to paste personal data', async () => {
    renderTab(base());
    expect(await screen.findByText(/do not paste personal data/i)).toBeInTheDocument();
  });

  it('tells the user to paste text when a page has no readable text', async () => {
    const fetcher = base({ 'POST /api/buyerlab/projects/p1/ingest': () => json({ error: 'This page builds its content in the browser. Paste the page text instead.', code: 'NO_READABLE_TEXT', skipped: [] }, 422) });
    renderTab(fetcher);
    await screen.findByText('Approvals page');
    fireEvent.change(screen.getByLabelText('Page address'), { target: { value: 'https://app.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read this page' }));
    expect(await screen.findByText(/paste the page text instead/i)).toBeInTheDocument();
  });

  it('points to Keys when a key is required', async () => {
    const onOpenKeys = vi.fn();
    const fetcher = base({ 'POST /api/buyerlab/projects/p1/panel': () => json({ error: 'Add your own DeepSeek key in Keys to run Buyer Lab.', code: 'KEY_REQUIRED' }, 402) });
    renderTab(fetcher, { onOpenKeys });
    await screen.findByText('Approvals page');
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate panel' }));
    expect(await screen.findByText(/add your own deepseek key/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Keys' }));
    expect(onOpenKeys).toHaveBeenCalled();
  });

  it('saves panel edits', async () => {
    let sent: any;
    const fetcher = base({
      'PUT /api/buyerlab/projects/p1/panel': (init) => {
        sent = JSON.parse(String(init?.body));
        return json({ personas: [] });
      }
    });
    renderTab(fetcher);
    fireEvent.change(await screen.findByDisplayValue('Sam Skeptic'), { target: { value: 'Sam S.' } });
    fireEvent.click(screen.getAllByLabelText('Sees the signed-in app')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    await waitFor(() => expect(sent).toBeDefined());
    expect(sent.personas).toHaveLength(2);
    expect(sent.personas[0]).toMatchObject({ name: 'Sam S.', archetype: 'skeptic', surfaces: ['public', 'signed_in'] });
  });

  it('runs the panel, polls to completion and shows the verified outcome', async () => {
    const run = { id: 'r1', status: 'queued', provider: 'native', callsUsed: 0, callBudget: 4, fundedBy: 'byok', errorCode: null };
    const fetcher = base({
      'POST /api/buyerlab/runs': () => json({ run, estimate: detail().estimate }, 201),
      'GET /api/buyerlab/runs/r1': () => json({ run: { ...run, status: 'done', callsUsed: 2 }, progress: { done: true, completedSteps: 2, failedSteps: 0, totalSteps: 2, callsUsed: 2, budgetExhausted: false } }),
      'GET /api/buyerlab/runs/r1/outcome': () => json({ run: { ...run, status: 'done' }, outcome: outcome() })
    });
    renderTab(fetcher);
    await screen.findByText('Approvals page');
    fireEvent.click(screen.getByRole('button', { name: 'Run buyer panel' }));
    expect(await screen.findByText(/simulated buyers, not measured customers/i)).toBeInTheDocument();
    expect(screen.getByText('Pricing is by signed proposal only')).toBeInTheDocument();
    expect(screen.getByText('Intent 2/10')).toBeInTheDocument();
  });

  it('disables regenerate and save while a run is queued or running, and never calls the panel API', async () => {
    const run = { id: 'r1', status: 'running', provider: 'native', callsUsed: 1, callBudget: 4, fundedBy: 'byok', errorCode: null };
    const fetcher = scripted({
      'GET /api/buyerlab/projects': () => json({ projects: [project] }),
      'GET /api/buyerlab/projects/p1': () => json(detail({ latestRun: run })),
      'GET /api/buyerlab/runs/r1': () => json({ run, progress: { done: false, completedSteps: 1, failedSteps: 0, totalSteps: 2, callsUsed: 1, budgetExhausted: false } })
    });
    renderTab(fetcher);
    const regenerate = await screen.findByRole('button', { name: 'Regenerate panel' });
    const save = screen.getByRole('button', { name: 'Save edits' });
    expect(regenerate).toBeDisabled();
    expect(save).toBeDisabled();
    fireEvent.click(regenerate);
    fireEvent.click(save);
    expect(fetcher.mock.calls.some(([path]) => path.endsWith('/panel'))).toBe(false);
  });

  it('reopens the latest finished run after a reload', async () => {
    const run = { id: 'r9', status: 'done', provider: 'native', callsUsed: 2, callBudget: 4, fundedBy: 'byok', errorCode: null };
    const fetcher = scripted({
      'GET /api/buyerlab/projects': () => json({ projects: [project] }),
      'GET /api/buyerlab/projects/p1': () => json(detail({ latestRun: run })),
      'GET /api/buyerlab/runs/r9/outcome': () => json({ run, outcome: outcome() })
    });
    renderTab(fetcher);
    expect(await screen.findByText('Pricing is by signed proposal only')).toBeInTheDocument();
  });
});

describe('OutcomeView', () => {
  it('leads with the disclaimer, shows verbatim quotes with their surface, and never a percentage', () => {
    const { container } = render(<OutcomeView outcome={outcome()} />);
    expect(screen.getByText(/simulated buyers, not measured customers/i)).toBeInTheDocument();
    const quote = screen.getByText('Pricing is by signed proposal only');
    expect(quote.tagName).toBe('BLOCKQUOTE');
    expect(within(quote.closest('li') as HTMLElement).getByText('signed in')).toBeInTheDocument();
    expect(screen.getByText('Intent 7/10')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d\s?%|probabilit|conversion|revenue/i);
  });

  it('reports what was dropped for lacking a verbatim quote, and the disagreement', () => {
    render(<OutcomeView outcome={outcome()} />);
    expect(screen.getByText(/1 claim dropped/i)).toBeInTheDocument();
    expect(screen.getByText(/buyers disagree/i)).toBeInTheDocument();
  });

  it('says so when the outcome is partial', () => {
    render(<OutcomeView outcome={outcome({ partial: { missingPersonaIds: ['u3'] } })} />);
    expect(screen.getByText(/1 of 2 buyers did not finish/i)).toBeInTheDocument();
  });
});

describe('BuyerLab: self-test, report, chat, retest', () => {
  it('shows a self-test checkbox on the create-project form', async () => {
    const fetcher = scripted({ 'GET /api/buyerlab/projects': () => json({ projects: [] }) });
    renderTab(fetcher);
    expect(await screen.findByLabelText(/self-test/i)).toBeInTheDocument();
  });

  it('sends selfTest with project creation', async () => {
    let sent: any;
    const fetcher = scripted({
      'GET /api/buyerlab/projects': () => json({ projects: [] }),
      'POST /api/buyerlab/projects': (init) => { sent = JSON.parse(String(init?.body)); return json({ project }, 201); },
      'GET /api/buyerlab/projects/p1': () => json(detail({ sources: [], personas: [], estimate: null }))
    });
    renderTab(fetcher);
    fireEvent.change(await screen.findByLabelText('Project name'), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByLabelText(/self-test/i));
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(sent).toBeDefined());
    expect(sent.selfTest).toBe(true);
  });

  it('shows the report, with each finding\'s quote pulled from the outcome, once a run finishes', async () => {
    const run = { id: 'r1', status: 'done', provider: 'native', callsUsed: 2, callBudget: 4, fundedBy: 'byok', errorCode: null };
    const report = { headline: 'No price shown anywhere.', findings: [{ text: 'Buyers cannot find a price.', claimIds: ['u1:1'] }], recommendations: [{ text: 'Publish a price.', claimIds: ['u1:1'], rewrite: 'Starting at $X.' }], disclaimer: 'Simulated buyers, not measured customers.', generatedAt: 'x' };
    const fetcher = base({
      'GET /api/buyerlab/projects/p1': () => json(detail({ latestRun: run })),
      'GET /api/buyerlab/runs/r1/outcome': () => json({ run, outcome: outcome() }),
      'GET /api/buyerlab/runs/r1/report': () => json({ report, outcome: outcome() })
    });
    renderTab(fetcher);
    expect(await screen.findByText('No price shown anywhere.')).toBeInTheDocument();
    const finding = screen.getByText('Buyers cannot find a price.');
    expect(finding).toBeInTheDocument();
    // Scoped to the finding's own <li> so this proves ReportView's quotesFor() pulled the quote via claimIds,
    // not merely that OutcomeView (rendered above) happens to show the same quote string elsewhere on the page.
    expect(within(finding.closest('li') as HTMLElement).getByText('Pricing is by signed proposal only')).toBeInTheDocument();
    expect(screen.getByText('Starting at $X.')).toBeInTheDocument();
  });

  it('sends a chat message and shows the reply in a thread', async () => {
    const run = { id: 'r1', status: 'done', provider: 'native', callsUsed: 2, callBudget: 4, fundedBy: 'byok', errorCode: null };
    let sent: any;
    const fetcher = base({
      'GET /api/buyerlab/projects/p1': () => json(detail({ latestRun: run })),
      'GET /api/buyerlab/runs/r1/outcome': () => json({ run, outcome: outcome() }),
      'GET /api/buyerlab/runs/r1/report': () => json({ error: 'not ready', code: 'RUN_NOT_DONE' }, 409),
      'POST /api/buyerlab/runs/r1/chat': (init) => { sent = JSON.parse(String(init?.body)); return json({ reply: 'Still no price, honestly.' }); }
    });
    renderTab(fetcher);
    await screen.findByText(/simulated buyers, not measured customers/i);
    fireEvent.change(screen.getByLabelText('Ask a buyer'), { target: { value: 'Why no price?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toEqual({ personaId: 'u1', message: 'Why no price?' }));
    expect(await screen.findByText('Still no price, honestly.')).toBeInTheDocument();
  });

  it('starts a re-test and shows the intent delta once the new run finishes', async () => {
    const run = { id: 'r1', status: 'done', provider: 'native', callsUsed: 2, callBudget: 4, fundedBy: 'byok', errorCode: null };
    const run2 = { ...run, id: 'r2' };
    const outcome2 = { ...outcome(), personas: outcome().personas.map((p) => ({ ...p, intent: { score: p.intent.score + 2, rationale: 'Better now.' } })) };
    const fetcher = base({
      'GET /api/buyerlab/projects/p1': () => json(detail({ latestRun: run })),
      'GET /api/buyerlab/runs/r1/outcome': () => json({ run, outcome: outcome() }),
      'GET /api/buyerlab/runs/r1/report': () => json({ error: 'not ready', code: 'RUN_NOT_DONE' }, 409),
      'POST /api/buyerlab/runs/r1/retest': () => json({ run: run2 }, 201),
      'GET /api/buyerlab/runs/r2': () => json({ run: run2, progress: { done: true, completedSteps: 2, failedSteps: 0, totalSteps: 2, callsUsed: 2, budgetExhausted: false } }),
      'GET /api/buyerlab/runs/r2/outcome': () => json({ run: run2, outcome: outcome2 })
    });
    renderTab(fetcher);
    await screen.findByText(/simulated buyers, not measured customers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Re-test' }));
    await waitFor(() => expect(screen.getAllByText(/\+2/).length).toBeGreaterThan(0));
  });
});
