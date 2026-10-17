import React, { useState, useEffect } from 'react';
import { apiUrl } from '../config/api';
import { PLANS, usd } from '../pages/plans';
import {
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
  Code,
  Download,
  ExternalLink,
  Layers,
  Edit3,
  Check,
  RotateCcw,
  Wand2,
  Globe,
  Eye,
  Sliders,
  Play
} from 'lucide-react';

interface InstaticVisualEditorProps {
  companyName?: string;
  initialTopic?: string;
  contentSummary?: {
    thesis?: string;
    hook?: string;
    coreProblem?: string;
    tacticalFramework?: string[];
  };
  isGlass?: boolean;
}

export const InstaticVisualEditor: React.FC<InstaticVisualEditorProps> = ({
  companyName = 'Acme Coaching Co.',
  initialTopic = 'Lead Generation & High-Ticket Sprints',
  contentSummary,
  isGlass = true
}) => {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [pageDoc, setPageDoc] = useState<any | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeText, setSelectedNodeText] = useState<string>('');
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Fetch or generate initial page document
  useEffect(() => {
    const fetchOrCreatePage = async () => {
      try {
        const res = await fetch(apiUrl(`/api/instatic/pages?company=${encodeURIComponent(companyName)}`));
        const data = await res.json();
        if (data.status === 'success' && data.pages && data.pages.length > 0) {
          setPageDoc(data.pages[0]);
          return;
        }

        // Generate page
        const genRes = await fetch(apiUrl('/api/instatic/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName,
            title: initialTopic,
            thesis: contentSummary?.thesis,
            hook: contentSummary?.hook,
            coreProblem: contentSummary?.coreProblem,
            tacticalFramework: contentSummary?.tacticalFramework
          })
        });
        const genData = await genRes.json();
        if (genData.status === 'success') {
          setPageDoc(genData.page);
        }
      } catch (e) {
        console.error('Failed to load Instatic page:', e);
      }
    };

    fetchOrCreatePage();
  }, [companyName, initialTopic]);

  // When a node is selected, update inspector text
  const handleSelectNode = (nodeId: string, currentText: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    setSelectedNodeText(currentText);
    setAiExplanation(null);
  };

  // Direct text edit
  const handleSaveTextEdit = async () => {
    if (!pageDoc || !selectedNodeId) return;
    try {
      const res = await fetch(apiUrl('/api/instatic/patch-node'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: pageDoc.id,
          nodeId: selectedNodeId,
          newProps: { text: selectedNodeText }
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setPageDoc(data.page);
      }
    } catch (e) {
      console.error('Failed to patch node:', e);
    }
  };

  // AI Refinement via Anna / DeepSeek
  const handleAiAssist = async (customPrompt?: string) => {
    const promptToUse = customPrompt || aiPrompt;
    if (!pageDoc || !selectedNodeId || !promptToUse.trim() || isAiLoading) return;

    setIsAiLoading(true);
    try {
      const res = await fetch(apiUrl('/api/instatic/ai-assist'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: pageDoc.id,
          nodeId: selectedNodeId,
          prompt: promptToUse
        })
      });
      const data = await res.json();
      if (data.status === 'success' && data.page) {
        setPageDoc(data.page);
        setAiExplanation(data.explanation || 'Refined with Anna GrowthOS guidelines.');
        // Update local text
        const findText = (node: any): string | null => {
          if (node.id === selectedNodeId) return node.props.text;
          if (node.children) {
            for (const c of node.children) {
              const res = findText(c);
              if (res) return res;
            }
          }
          return null;
        };
        for (const sec of data.page.sections) {
          const t = findText(sec);
          if (t) {
            setSelectedNodeText(t);
            break;
          }
        }
      }
    } catch (e: any) {
      console.error('AI assist failed:', e);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Viewport widths
  const containerWidthClass =
    viewport === 'mobile' ? 'max-w-[375px]' : viewport === 'tablet' ? 'max-w-[768px]' : 'w-full max-w-[1100px]';

  // Fallback hero if loading
  const heroSec = pageDoc?.sections?.find((s: any) => s.type === 'section' && s.name.includes('Hero'));
  const widgetSec = pageDoc?.sections?.find((s: any) => s.id.includes('voice_widget'));
  const pillarsSec = pageDoc?.sections?.find((s: any) => s.id.includes('pillars'));

  const compiledHtml = pageDoc
    ? `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${pageDoc.title} | ${pageDoc.companyName}</title>\n</head>\n<body>\n  <!-- Built with Instatic & StratosGTM -->\n</body>\n</html>`
    : '';

  return (
    <div className="flex flex-col h-full rounded-2xl overflow-hidden border border-white/10 bg-[#09090d]">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              Instatic Visual Studio
            </span>
          </div>
          <span className="text-xs text-slate-500">|</span>
          <span className="text-xs text-amber-300 font-mono font-medium">{companyName}</span>
        </div>

        {/* Viewport Breakpoint Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/10">
          <button
            onClick={() => setViewport('desktop')}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              viewport === 'desktop' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'text-slate-400 hover:text-white'
            }`}
            title="Desktop Viewport (1200px)"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewport('tablet')}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              viewport === 'tablet' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'text-slate-400 hover:text-white'
            }`}
            title="Tablet Viewport (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewport('mobile')}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              viewport === 'mobile' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'text-slate-400 hover:text-white'
            }`}
            title="Mobile Viewport (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {pageDoc && (
            <a
              href={`/api/instatic/preview/${pageDoc.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-all"
            >
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              <span>Full Preview</span>
            </a>
          )}
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 transition-all"
            title="Open standalone self-hosted Instatic CMS server (Bun runtime)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Instatic Server (Port 3001)</span>
          </a>
        </div>
      </div>

      {/* Main Workspace: Split Canvas & AI Inspector */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Visual Canvas (Center) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-black/40">
          <div
            className={`transition-all duration-300 rounded-2xl border border-white/10 bg-[#09090b] shadow-2xl p-6 sm:p-10 ${containerWidthClass} flex flex-col gap-8`}
          >
            {/* Hero Section */}
            {heroSec && (
              <div className="text-center flex flex-col items-center gap-4 py-8 border-b border-white/5 relative group">
                {heroSec.children?.map((child: any) => {
                  const isSelected = selectedNodeId === child.id;
                  if (child.semanticTag === 'span') {
                    return (
                      <span
                        key={child.id}
                        onClick={(e) => handleSelectNode(child.id, child.props.text, e)}
                        className={`inline-block text-xs font-mono font-bold px-3 py-1 rounded-full cursor-pointer transition-all ${
                          isSelected
                            ? 'ring-2 ring-amber-400 bg-amber-400/30 text-white'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                        }`}
                      >
                        {child.props.text}
                      </span>
                    );
                  }
                  if (child.semanticTag === 'h1') {
                    return (
                      <h1
                        key={child.id}
                        onClick={(e) => handleSelectNode(child.id, child.props.text, e)}
                        className={`text-2xl sm:text-4xl font-extrabold text-white cursor-pointer tracking-tight max-w-2xl transition-all rounded-lg p-2 ${
                          isSelected ? 'ring-2 ring-amber-400 bg-white/5' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {child.props.text}
                      </h1>
                    );
                  }
                  if (child.semanticTag === 'p') {
                    return (
                      <p
                        key={child.id}
                        onClick={(e) => handleSelectNode(child.id, child.props.text, e)}
                        className={`text-sm sm:text-base text-slate-400 max-w-xl cursor-pointer transition-all rounded-lg p-2 ${
                          isSelected ? 'ring-2 ring-amber-400 bg-white/5' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {child.props.text}
                      </p>
                    );
                  }
                  if (child.type === 'container') {
                    return (
                      <div key={child.id} className="flex flex-wrap items-center justify-center gap-3 mt-2">
                        {child.children?.map((btn: any) => (
                          <div
                            key={btn.id}
                            onClick={(e) => handleSelectNode(btn.id, btn.props.text, e)}
                            className={`px-5 py-2.5 rounded-full text-xs font-bold cursor-pointer transition-all ${
                              btn.id.includes('primary')
                                ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20'
                                : 'bg-white/10 text-white border border-white/20 hover:bg-white/15'
                            } ${selectedNodeId === btn.id ? 'ring-2 ring-amber-300' : ''}`}
                          >
                            {btn.props.text}
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {/* Spoken Voice Agent Embed Section */}
            {widgetSec && (
              <div className="p-6 rounded-2xl bg-[#121217] border border-amber-400/30 flex flex-col items-center text-center gap-3 relative shadow-[0_0_25px_rgba(212,175,55,0.1)]">
                <div className="w-12 h-12 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(212,175,55,0.3)] animate-pulse">
                  🎙️
                </div>
                <div className="text-sm font-bold text-white">
                  {widgetSec.children?.find((c: any) => c.semanticTag === 'h3')?.props.text || 'Spoken Inbound AI Voice Operator Active'}
                </div>
                <div className="text-xs text-slate-400 max-w-md">
                  {widgetSec.children?.find((c: any) => c.semanticTag === 'p')?.props.text ||
                    'Prospective clients can speak to Anna directly via the floating orb in the bottom-right.'}
                </div>
                <div className="px-3 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono text-amber-300">
                  &lt;script src="http://localhost:4000/embed.js" data-company="{companyName}"&gt;&lt;/script&gt;
                </div>
              </div>
            )}

            {/* 3 Value Pillars */}
            {pillarsSec && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
                {pillarsSec.children?.[0]?.children?.map((col: any) => (
                  <div
                    key={col.id}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-2"
                  >
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {col.children?.[0]?.props.text || '01.'}
                    </span>
                    <h4
                      onClick={(e) => handleSelectNode(col.children?.[1]?.id, col.children?.[1]?.props.text, e)}
                      className={`text-sm font-bold text-white cursor-pointer rounded p-1 ${
                        selectedNodeId === col.children?.[1]?.id ? 'ring-2 ring-amber-400 bg-white/5' : 'hover:bg-white/5'
                      }`}
                    >
                      {col.children?.[1]?.props.text || 'Pillar Item'}
                    </h4>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Node Inspector & Anna AI Co-Pilot */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0d0d12] p-5 flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300 uppercase tracking-wider mb-2">
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span>Node Inspector</span>
            </div>
            {selectedNodeId ? (
              <div className="space-y-3">
                <div className="text-[11px] font-mono text-slate-500 truncate">Node ID: {selectedNodeId}</div>
                <textarea
                  value={selectedNodeText}
                  onChange={(e) => setSelectedNodeText(e.target.value)}
                  className="w-full h-24 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400/60 font-medium resize-none"
                  placeholder="Selected text..."
                />
                <button
                  onClick={handleSaveTextEdit}
                  className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-mono font-bold text-white transition-all border border-white/10"
                >
                  Save Text Update
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-slate-500 text-center">
                Click any headline, paragraph, or button on the canvas to inspect and edit.
              </div>
            )}
          </div>

          {/* Anna AI Visual Co-Pilot */}
          <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Anna AI Co-Pilot</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold">
                DEEPSEEK
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Prompt Anna to rewrite the selected node according to GrowthOS conversion benchmarks.
            </p>

            {/* Quick Prompts */}
            <div className="flex flex-col gap-1.5">
              {[
                'Make headline 3x punchier & urgent',
                `Anchor high-ticket ${usd((PLANS.find((p) => p.id === 'pro') ?? PLANS[0]).priceMonthlyUsd)}/mo Pro pricing`,
                'Inject objection reframe: "No complex setup"',
                'Tone down hype & use elite advisory tone'
              ].map((chip) => (
                <button
                  key={chip}
                  disabled={!selectedNodeId || isAiLoading}
                  onClick={() => handleAiAssist(chip)}
                  className="text-left text-[11px] font-mono px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-400/10 text-slate-300 hover:text-amber-200 border border-white/5 hover:border-amber-400/30 transition-all disabled:opacity-40"
                >
                  ⚡ {chip}
                </button>
              ))}
            </div>

            {/* Custom AI Prompt Input */}
            <div className="space-y-2 mt-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                disabled={!selectedNodeId || isAiLoading}
                placeholder={selectedNodeId ? 'Custom prompt for Anna...' : 'Select a node first...'}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400/60 font-medium disabled:opacity-40"
              />
              <button
                onClick={() => handleAiAssist()}
                disabled={!selectedNodeId || !aiPrompt.trim() || isAiLoading}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-200 hover:from-amber-300 hover:to-amber-100 text-slate-950 font-extrabold font-mono text-xs flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-40"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{isAiLoading ? 'Anna is Refining Node...' : 'Apply Anna AI Refinement'}</span>
              </button>
            </div>

            {/* AI Explanation Banner */}
            {aiExplanation && (
              <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-xs text-amber-200 animate-fade-in">
                <strong>Anna's Rationale:</strong> {aiExplanation}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
