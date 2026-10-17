import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KeysPanel } from './KeysPanel';
import { SignedOutError } from '../auth/authorizedFetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const html = (status = 500) => new Response('<html><body>Internal Server Error</body></html>', { status, headers: { 'Content-Type': 'text/html' } });

describe('KeysPanel', () => {
  it('prompts to sign in when signed out', () => {
    render(<KeysPanel isOpen onClose={vi.fn()} signedIn={false} isGlass={false} fetcher={vi.fn()} />);
    expect(screen.getByText('Sign in to add your own keys.')).toBeInTheDocument();
  });

  it('lists masked keys from the API', async () => {
    const fetcher = vi.fn(async (_path: string, _init?: RequestInit) =>
      json({ credentials: [{ platform: 'deepseek', accountHandle: null, last4: '••••9876', updatedAt: '2026-09-13T12:00:00.000Z', lastTest: null }] })
    );
    render(<KeysPanel isOpen onClose={vi.fn()} signedIn isGlass={false} fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByText('••••9876')).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith('/api/me/credentials', undefined);
  });

  it('saves the platform-specific field shape', async () => {
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? json({ platform: 'linkedin', accountHandle: null, last4: '••••abcd', updatedAt: '2026-09-13T12:00:00.000Z', lastTest: null })
        : json({ credentials: [] })
    );
    render(<KeysPanel isOpen onClose={vi.fn()} signedIn isGlass={false} fetcher={fetcher} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'LinkedIn' }));
    fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'li-token-abcd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/me/credentials/linkedin',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ accessToken: 'li-token-abcd' }) })
      )
    );
  });

  it('has a TryPost tab that saves apiToken, tests it, and offers publishing once saved', async () => {
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/me/credentials/trypost/test') return json({ ok: true, message: 'TryPost accepted this key.', testedAt: 'x' });
      if (path === '/api/me/trypost/accounts') return json({ accounts: [] });
      if (init?.method === 'PUT') return json({ platform: 'trypost' });
      return json({ credentials: [{ platform: 'trypost', accountHandle: null, last4: '••••1234', updatedAt: '2026-09-13T12:00:00.000Z', lastTest: null }] });
    });
    render(<KeysPanel isOpen onClose={vi.fn()} signedIn isGlass={false} fetcher={fetcher} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'TryPost' }));
    expect(await screen.findByText('••••1234')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'tp-token-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith('/api/me/credentials/trypost', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ apiToken: 'tp-token-1234' }) }))
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('TryPost accepted this key.'));
    expect(screen.getByRole('region', { name: 'Publish via TryPost' })).toBeInTheDocument();
  });

  it('shows the HTTP status when a 500 returns a non-JSON (HTML) body', async () => {
    const fetcher = vi.fn(async () => html(500));
    render(<KeysPanel isOpen onClose={vi.fn()} signedIn isGlass={false} fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('HTTP 500'));
  });

  it('shows a session-ended message when the fetcher throws SignedOutError', async () => {
    const fetcher = vi.fn(async () => {
      throw new SignedOutError();
    });
    render(<KeysPanel isOpen onClose={vi.fn()} signedIn isGlass={false} fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Your session ended. Sign in again.'));
  });
});
