import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TryPostPublish } from './TryPostPublish';
import { SignedOutError } from '../auth/authorizedFetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const accounts = { accounts: [{ id: 'a1', platform: 'bluesky', displayName: 'Me', username: 'me.bsky.social' }] };

function setup(publishResponse: () => Response) {
  const fetcher = vi.fn(async (path: string, _init?: RequestInit) => (path === '/api/me/trypost/accounts' ? json(accounts) : publishResponse()));
  render(<TryPostPublish fetcher={fetcher} />);
  return fetcher;
}

const fill = async () => {
  fireEvent.click(await screen.findByLabelText(/bluesky: me.bsky.social/));
  fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'hello' } });
};

describe('TryPostPublish', () => {
  it('lists accounts and keeps Publish disabled until text and an account are set', async () => {
    setup(() => json({}));
    const button = screen.getByRole('button', { name: 'Publish' });
    expect(button).toBeDisabled();
    await fill();
    expect(button).toBeEnabled();
  });

  it('sends text and accountIds, and labels a simulated receipt as not published', async () => {
    const fetcher = setup(() =>
      json({ receipts: [{ status: 'simulated_live', isSimulated: true, details: 'Simulated: real publishing is disabled.', postId: '', postUrl: '', accountHandle: 'me.bsky.social' }] })
    );
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByText(/Simulated, not published/)).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith('/api/me/publish', expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'hello', accountIds: ['a1'] }) }));
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a real receipt with a link only when not simulated', async () => {
    setup(() =>
      json({ receipts: [{ status: 'published', isSimulated: false, details: 'TryPost confirmed the post is published.', postId: 'p1', postUrl: 'https://bsky.app/p1', accountHandle: 'me' }] })
    );
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'View post' })).toHaveAttribute('href', 'https://bsky.app/p1'));
    expect(screen.queryByText(/Simulated, not published/)).toBeNull();
  });

  it('shows server errors', async () => {
    setup(() => json({ error: 'Save your TryPost API token in Keys first.' }, 409));
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Save your TryPost API token'));
  });

  it('shows a session-ended message on SignedOutError', async () => {
    const fetcher = vi.fn(async () => {
      throw new SignedOutError();
    });
    render(<TryPostPublish fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Your session ended. Sign in again.'));
  });

  it('never renders a non-http(s) postUrl as a link', async () => {
    setup(() =>
      json({ receipts: [{ status: 'published', isSimulated: false, details: 'ok', postId: 'p1', postUrl: 'javascript:alert(1)', accountHandle: 'me' }] })
    );
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByText(/TryPost|ok/)).toBeInTheDocument());
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('hides inactive accounts and tolerates a missing accounts array', async () => {
    const f = vi.fn(async () => json({ accounts: [{ id: 'x', platform: 'bluesky', displayName: '', username: 'gone', active: false }] }));
    render(<TryPostPublish fetcher={f} />);
    await waitFor(() => expect(screen.getByText(/No accounts connected/)).toBeInTheDocument());
    expect(screen.queryByLabelText(/gone/)).toBeNull();
    cleanup();
    render(<TryPostPublish fetcher={vi.fn(async () => json({}))} />);
    await waitFor(() => expect(screen.getByText(/No accounts connected/)).toBeInTheDocument());
  });
});
