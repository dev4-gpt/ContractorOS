import React, { useEffect, useState } from 'react';
import type { Persona, Surface } from './types';

const field = 'w-full rounded border border-slate-500/40 bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';
const button = 'rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';

export type PanelPayload = Array<{ name: string; archetype: string; surfaces: Surface[]; role: string; goals: string[]; constraints: string[]; budgetAuthority: string; priorTools: string[]; reasonNotToBuy: string }>;

interface Props {
  personas: Persona[];
  hasSources: boolean;
  busy: boolean;
  runActive: boolean;
  onGenerate: (force: boolean) => void;
  onSave: (payload: PanelPayload) => void;
}

export const PanelStep: React.FC<Props> = ({ personas, hasSources, busy, runActive, onGenerate, onSave }) => {
  const [drafts, setDrafts] = useState<Persona[]>(personas);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDrafts(personas);
    setDirty(false);
  }, [personas]);

  const edit = (id: string, change: (p: Persona) => Persona) => {
    setDrafts((d) => d.map((p) => (p.id === id ? change(p) : p)));
    setDirty(true);
  };
  const anyEdited = personas.some((p) => p.edited);
  const generateLabel = personas.length === 0 ? 'Generate panel' : anyEdited ? 'Regenerate panel (replaces your edits)' : 'Regenerate panel';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Panel of buyers</h2>
        <button className={button} disabled={busy || !hasSources || runActive} onClick={() => onGenerate(anyEdited)}>{generateLabel}</button>
        <button
          className={button}
          disabled={busy || !dirty || drafts.length === 0 || runActive}
          onClick={() =>
            onSave(drafts.map((p) => ({ name: p.spec.name, archetype: p.archetype, surfaces: p.surfaces, role: p.spec.role, goals: p.spec.goals, constraints: p.spec.constraints, budgetAuthority: p.spec.budgetAuthority, priorTools: p.spec.priorTools, reasonNotToBuy: p.spec.reasonNotToBuy })))
          }
        >
          Save edits
        </button>
      </div>
      {!hasSources && <p className="text-xs opacity-80">Add a source first.</p>}
      <ul className="space-y-2">
        {drafts.map((p) => (
          <li key={p.id} className="space-y-1 rounded-lg border border-slate-500/30 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <input className={field} aria-label={`Name of the ${p.archetype.replace(/_/g, ' ')}`} value={p.spec.name} onChange={(e) => edit(p.id, (x) => ({ ...x, spec: { ...x.spec, name: e.target.value } }))} />
              <span className="text-[10px] uppercase tracking-wide opacity-70">{p.archetype.replace(/_/g, ' ')}</span>
              {p.edited && <span className="text-[10px] uppercase tracking-wide opacity-70">edited</span>}
            </div>
            <label className="block text-xs">Why they might not buy</label>
            <textarea className={field} rows={2} value={p.spec.reasonNotToBuy} onChange={(e) => edit(p.id, (x) => ({ ...x, spec: { ...x.spec, reasonNotToBuy: e.target.value } }))} />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                aria-label="Sees the signed-in app"
                checked={p.surfaces.includes('signed_in')}
                disabled={p.archetype === 'distracted_visitor'}
                onChange={(e) => edit(p.id, (x) => ({ ...x, surfaces: e.target.checked ? ['public', 'signed_in'] : ['public'] }))}
              />
              Sees the signed-in app
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};
