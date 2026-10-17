import React, { useState, useRef, useEffect } from 'react';
import { apiUrl } from '../config/api';
import { User, Bot, Wrench, CheckCircle2, Send, Keyboard, Sparkles, FileDown } from 'lucide-react';

export interface MessageItem {
  id: string;
  speaker: 'user' | 'agent' | 'system';
  text: string;
  isPartial?: boolean;
  timestamp: string;
}

export interface ActiveToolItem {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: Record<string, any>;
  status: 'invoked' | 'executing' | 'completed';
}

interface LiveTranscriptHUDProps {
  messages: MessageItem[];
  activeTools: ActiveToolItem[];
  onSendMessage?: (text: string) => Promise<void>;
  isSendingMessage?: boolean;
  activeBrandVoice?: {
    companyName: string;
    toneLabel: string;
  };
  theme?: 'glass' | 'cyber';
}

export const LiveTranscriptHUD: React.FC<LiveTranscriptHUDProps> = ({
  messages,
  activeTools,
  onSendMessage,
  isSendingMessage = false,
  activeBrandVoice,
  theme = 'glass'
}) => {
  const isGlass = theme === 'glass';
  const [typedInput, setTypedInput] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDownloadDossier = async () => {
    if (messages.length === 0) return;

    const company = activeBrandVoice?.companyName || 'Veloce AgenticOS';
    const companySafe = company.replace(/[^a-zA-Z0-9_-]/g, '_');
    const now = new Date();

    const allText = messages.map((m) => m.text).join(' ');
    const hasConsultation = /september|consultation|scheduled|call|booking|meeting|sept/i.test(allText);
    const hasFreeTier = /free tier|generous free|resources/i.test(allText);
    const hasBudget = /\$10|\$5k|budget|fee|platform fee/i.test(allText);
    const hasTimeline = /30 days|timeline|month|launch/i.test(allText);

    const markdown = `# 📋 StratosGTM: Strategy Briefing & Consultation Reference Dossier

**Client / Brand:** ${company}  
**Tone Archetype:** ${activeBrandVoice?.toneLabel || 'Tactical Operator'}  
**Date Generated:** ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}  
**Lead Growth Operating Architect:** Anna (GrowthOS Senior Advisor)  

---

## 🎯 Executive Summary & Mission Scope
* **Core Vision:** Transition from a solo entrepreneurship to a public-facing powerhouse with high inbound funnel velocity.
* **Launch Horizon:** ${hasTimeline ? '30-Day Growth Sprint' : 'Immediate Inbound Rollout'}.
* **Acquisition Playbook:** ${
      hasFreeTier
        ? 'Deploy generous free-tier resources to capture market attention and build trust without burning personal capital.'
        : 'High-ticket inbound qualification and automated booking.'
    }
* **Operational Strategy:** Utilize local-first agent loops, intelligent model routing, and persistent Obsidian memory to keep operational overhead near-zero.

---

## 💰 Commercial Parameters & Budget Guardrails
* **Initial Platform Budget:** ${hasBudget ? '$10 platform fee target (lean bootstrapper mode)' : 'To be finalized in strategy consultation'}.
* **Efficiency Mandate:** Zero manual hustle; automate lead intake, qualification, and calendar reservations hands-off.
* **Scaling Milestone:** Migrate from lightweight local routing into dedicated high-ticket managed infrastructure as paying client volume expands.

---

## 📅 Consultation Request
* **Status:** ${
      hasConsultation
        ? 'Requested on this call — not yet confirmed by the team. See the transcript below for the exact date, time and details discussed.'
        : 'Not requested on this call.'
    }
* **Format:** 1-on-1 Strategic Architecture & Model Routing Consultation

---

## 🛠️ Key References & Architecture Stack
* **Operating Layer:** Veloce AgenticOS (local-first layer for Claude Code, Codex, Antigravity, Ollama).
* **Voice Inbound Engine:** StratosGTM with AssemblyAI Voice Agent API (24kHz PCM16).
* **Persistent Memory:** Local Obsidian Knowledge Vault with automated dossier synchronization.
* **Reasoning Engine:** DeepSeek LLM with multi-turn context retention.

---

## 📝 Complete Verbatim Dialogue Transcript

${messages
  .map(
    (m) =>
      `### ${
        m.speaker === 'user'
          ? '👤 Operator / Prospect'
          : m.speaker === 'agent'
          ? '🤖 Growth AI (Anna)'
          : '⚙️ System'
      } [${m.timestamp}]\n${m.text || (m.isPartial ? '*(In-flight spoken turn)*' : '')}\n`
  )
  .join('\n')}

---
*Generated autonomously by StratosGTM • Local-First Sovereign AI Growth Operator*
`;

    // 1. Trigger browser file download
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${companySafe}_Strategy_Briefing_${now.toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // 2. Mirror into Obsidian vault via orchestrator
    try {
      await fetch(apiUrl('/api/crm/export-dossier'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          companyName: company,
          fileName: `${companySafe}_Strategy_Briefing.md`
        })
      });
    } catch (e) {
      console.warn('[Failed to mirror dossier to vault]', e);
    }

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3500);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedInput.trim() || isSendingMessage) return;
    const text = typedInput.trim();
    setTypedInput('');
    if (onSendMessage) {
      await onSendMessage(text);
    }
  };

  return (
    <div className={`flex flex-col h-full rounded-2xl border backdrop-blur-xl overflow-hidden shadow-2xl transition-all ${
      isGlass ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90 shadow-[0_12px_40px_rgba(40,30,20,0.04)] text-slate-800' : 'bg-slate-900/60 border-slate-800/80 text-slate-100'
    }`}>
      {/* HUD Header */}
      <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b ${
        isGlass ? 'border-[#e8e4dc]/80 bg-[#f7f3ea]/80' : 'border-slate-800/80 bg-slate-950/40'
      }`}>
        <div className="flex items-center space-x-2.5">
          <Bot className={`w-5 h-5 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
          <h3 className={`text-sm font-semibold tracking-wide ${isGlass ? 'text-slate-900' : 'text-slate-200'}`}>
            Real-Time Spoken Interaction Stream
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Download Strategic Briefing & References Button */}
          <button
            type="button"
            onClick={handleDownloadDossier}
            disabled={messages.length === 0}
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold border shadow-xs transition-all disabled:opacity-40 ${
              downloadSuccess
                ? 'bg-emerald-500 text-white border-emerald-600'
                : isGlass
                ? 'bg-amber-50 hover:bg-amber-100/80 border-amber-200 text-amber-900 shadow-2xs'
                : 'bg-amber-950/70 hover:bg-amber-900/80 border-amber-700/60 text-amber-300'
            }`}
            title="Download complete strategy briefing, references, and scheduled consultation notes (.md)"
          >
            <FileDown className="w-3.5 h-3.5 text-amber-600" />
            <span>
              {downloadSuccess ? '✓ Saved to Vault & Downloaded' : '📥 Download Briefing (.md)'}
            </span>
          </button>

          {activeBrandVoice && (
            <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-xs font-mono border shadow-xs ${
              isGlass ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60'
            }`}>
              <Sparkles className={`w-3 h-3 ${isGlass ? 'text-indigo-600' : 'text-indigo-400'}`} />
              <span className="font-semibold">{activeBrandVoice.companyName}</span>
              <span className={isGlass ? 'text-indigo-600' : 'text-indigo-400/80'}>• {activeBrandVoice.toneLabel}</span>
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${
            isGlass ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-cyan-950/80 text-cyan-400 border-cyan-800/50'
          }`}>
            Full-Duplex VAD
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${
            isGlass ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-purple-950/80 text-purple-300 border-purple-800/50'
          }`}>
            Voice: Anna
          </span>
          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-mono border ${
            isGlass ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/50'
          }`}>
            <Keyboard className="w-3 h-3" />
            <span>Keyboard Active</span>
          </span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 min-h-[400px] max-h-[520px] custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm space-y-2 py-16">
            <Bot className="w-8 h-8 text-slate-400 animate-pulse" />
            <p>Click "Start Voice Session" or type a message below to converse with Anna.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 text-sm ${
                msg.speaker === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.speaker === 'agent' && (
                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isGlass ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                }`}>
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-md transition-all ${
                  msg.isPartial ? (isGlass ? 'ring-2 ring-sky-300/70' : 'ring-2 ring-cyan-500/40') : ''
                } ${
                  msg.speaker === 'user'
                    ? isGlass
                      ? 'bg-sky-50 border border-sky-200 text-sky-950 rounded-tr-none shadow-xs'
                      : 'bg-cyan-600/20 border border-cyan-500/30 text-cyan-50 rounded-tr-none'
                    : msg.speaker === 'system'
                    ? isGlass
                      ? 'bg-slate-100/90 border border-slate-200 text-slate-600 text-xs italic'
                      : 'bg-slate-800/60 border border-slate-700/50 text-slate-400 text-xs italic'
                    : isGlass
                    ? 'bg-[#fdfcf9] border border-[#e8e4dc] text-slate-800 rounded-tl-none shadow-xs'
                    : 'bg-slate-800/80 border border-slate-700/60 text-slate-100 rounded-tl-none'
                }`}
              >
                <div className={`flex items-center justify-between space-x-4 mb-1 text-[11px] font-mono ${
                  isGlass ? 'text-slate-500' : 'opacity-60'
                }`}>
                  <span className="font-semibold uppercase flex items-center space-x-1.5">
                    <span>{msg.speaker === 'user' ? 'Operator / Prospect' : msg.speaker === 'agent' ? 'Growth AI' : 'System'}</span>
                    {msg.isPartial && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-bold uppercase animate-pulse">
                        Live Speaking
                      </span>
                    )}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>
                <p className="leading-relaxed font-sans text-[13.5px]">
                  {msg.text ? (
                    <span>{msg.text}</span>
                  ) : msg.isPartial ? (
                    <span className="inline-flex items-center space-x-1.5 opacity-70 text-xs italic">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.3s]" />
                      <span className="ml-1 font-mono">Listening to voice stream...</span>
                    </span>
                  ) : (
                    <span className="opacity-50 italic">[Voice audio turn]</span>
                  )}
                  {msg.isPartial && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-cyan-500 rounded-xs animate-pulse align-middle" />
                  )}
                </p>
              </div>

              {msg.speaker === 'user' && (
                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isGlass ? 'bg-sky-50 border-sky-200 text-sky-600' : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                }`}>
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>


      {/* Active Tool Executions HUD */}
      {activeTools.length > 0 && (
        <div className={`border-t px-4 py-2.5 space-y-1.5 ${
          isGlass ? 'border-slate-200/80 bg-slate-50/90' : 'border-slate-800/80 bg-slate-950/70'
        }`}>
          <div className={`flex items-center space-x-2 text-xs font-mono ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
            <Wrench className={`w-3.5 h-3.5 ${isGlass ? 'text-emerald-600' : 'text-emerald-400'}`} />
            <span className={`font-semibold ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>Autonomous Tool Orchestration Layer:</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {activeTools.map((tool) => (
              <div
                key={tool.id}
                className={`flex items-center space-x-2 px-2.5 py-1 rounded-lg text-xs font-mono border shadow-xs ${
                  isGlass
                    ? 'bg-white border-emerald-300 text-emerald-800'
                    : 'bg-slate-900 border-emerald-500/40 text-emerald-300 shadow-sm'
                }`}
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${isGlass ? 'text-emerald-600' : 'text-emerald-400'}`} />
                <span className="font-semibold">{tool.name}</span>
                {tool.result && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    isGlass ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {tool.name === 'process_retention_offer'
                      ? 'Clamped 15% (Policy)'
                      : tool.name === 'enrich_prospect_dossier'
                      ? 'Saved to Vault & CRM'
                      : 'Synced CRM'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Text & Keyboard Input Bar */}
      <div className={`border-t p-3 space-y-2 ${
        isGlass ? 'border-slate-200/80 bg-slate-50/95' : 'border-slate-800/80 bg-slate-950/95'
      }`}>
        {/* Quick Answer Chips */}
        <div className={`flex items-center space-x-1.5 overflow-x-auto pb-1 text-[11px] font-mono scrollbar-none ${
          isGlass ? 'text-slate-600' : 'text-slate-400'
        }`}>
          <span className={`font-semibold flex-shrink-0 flex items-center space-x-1 ${isGlass ? 'text-slate-700' : 'text-slate-500'}`}>
            <Sparkles className={`w-3 h-3 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
            <span>Suggestions:</span>
          </span>
          <button
            type="button"
            onClick={() => setTypedInput('My email is founder@mygrowthproject.com and phone is +1 (555) 234-5678')}
            className={`px-2 py-0.5 rounded border text-xs transition-all flex-shrink-0 ${
              isGlass
                ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-sky-850 shadow-2xs'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-cyan-300 hover:text-cyan-200'
            }`}
          >
            📧 Attach Email & Phone
          </button>
          <button
            type="button"
            onClick={() => setTypedInput('We have 15,000 members and $5,000 budget, looking to launch a $2,997 program in 3 weeks')}
            className={`px-2 py-0.5 rounded border text-xs transition-all flex-shrink-0 ${
              isGlass
                ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-purple-850 shadow-2xs'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-purple-300 hover:text-purple-200'
            }`}
          >
            💰 $5k Budget & 15k Members
          </button>
          <button
            type="button"
            onClick={() => setTypedInput('How does your 14-day action-based guarantee work?')}
            className={`px-2 py-0.5 rounded border text-xs transition-all flex-shrink-0 ${
              isGlass
                ? 'bg-[#fdfcf9] hover:bg-white border-[#e2ded5] text-amber-850 shadow-2xs'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-amber-300 hover:text-amber-200'
            }`}
          >
            🛡️ 14-Day Guarantee
          </button>
        </div>

        {/* Keyboard Input Form */}
        <form onSubmit={handleSend} className="flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder="Type your email, phone, project details, or questions to Anna..."
              className={`w-full pl-3.5 pr-20 py-2.5 rounded-xl border text-xs font-mono transition-all ${
                isGlass
                  ? 'bg-[#fdfcf9] border-[#e2ded5] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 shadow-xs'
                  : 'bg-slate-900 border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500'
              }`}
            />
            <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono pointer-events-none ${
              isGlass ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Press ↵
            </span>
          </div>

          <button
            type="submit"
            disabled={!typedInput.trim() || isSendingMessage}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg disabled:opacity-40 transition-all flex-shrink-0 ${
              isGlass
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-500/20'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/20'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

