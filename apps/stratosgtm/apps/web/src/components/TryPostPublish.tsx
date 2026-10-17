import React, { useCallback, useEffect, useState } from 'react';
import { SignedOutError } from '../auth/authorizedFetch';

interface Account {
  id: string;
  platform: string;
  displayName: string;
  username: string;
  active?: boolean;
}

interface Receipt {
  status: string;
  isSimulated: boolean;
  details: string;
  postId: string;
  postUrl: string;
  accountHandle: string;
}

interface Props {
  fetcher: (path: string, init?: RequestInit) => Promise<Response>;
}

const safeHref = (u: string): string | null => {
  try {
    const { protocol } = new URL(u);
    return protocol === 'https:' || protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
};

const MAX_LENGTH = 10000;
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';

/** Publishes one text post to the caller's own TryPost accounts and shows the honest receipt. */
export const TryPostPublish: React.FC<Props> = ({ fetcher }) => {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown) =>
    setError(err instanceof SignedOutError ? 'Your session ended. Sign in again.' : 'Request failed. Check your connection and try again.');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetcher('/api/me/trypost/accounts');
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccounts(body.accounts ?? []);
        setSelected([]);
      }
      else setError(body.error || `Could not load TryPost accounts. (HTTP ${res.status})`);
    } catch (err) {
      fail(err);
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    setBusy(true);
    setError(null);
    setReceipts([]);
    try {
      const res = await fetcher('/api/me/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, accountIds: selected })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error || `Publish failed. (HTTP ${res.status})`);
      else setReceipts(body.receipts || []);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const canSend = !busy && text.trim().length > 0 && text.length <= MAX_LENGTH && selected.length > 0;

  return (
    <section className="mt-6 border-t border-slate-500/30 pt-4" aria-label="Publish via TryPost">
      <h3 className="text-sm font-bold">Publish via TryPost</h3>
      {accounts === null ? (
        <p className="mt-2 text-xs opacity-70">{error ? '' : 'Loading accounts...'}</p>
      ) : accounts.filter((a) => a.active !== false).length === 0 ? (
        <p className="mt-2 text-xs opacity-70">No accounts connected in your TryPost workspace.</p>
      ) : (
        <fieldset className="mt-2 space-y-1">
          <legend className="sr-only">Accounts</legend>
          {accounts.filter((a) => a.active !== false).map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
              />
              <span>
                {a.platform}: {a.username || a.displayName}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <label htmlFor="trypost-text" className="mt-3 block text-xs font-semibold">
        Post text
      </label>
      <textarea
        id="trypost-text"
        value={text}
        maxLength={MAX_LENGTH}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-transparent border-slate-500/40 ${focus}`}
      />
      <button
        type="button"
        disabled={!canSend}
        onClick={() => void send()}
        className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-cyan-500 cursor-pointer disabled:opacity-50 ${focus}`}
      >
        Publish
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-xs text-rose-500">
          {error}
        </p>
      ) : null}
      {receipts.length ? (
        <ul className="mt-3 space-y-2" aria-label="Receipts">
          {receipts.map((r, i) => (
            <li key={`${r.postId}-${i}`} className="text-xs">
              <span className="font-semibold">{r.isSimulated ? 'Simulated, not published' : 'Published'}</span>
              {r.accountHandle ? ` (${r.accountHandle})` : ''}: {r.status}. {r.details}
              {r.postUrl && safeHref(r.postUrl) ? (
                <>
                  {' '}
                  <a href={safeHref(r.postUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="underline">
                    View post
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
