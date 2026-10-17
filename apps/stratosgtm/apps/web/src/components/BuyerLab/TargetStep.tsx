import React, { useState } from 'react';
import type { ProjectDetail, Surface } from './types';

const field = 'w-full rounded border border-slate-500/40 bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';
const button = 'rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';
const surfaceLabel = (s: Surface) => (s === 'signed_in' ? 'signed in' : 'public');

interface Props {
  detail: ProjectDetail | null;
  busy: boolean;
  onCreate: (name: string, url: string, selfTest: boolean) => void;
  onIngestUrl: (url: string) => void;
  onIngestText: (i: { text: string; label: string; surface: Surface }) => void;
}

export const TargetStep: React.FC<Props> = ({ detail, busy, onCreate, onIngestUrl, onIngestText }) => {
  const [name, setName] = useState('');
  const [site, setSite] = useState('');
  const [selfTest, setSelfTest] = useState(false);
  const [pageUrl, setPageUrl] = useState('');
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [surface, setSurface] = useState<Surface>('public');

  if (!detail) {
    return (
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim(), site.trim(), selfTest); }}>
        <label className="block text-sm" htmlFor="bl-name">Project name</label>
        <input id="bl-name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <label className="block text-sm" htmlFor="bl-site">Website address (optional)</label>
        <input id="bl-site" className={field} value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selfTest} onChange={(e) => setSelfTest(e.target.checked)} />
          Self-test (this is StratosGTM itself — only ever usable on a granted workspace)
        </label>
        <button className={button} disabled={busy || !name.trim()}>Create project</button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Add what buyers will see</h2>
      <p className="text-xs opacity-80">
        A public page can be read from its address. An app behind a login cannot: copy its text and add it below, marked as shown to logged-in users.
      </p>

      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (pageUrl.trim()) onIngestUrl(pageUrl.trim()); }}>
        <label className="block text-sm" htmlFor="bl-url">Page address</label>
        <input id="bl-url" className={field} value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder={detail.project.targetUrl ?? 'https://'} />
        <button className={button} disabled={busy || !pageUrl.trim()}>Read this page</button>
      </form>

      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); onIngestText({ text, label: label.trim() || 'Pasted text', surface }); }}>
        <label className="block text-sm" htmlFor="bl-text">Page text</label>
        <textarea id="bl-text" className={field} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-xs opacity-80">Do not paste personal data. Deleting a project deletes its sources, runs and reports.</p>
        <label className="block text-sm" htmlFor="bl-label">Label</label>
        <input id="bl-label" className={field} value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="block text-sm" htmlFor="bl-surface">Shown to buyers who are</label>
        <select id="bl-surface" className={field} value={surface} onChange={(e) => setSurface(e.target.value as Surface)}>
          <option value="public">Anyone (public site)</option>
          <option value="signed_in">Logged-in users (app)</option>
        </select>
        <button className={button} disabled={busy || text.trim().length < 40}>Add pasted text</button>
      </form>

      <ul className="space-y-1 text-sm">
        {detail.sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <span>{s.label}</span>
            <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{surfaceLabel(s.surface)}</span>
            <span className="text-xs opacity-70">{`${s.words} words`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
