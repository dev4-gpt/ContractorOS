import React, { useState } from 'react';
import type { Outcome } from './types';

const field = 'w-full rounded border border-slate-500/40 bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';
const button = 'rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';

interface Turn { role: 'user' | 'persona'; text: string }

interface Props {
  outcome: Outcome;
  busy: boolean;
  // Resolves to null (never rejects) when the send failed — the caller is expected to have
  // already surfaced the error (e.g. via a shared `guard()`/notice mechanism) before resolving.
  onSend: (personaId: string, message: string) => Promise<string | null>;
}

export const ChatView: React.FC<Props> = ({ outcome, busy, onSend }) => {
  const [personaId, setPersonaId] = useState(outcome.personas[0]?.personaId ?? '');
  const [message, setMessage] = useState('');
  const [threads, setThreads] = useState<Record<string, Turn[]>>({});

  const send = async () => {
    const text = message.trim();
    if (!text || !personaId) return;
    setMessage('');
    setThreads((t) => ({ ...t, [personaId]: [...(t[personaId] ?? []), { role: 'user', text }] }));
    const reply = await onSend(personaId, text);
    if (reply) setThreads((t) => ({ ...t, [personaId]: [...(t[personaId] ?? []), { role: 'persona', text: reply }] }));
  };

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">Chat with a buyer</h2>
      <select aria-label="Buyer" className={field} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
        {outcome.personas.map((p) => <option key={p.personaId} value={p.personaId}>{p.name}</option>)}
      </select>
      <ul className="space-y-1">
        {(threads[personaId] ?? []).map((t, i) => (
          <li key={i} className={`text-sm ${t.role === 'user' ? 'font-medium' : ''}`}>{t.role === 'user' ? 'You: ' : ''}{t.text}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input aria-label="Ask a buyer" className={field} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className={button} disabled={busy || !message.trim()} onClick={send}>Send</button>
      </div>
    </section>
  );
};
