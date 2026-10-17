import React from 'react';
import { CRMLead } from '@voice-os/shared';
import {
  X,
  PhoneCall,
  Calendar,
  DollarSign,
  Briefcase,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageSquare
} from 'lucide-react';

interface LeadDetailDrawerProps {
  lead: CRMLead | null;
  isOpen: boolean;
  onClose: () => void;
  onTriggerCall?: (lead: CRMLead) => void;
  theme?: 'glass' | 'cyber';
}

export const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  lead,
  isOpen,
  onClose,
  onTriggerCall,
  theme = 'glass'
}) => {
  if (!isOpen || !lead) return null;
  const isGlass = theme === 'glass';

  const score = lead.qualificationScore;
  const isHighValue = score >= 75;
  const isMidValue = score >= 50;

  // SVG Circular progress math
  const strokeWidth = 8;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md p-6 flex flex-col h-full shadow-2xl overflow-y-auto custom-scrollbar border-l transition-all ${
          isGlass
            ? 'bg-[#fdfcf9]/95 backdrop-blur-2xl border-l border-[#e8e4dc] text-slate-800'
            : 'bg-slate-950/95 border-slate-800 text-slate-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between border-b pb-4 mb-5 ${
            isGlass ? 'border-[#e8e4dc]/80' : 'border-slate-800/80'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <span
              className={`p-1.5 rounded-lg border ${
                isGlass ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className={`text-base font-bold ${isGlass ? 'text-slate-900' : 'text-white'}`}>{lead.fullName}</h3>
              <p className={`text-xs font-mono ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>{lead.companyName || 'Independent Creator'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-all ${
              isGlass
                ? 'bg-[#f7f3ea] hover:bg-[#ede6d8] text-slate-700 hover:text-slate-900'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Circular Lead Score Card */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between mb-5 shadow-sm ${
            isGlass ? 'bg-slate-50/80 border-slate-200/80' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div>
            <span className={`text-xs font-mono uppercase tracking-wider ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>
              AI BANT Qualification
            </span>
            <div className={`text-sm font-semibold mt-0.5 ${isGlass ? 'text-slate-900' : 'text-slate-200'}`}>
              {isHighValue
                ? 'High-Ticket Qualified'
                : isMidValue
                ? 'Moderate Fit • Nurture Required'
                : 'Cold / Pre-Qualification'}
            </div>
            <div className={`text-[11px] font-mono mt-1 ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>
              Status: <span className={`uppercase font-bold ${isGlass ? 'text-sky-700' : 'text-cyan-400'}`}>{lead.status.replace('_', ' ')}</span>
            </div>
          </div>

          {/* SVG Circular Gauge */}
          <div className="relative flex items-center justify-center">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke="currentColor"
                strokeWidth={strokeWidth}
                fill="transparent"
                className={isGlass ? 'text-slate-200' : 'text-slate-800'}
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke="currentColor"
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={`transition-all duration-1000 ${
                  isHighValue ? (isGlass ? 'text-emerald-600' : 'text-emerald-400') : isMidValue ? (isGlass ? 'text-sky-600' : 'text-cyan-400') : 'text-amber-500'
                }`}
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className={`text-xl font-mono font-bold ${isGlass ? 'text-slate-900' : 'text-white'}`}>{score}</span>
              <span className={`text-[9px] font-mono ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>/100</span>
            </div>
          </div>
        </div>

        {/* Lead Details Breakdown */}
        <div className="space-y-4 flex-1">
          {/* Contact Info */}
          <div className={`p-3.5 rounded-xl border space-y-2 ${isGlass ? 'bg-slate-50/80 border-slate-200/80 text-slate-800' : 'bg-slate-900/60 border-slate-800/80 text-slate-200'}`}>
            <div className={`text-xs font-mono uppercase tracking-wider ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Contact Channels</div>
            <div className="text-xs font-mono flex items-center justify-between">
              <span className={isGlass ? 'text-slate-600' : 'text-slate-400'}>Email:</span>
              <span className={`font-semibold select-all ${isGlass ? 'text-sky-800' : 'text-cyan-300'}`}>{lead.email}</span>
            </div>
            {lead.phone && (
              <div className="text-xs font-mono flex items-center justify-between">
                <span className={isGlass ? 'text-slate-600' : 'text-slate-400'}>Phone:</span>
                <span className={`font-semibold ${isGlass ? 'text-slate-800' : 'text-slate-300'}`}>{lead.phone}</span>
              </div>
            )}
            {lead.website && (
              <div className="text-xs font-mono flex items-center justify-between">
                <span className={isGlass ? 'text-slate-600' : 'text-slate-400'}>Website:</span>
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  className={`hover:underline flex items-center space-x-1 ${isGlass ? 'text-indigo-600' : 'text-indigo-400'}`}
                >
                  <span>{lead.website.replace('https://', '')}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {/* Social Profiles */}
          {lead.socialLinks && (
            <div className={`p-3.5 rounded-xl border space-y-2 ${isGlass ? 'bg-[#f7f3ea]/80 border-[#e5e0d6]' : 'bg-slate-900/60 border-slate-800/80'}`}>
              <div className={`text-xs font-mono uppercase tracking-wider ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Verified Social Handles</div>
              <div className="flex flex-wrap gap-2 pt-1">
                {lead.socialLinks.twitter && (
                  <a
                    href={lead.socialLinks.twitter}
                    target="_blank"
                    rel="noreferrer"
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center space-x-1 ${
                      isGlass ? 'bg-[#fdfcf9] border-[#e2ded5] text-sky-800 shadow-2xs' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-cyan-300'
                    }`}
                  >
                    <span>𝕏 Twitter</span>
                  </a>
                )}
                {lead.socialLinks.linkedin && (
                  <a
                    href={lead.socialLinks.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center space-x-1 ${
                      isGlass ? 'bg-[#fdfcf9] border-[#e2ded5] text-blue-800 shadow-2xs' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-blue-400'
                    }`}
                  >
                    <span>LinkedIn</span>
                  </a>
                )}
                {lead.socialLinks.youtube && (
                  <a
                    href={lead.socialLinks.youtube}
                    target="_blank"
                    rel="noreferrer"
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center space-x-1 ${
                      isGlass ? 'bg-[#fdfcf9] border-[#e2ded5] text-red-800 shadow-2xs' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-red-400'
                    }`}
                  >
                    <span>YouTube</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* AI Voice Qualification Notes */}
          {lead.notes && (
            <div className={`p-3.5 rounded-xl border space-y-2 ${isGlass ? 'bg-[#f7f3ea]/80 border-[#e5e0d6]' : 'bg-slate-900/60 border-slate-800/80'}`}>
              <div className="flex items-center space-x-1.5 text-xs font-mono uppercase tracking-wider">
                <MessageSquare className={`w-3.5 h-3.5 ${isGlass ? 'text-purple-600' : 'text-purple-400'}`} />
                <span className={isGlass ? 'text-slate-700' : 'text-slate-400'}>Voice Agent Call Transcript Summary</span>
              </div>
              <p className={`text-xs leading-relaxed p-3 rounded-lg border font-mono ${
                isGlass ? 'bg-[#fdfcf9] border-[#e2ded5] text-slate-800 shadow-2xs' : 'bg-slate-950/80 border-slate-800 text-slate-300'
              }`}>
                {lead.notes}
              </p>
            </div>
          )}

          {/* Offer & Strategy Booking */}
          {lead.matchedOffer && (
            <div className={`p-3.5 rounded-xl border space-y-1.5 ${
              isGlass ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-emerald-950/20 border-emerald-500/30'
            }`}>
              <div className={`text-xs font-mono uppercase tracking-wider ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>Recommended Cohort Offer</div>
              <div className={`text-sm font-bold ${isGlass ? 'text-slate-900' : 'text-white'}`}>{lead.matchedOffer}</div>
              {lead.scheduledCallTime && (
                <div className={`text-xs font-mono flex items-center space-x-1 mt-1 ${isGlass ? 'text-emerald-800' : 'text-emerald-300'}`}>
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Scheduled Call: {lead.scheduledCallTime}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800/80 flex items-center space-x-3 mt-4">
          <button
            onClick={() => {
              if (onTriggerCall) onTriggerCall(lead);
              onClose();
            }}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-900/30 transition-all"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Trigger AI Strategy Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
