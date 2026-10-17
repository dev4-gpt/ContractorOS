import React, { useCallback, useEffect, useState } from 'react';
import { X, KeyRound } from 'lucide-react';
import { authorizedFetch, SignedOutError } from '../auth/authorizedFetch';
import { TryPostPublish } from './TryPostPublish';

type Platform = 'deepseek' | 'assemblyai' | 'devto' | 'linkedin' | 'twitter' | 'trypost';

interface MaskedKey {
  platform: Platform;
  accountHandle: string | null;
  last4: string;
  updatedAt: string;
  lastTest: { ok: boolean; testedAt: string } | null;
}

const PLATFORMS: Array<{ id: Platform; label: string; fields: Array<{ name: string; label: string }> }> = [
  { id: 'deepseek', label: 'DeepSeek', fields: [{ name: 'apiKey', label: 'API key' }] },
  { id: 'assemblyai', label: 'AssemblyAI', fields: [{ name: 'apiKey', label: 'API key' }] },
  { id: 'devto', label: 'dev.to', fields: [{ name: 'apiKey', label: 'API key' }] },
  { id: 'linkedin', label: 'LinkedIn', fields: [{ name: 'accessToken', label: 'Access token' }] },
  {
    id: 'twitter',
    label: 'X',
    fields: [
      { name: 'apiKey', label: 'API key' },
      { name: 'apiSecret', label: 'API secret' },
      { name: 'accessToken', label: 'Access token' },
      { name: 'accessTokenSecret', label: 'Access token secret' }
    ]
  },
  { id: 'trypost', label: 'TryPost', fields: [{ name: 'apiToken', label: 'API token' }] }
];

interface KeysPanelProps {
  isOpen: boolean;
  onClose: () => void;
  signedIn: boolean;
  isGlass: boolean;
  fetcher?: (path: string, init?: RequestInit) => Promise<Response>;
}

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';

export const KeysPanel: React.FC<KeysPanelProps> = ({ isOpen, onClose, signedIn, isGlass, fetcher = authorizedFetch }) => {
  const [keys, setKeys] = useState<MaskedKey[]>([]);
  const [active, setActive] = useState<Platform>('deepseek');
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetcher('/api/me/credentials', undefined);
    const body = await res.json().catch(() => ({}));
    if (res.ok) setKeys(body.credentials);
    else setMessage({ ok: false, text: body.error || body.message || `Could not load your keys. (HTTP ${res.status})` });
  }, [fetcher]);

  useEffect(() => {
    if (isOpen && signedIn) {
      void load().catch((err) =>
        setMessage({
          ok: false,
          text: err instanceof SignedOutError ? 'Your session ended. Sign in again.' : 'Could not load your keys.'
        })
      );
    }
  }, [isOpen, signedIn, load]);

  if (!isOpen) return null;

  const platform = PLATFORMS.find((p) => p.id === active)!;
  const saved = keys.find((k) => k.platform === active);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof SignedOutError ? 'Your session ended. Sign in again.' : 'Request failed. Check your connection and try again.'
      });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const body: Record<string, string> = {};
      platform.fields.forEach((f) => (body[f.name] = values[`${active}.${f.name}`] || ''));
      const res = await fetcher(`/api/me/credentials/${active}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: out.error || out.message || `Could not save this key. (HTTP ${res.status})` });
        return;
      }
      setValues({});
      setMessage({ ok: true, text: `${platform.label} key saved.` });
      await load();
    });

  const test = () =>
    run(async () => {
      const res = await fetcher(`/api/me/credentials/${active}/test`, { method: 'POST' });
      const out = await res.json().catch(() => ({}));
      setMessage({
        ok: Boolean(res.ok && out.ok),
        text: out.message || out.error || (res.ok ? 'Test failed.' : `Test failed. (HTTP ${res.status})`)
      });
      await load();
    });

  const remove = () =>
    run(async () => {
      const res = await fetcher(`/api/me/credentials/${active}`, { method: 'DELETE' });
      const out = await res.json().catch(() => ({}));
      setMessage({
        ok: res.ok,
        text: res.ok ? `${platform.label} key removed.` : out.error || out.message || `Could not remove this key. (HTTP ${res.status})`
      });
      await load();
    });

  const surface = isGlass ? 'bg-white text-slate-800 border-slate-200' : 'bg-slate-950 text-slate-100 border-slate-800';
  const button = `px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors duration-200 cursor-pointer disabled:opacity-50 ${focus}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="keys-title">
      <div className={`w-full max-w-lg rounded-2xl border p-6 ${surface}`}>
        <div className="flex items-center justify-between">
          <h2 id="keys-title" className="flex items-center gap-2 text-lg font-bold">
            <KeyRound className="w-5 h-5" aria-hidden="true" /> Your keys
          </h2>
          <button type="button" onClick={onClose} aria-label="Close keys" className={`${button} border-transparent`}>
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {!signedIn ? (
          <p className="mt-6 text-sm">Sign in to add your own keys.</p>
        ) : (
          <>
            <p className="mt-2 text-xs opacity-70">Stored encrypted in your private workspace. Only the last 4 characters are ever shown.</p>
            <div role="tablist" aria-label="Platforms" className="mt-4 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  type="button"
                  aria-selected={active === p.id}
                  onClick={() => {
                    setActive(p.id);
                    setMessage(null);
                  }}
                  className={`${button} ${active === p.id ? 'border-cyan-500' : 'border-slate-500/30'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-4 text-xs">
              {saved ? (
                <p>
                  Saved: <span className="font-mono">{saved.last4}</span>
                  {saved.lastTest ? ` · last test ${saved.lastTest.ok ? 'passed' : 'failed'}` : ' · not tested yet'}
                </p>
              ) : (
                <p className="opacity-70">No {platform.label} key saved.</p>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {platform.fields.map((f) => {
                const id = `key-${active}-${f.name}`;
                return (
                  <div key={id}>
                    <label htmlFor={id} className="block text-xs font-semibold">
                      {f.label}
                    </label>
                    <input
                      id={id}
                      type="password"
                      autoComplete="off"
                      value={values[`${active}.${f.name}`] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [`${active}.${f.name}`]: e.target.value }))}
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-transparent border-slate-500/40 ${focus}`}
                    />
                  </div>
                );
              })}
            </div>

            {message ? (
              <p role="status" className={`mt-4 text-xs ${message.ok ? 'text-emerald-500' : 'text-rose-500'}`}>
                {message.text}
              </p>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void save()} className={`${button} border-cyan-500`}>
                Save key
              </button>
              <button type="button" disabled={busy || !saved} onClick={() => void test()} className={`${button} border-slate-500/40`}>
                Test
              </button>
              <button type="button" disabled={busy || !saved} onClick={() => void remove()} className={`${button} border-rose-500/50`}>
                Remove
              </button>
            </div>
            {active === 'trypost' && saved ? <TryPostPublish fetcher={fetcher} /> : null}
          </>
        )}
      </div>
    </div>
  );
};
