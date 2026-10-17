import React, { useState } from 'react';
import { CRMLead, ChurnRiskMember, LeadStatus } from '@voice-os/shared';
import { Users, Calendar, Award, Sparkles, PlusCircle, ArrowRight, PhoneCall } from 'lucide-react';
import { LeadDetailDrawer } from './LeadDetailDrawer';

interface CrmKanbanProps {
  leads: CRMLead[];
  members?: ChurnRiskMember[];
  onSimulateLead?: () => void;
  onTriggerLeadCall?: (lead: CRMLead) => void;
  onLeadStatusChange?: (lead: CRMLead, newStatus: LeadStatus) => void;
  theme?: 'glass' | 'cyber';
}

const COLUMNS: Array<{ key: LeadStatus; label: string; color: string; badgeColor: string }> = [
  {
    key: 'new',
    label: 'New Inbound Leads',
    color: 'border-slate-700 bg-slate-800/40 text-slate-300',
    badgeColor: 'border-slate-700 text-slate-400'
  },
  {
    key: 'inbound_qualified',
    label: 'BANT Qualified (≥60)',
    color: 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300',
    badgeColor: 'border-cyan-500/40 text-cyan-300'
  },
  {
    key: 'call_scheduled',
    label: 'Strategy Call Booked',
    color: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300',
    badgeColor: 'border-emerald-500/40 text-emerald-300'
  },
  {
    key: 'enrolled',
    label: 'Enrolled / Closed',
    color: 'border-purple-500/40 bg-purple-950/30 text-purple-300',
    badgeColor: 'border-purple-500/40 text-purple-300'
  }
];

export const CrmKanban: React.FC<CrmKanbanProps> = ({
  leads,
  members = [],
  onSimulateLead,
  onTriggerLeadCall,
  onLeadStatusChange,
  theme = 'glass'
}) => {
  const isGlass = theme === 'glass';
  const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null);

  const handleCardDragStart = (e: React.DragEvent<HTMLDivElement>, lead: CRMLead) => {
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedLeadId(lead.id);
  };

  const handleCardDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverColumn(null);
  };

  const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>, columnKey: LeadStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== columnKey) setDragOverColumn(columnKey);
  };

  const handleColumnDrop = (e: React.DragEvent<HTMLDivElement>, columnKey: LeadStatus) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    const lead = leads.find((l) => l.id === leadId);
    setDraggedLeadId(null);
    setDragOverColumn(null);
    if (!lead || lead.status === columnKey) return;
    onLeadStatusChange?.(lead, columnKey);
  };

  return (
    <div
      className={`flex flex-col h-full rounded-2xl p-5 transition-all border backdrop-blur-xl ${
        isGlass
          ? 'bg-[#fdfcf9]/80 border-[#e8e4dc]/90 shadow-[0_12px_40px_rgba(40,30,20,0.04)] text-slate-800'
          : 'bg-slate-900/60 border-slate-800/80 shadow-2xl text-slate-100'
      }`}
    >
      {/* Top Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b ${
          isGlass ? 'border-[#e8e4dc]/80' : 'border-slate-800/80'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className={`text-base font-semibold ${isGlass ? 'text-slate-900' : 'text-slate-200'}`}>
                Live Creator Revenue Pipeline (CRM)
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                isGlass ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              }`}>
                AI BANT SCORING
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>
              Every inbound voice turn evaluates Budget, Authority, Need, and Timeline with real-time score updates.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className={`text-xs font-mono ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>
            {leads.length} Leads • {members.length} Retained Members
          </span>

          {onSimulateLead && (
            <button
              onClick={onSimulateLead}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-sm transition-all ${
                isGlass
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
                  : 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/40 text-emerald-300'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Simulate Inbound Lead</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 overflow-x-auto">
        {COLUMNS.map((col) => {
          const colLeads = leads.filter((l) => l.status === col.key);

          const isDropTarget = dragOverColumn === col.key;

          return (
            <div
              key={col.key}
              onDragEnter={(e) => handleColumnDragOver(e, col.key)}
              onDragOver={(e) => handleColumnDragOver(e, col.key)}
              onDragLeave={() => setDragOverColumn((prev) => (prev === col.key ? null : prev))}
              onDrop={(e) => handleColumnDrop(e, col.key)}
              className={`flex flex-col rounded-xl p-3.5 min-w-[260px] shadow-sm border transition-colors ${
                isDropTarget
                  ? isGlass
                    ? 'bg-sky-50/80 border-sky-400 border-dashed'
                    : 'bg-cyan-950/40 border-cyan-500/60 border-dashed'
                  : isGlass
                  ? 'bg-[#f7f3ea]/80 border-[#e5e0d6]'
                  : 'bg-slate-950/60 border-slate-800/80'
              }`}
            >
              <div className={`flex items-center justify-between pb-2.5 mb-2.5 border-b ${isGlass ? 'border-[#e5e0d6]' : 'border-slate-800'}`}>
                <span className={`text-xs font-semibold uppercase tracking-wider ${
                  isGlass
                    ? col.key === 'inbound_qualified' ? 'text-sky-700' : col.key === 'call_scheduled' ? 'text-emerald-700' : col.key === 'enrolled' ? 'text-purple-700' : 'text-slate-700'
                    : col.color.split(' ')[2]
                }`}>
                  {col.label}
                </span>
                <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                  isGlass ? 'bg-[#fdfcf9] border border-[#e5e0d6] text-slate-800 shadow-2xs' : 'bg-slate-800 text-slate-400'
                }`}>
                  {colLeads.length}
                </span>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto min-h-[440px] max-h-[560px] pr-1 custom-scrollbar">
                {colLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 space-y-2">
                    <div className="w-8 h-8 rounded-full border border-dashed border-slate-700 flex items-center justify-center text-slate-600 font-mono text-xs">
                      0
                    </div>
                    <p className="text-xs font-mono">No records in this stage</p>
                    {onSimulateLead && col.key === 'new' && (
                      <button
                        onClick={onSimulateLead}
                        className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline pt-1"
                      >
                        + Click to Simulate Inbound
                      </button>
                    )}
                  </div>
                ) : (
                  colLeads.map((lead) => {
                    const score = lead.qualificationScore;
                    const isHigh = score >= 75;
                    const isMid = score >= 50;

                    // SVG mini-circle math
                    const r = 16;
                    const circ = 2 * Math.PI * r;
                    const offset = circ - (score / 100) * circ;

                    const isDragging = draggedLeadId === lead.id;

                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleCardDragStart(e, lead)}
                        onDragEnd={handleCardDragEnd}
                        onClick={() => setSelectedLead(lead)}
                        className={`group p-3.5 rounded-xl transition-all shadow-xs hover:shadow-md space-y-2 cursor-grab active:cursor-grabbing relative overflow-hidden border ${
                          isDragging ? 'opacity-40' : ''
                        } ${
                          isGlass
                            ? 'bg-[#fdfcf9] hover:bg-white border-[#e5e0d6] hover:border-sky-500 text-slate-800 shadow-2xs'
                            : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 hover:border-cyan-500/50 text-slate-100'
                        }`}
                      >
                        {/* Ambient subtle glow for high-ticket lead */}
                        {isHigh && (
                          <div
                            className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-xl pointer-events-none ${
                              isGlass ? 'bg-emerald-500/10' : 'bg-emerald-500/5'
                            }`}
                          />
                        )}

                        <div className="flex items-center justify-between">
                          <div>
                            <span
                              className={`font-semibold text-xs transition-colors ${
                                isGlass ? 'text-slate-900 group-hover:text-sky-700' : 'text-slate-100 group-hover:text-cyan-300'
                              }`}
                            >
                              {lead.fullName}
                            </span>
                            {lead.companyName && (
                              <div className={`text-[11px] font-medium truncate ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                                {lead.companyName}
                              </div>
                            )}
                          </div>

                          {/* Glowing circular progress score */}
                          <div className="relative flex items-center justify-center w-10 h-10 flex-shrink-0" title={`BANT Qualification: ${score}/100`}>
                            <svg className="w-10 h-10 transform -rotate-90">
                              <circle
                                cx="20"
                                cy="20"
                                r={r}
                                stroke="currentColor"
                                strokeWidth="3.5"
                                fill="transparent"
                                className={isGlass ? 'text-slate-200' : 'text-slate-800'}
                              />
                              <circle
                                cx="20"
                                cy="20"
                                r={r}
                                stroke="currentColor"
                                strokeWidth="3.5"
                                fill="transparent"
                                strokeDasharray={circ}
                                strokeDashoffset={offset}
                                strokeLinecap="round"
                                className={`transition-all duration-700 ${
                                  isHigh
                                    ? isGlass ? 'text-emerald-600' : 'text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.6)]'
                                    : isMid
                                    ? isGlass ? 'text-sky-600' : 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]'
                                    : 'text-amber-500'
                                }`}
                              />
                            </svg>
                            <span className={`absolute text-[10px] font-mono font-bold ${isGlass ? 'text-slate-800' : 'text-slate-200'}`}>
                              {score}
                            </span>
                          </div>
                        </div>

                        <div className={`text-[11px] font-mono truncate ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>{lead.email}</div>

                        {/* Social Badges */}
                        {lead.socialLinks && (
                          <div className="flex items-center space-x-1 pt-0.5">
                            {lead.socialLinks.twitter && (
                              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                isGlass ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-slate-950 border-slate-800 text-cyan-300'
                              }`}>
                                𝕏
                              </span>
                            )}
                            {lead.socialLinks.linkedin && (
                              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                isGlass ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-950 border-slate-800 text-blue-300'
                              }`}>
                                in
                              </span>
                            )}
                            {lead.socialLinks.youtube && (
                              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                isGlass ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-950 border-slate-800 text-red-300'
                              }`}>
                                ▶
                              </span>
                            )}
                          </div>
                        )}

                        {/* Matched Offer */}
                        {lead.matchedOffer && (
                          <div className={`flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded border ${
                            isGlass ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20'
                          }`}>
                            <span className="truncate">{lead.matchedOffer}</span>
                            <ArrowRight className="w-3 h-3 ml-1 flex-shrink-0 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Slide-out Lead Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onTriggerCall={onTriggerLeadCall}
        theme={theme}
      />
    </div>
  );
};
