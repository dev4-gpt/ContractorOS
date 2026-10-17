import React, { useState } from 'react';
import {
  Code,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Layers,
  Palette,
  Compass,
  X,
  Globe
} from 'lucide-react';

interface EmbedWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCompany?: string;
  defaultClientId?: string;
  isGlass?: boolean;
}

export const EmbedWidgetModal: React.FC<EmbedWidgetModalProps> = ({
  isOpen,
  onClose,
  defaultCompany = 'Acme Coaching Co.',
  defaultClientId = 'lead_ak_901',
  isGlass = true
}) => {
  const [company, setCompany] = useState<string>(defaultCompany);
  const [clientId, setClientId] = useState<string>(defaultClientId);
  const [accent, setAccent] = useState<string>('#d4af37');
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const scriptTag = `<script\n  src="http://localhost:4000/embed.js"\n  data-company="${company}"\n  data-client-id="${clientId}"\n  data-accent="${accent}"\n  data-position="${position}">\n</script>`;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(scriptTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const ACCENTS = [
    { label: 'Warm Gold / Cream', color: '#d4af37' },
    { label: 'Electric Cyan', color: '#06b6d4' },
    { label: 'Emerald Mint', color: '#10b981' },
    { label: 'Vivid Rose', color: '#f43f5e' },
    { label: 'Cyber Violet', color: '#a855f7' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div
        className={`relative w-full max-w-3xl rounded-3xl border shadow-2xl p-6 sm:p-8 my-8 transition-all max-h-[90vh] overflow-y-auto ${
          isGlass
            ? 'bg-[#121217]/95 border-white/10 text-slate-100 shadow-[0_20px_70px_rgba(0,0,0,0.6)]'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-2xl'
        }`}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-mono font-semibold mb-3">
            <Globe className="w-3.5 h-3.5" />
            <span>1-CLICK B2B EMBEDDABLE WIDGET</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-sky-200 bg-clip-text text-transparent">
            Embed Anna Spoken Agent on Any Website
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Paste one line of HTML into Webflow, Framer, WordPress, Shopify, or React. Prospective clients can speak directly to Anna with zero friction.
          </p>
        </div>

        {/* Customization Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-400 font-semibold">Client / Company Name</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-sky-400/60 font-medium"
              placeholder="e.g. Acme Studio"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-400 font-semibold">Client ID / Vault Key</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-sky-400/60 font-medium"
              placeholder="e.g. lead_ak_901"
            />
          </div>
        </div>

        {/* Accent & Position Picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-400 font-semibold flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-sky-400" />
              <span>Brand Accent Theme</span>
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENTS.map((item) => (
                <button
                  key={item.color}
                  onClick={() => setAccent(item.color)}
                  className={`w-7 h-7 rounded-full transition-all flex items-center justify-center border ${
                    accent === item.color ? 'scale-110 border-white ring-2 ring-white/30' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: item.color }}
                  title={item.label}
                >
                  {accent === item.color && <Check className="w-3.5 h-3.5 text-black" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-400 font-semibold flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span>Widget Placement</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setPosition('bottom-right')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono font-semibold transition-all border ${
                  position === 'bottom-right'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                Bottom Right
              </button>
              <button
                onClick={() => setPosition('bottom-left')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono font-semibold transition-all border ${
                  position === 'bottom-left'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                Bottom Left
              </button>
            </div>
          </div>
        </div>

        {/* Snippet Code Box */}
        <div className="relative rounded-2xl bg-black/60 border border-white/10 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-sky-400" />
              <span>Universal Embed Snippet (Paste into &lt;body&gt; or &lt;head&gt;)</span>
            </span>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono font-bold text-white flex items-center gap-1.5 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Code'}</span>
            </button>
          </div>
          <pre className="text-xs font-mono text-sky-300 overflow-x-auto p-2 bg-black/40 rounded-xl leading-relaxed">
            {scriptTag}
          </pre>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/10">
          <div className="text-xs text-slate-400">
            Zero external dependencies • Low latency AssemblyAI WebRTC bridge • 100% responsive
          </div>
          <a
            href="http://localhost:4000/widget-preview"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-200 hover:from-amber-300 hover:to-amber-100 text-slate-950 font-extrabold font-mono text-xs flex items-center gap-2 shadow-lg shadow-amber-400/20 transition-all"
          >
            <span>Test Live in Customer Sandbox</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
