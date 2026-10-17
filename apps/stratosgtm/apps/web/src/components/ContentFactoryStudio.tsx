import React, { useState } from 'react';
import { apiUrl } from '../config/api';
import { ContentFactoryJob, SocialPlatformLinks } from '@voice-os/shared';
import {
  Search,
  CheckCircle2,
  Send,
  Copy,
  Check,
  Twitter,
  Linkedin,
  Instagram,
  Youtube,
  Mail,
  Video,
  AlertTriangle,
  Flame,
  Maximize2,
  Minimize2,
  ExternalLink,
  FileText,
  Sparkles,
  Target,
  Clock,
  TrendingDown,
  ShieldAlert,
  Mic,
  PlusCircle,
  X,
  Share2,
  Key,
  Radio,
  Zap,
  Globe
} from 'lucide-react';
import { InstaticVisualEditor } from './InstaticVisualEditor';

interface ContentFactoryStudioProps {
  jobs: ContentFactoryJob[];
  onTriggerJob: (topic: string) => Promise<void>;
  onTriggerAudit?: (params: {
    companyOrCreator: string;
    website?: string;
    triggerEvent: string;
    socialLinks?: SocialPlatformLinks;
    socialBioText?: string;
  }) => Promise<void>;
  onApproveJob: (id: string) => Promise<void>;
  theme?: 'glass' | 'cyber';
  activeCompanyName?: string;
  onOpenCredentialsModal?: () => void;
}

export const ContentFactoryStudio: React.FC<ContentFactoryStudioProps> = ({
  jobs,
  onTriggerJob,
  onTriggerAudit,
  onApproveJob,
  theme = 'glass',
  activeCompanyName = 'Acme Coaching Co.',
  onOpenCredentialsModal
}) => {
  const [isPublishingSocial, setIsPublishingSocial] = useState(false);
  const [publishReceipts, setPublishReceipts] = useState<any[] | null>(null);
  const [isAutoPipelineRunning, setIsAutoPipelineRunning] = useState(false);
  const [autoPipelineResult, setAutoPipelineResult] = useState<any | null>(null);

  const handlePublishToSocial = async (target: 'twitter' | 'linkedin' | 'substack' | 'all') => {
    try {
      setIsPublishingSocial(true);
      setPublishReceipts(null);
      const platforms = target === 'all' ? ['twitter', 'linkedin', 'substack'] : [target];

      const res = await fetch(apiUrl('/api/content/publish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: activeCompanyName,
          platforms,
          content: {
            thesis: pack?.thesis || 'Autonomous Inbound Scaling',
            twitterThread: pack?.twitterThread,
            linkedInPost: pack?.linkedInPost ? `${pack.linkedInPost.hook}\n\n${pack.linkedInPost.bodyMarkdown}\n\n${pack.linkedInPost.takeaways.map(t => '• ' + t).join('\n')}` : undefined,
            newsletterMarkdown: pack?.newsletter?.bodyMarkdown
          },
          source: 'content_factory_studio'
        })
      });

      const data = await res.json();
      if (data.status === 'success') {
        setPublishReceipts(data.result?.receipts || []);
      } else {
        alert(data.error || 'Failed to publish');
      }
    } catch (e: any) {
      alert('Publishing error: ' + e.message);
    } finally {
      setIsPublishingSocial(false);
    }
  };

  const handleRunAutonomousPipeline = async () => {
    try {
      setIsAutoPipelineRunning(true);
      setAutoPipelineResult(null);

      const res = await fetch(apiUrl('/api/content/auto-pipeline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: activeCompanyName,
          transcriptExcerpt: selectedJob?.contentPack?.thesis || selectedJob?.leadMagnetAudit?.leadMagnetTitle || 'Automated high-ticket inbound funnel qualification',
          platforms: ['twitter', 'linkedin', 'substack']
        })
      });

      const data = await res.json();
      if (data.status === 'success') {
        setAutoPipelineResult(data.result);
        setPublishReceipts(data.result?.publishBatch?.receipts || []);
      } else {
        alert(data.error || 'Pipeline execution failed');
      }
    } catch (e: any) {
      alert('Pipeline error: ' + e.message);
    } finally {
      setIsAutoPipelineRunning(false);
    }
  };
  const isGlass = theme === 'glass';
  const [selectedJobId, setSelectedJobId] = useState<string>(jobs[0]?.id || '');
  const [activeAssetTab, setActiveAssetTab] = useState<'twitter' | 'linkedin' | 'instagram' | 'newsletter' | 'webinar' | 'instatic'>('twitter');
  const [activeOutreachTab, setActiveOutreachTab] = useState<'voice_script' | 'email' | 'linkedin' | 'lead_magnet'>('voice_script');
  const [copiedIndex, setCopiedIndex] = useState<string | number | null>(null);
  const [customTopic, setCustomTopic] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFullscreenNewsletter, setIsFullscreenNewsletter] = useState(false);

  // New SOP Audit Modal / Drawer State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditCompany, setAuditCompany] = useState('Acme Coaching Co.');
  const [auditWebsite, setAuditWebsite] = useState('https://acmecoaching.example');
  const [auditTrigger, setAuditTrigger] = useState('Launched $2,997 Pro Career Sprint + Hiring First SDR on LinkedIn');
  const [auditTwitter, setAuditTwitter] = useState('https://x.com/alexkim_coaching');
  const [auditLinkedIn, setAuditLinkedIn] = useState('https://linkedin.com/in/alexkim-coaching');
  const [auditYouTube, setAuditYouTube] = useState('https://youtube.com/@acmecoaching');
  const [auditInstagram, setAuditInstagram] = useState('https://instagram.com/acmecoaching');
  const [auditSubstack, setAuditSubstack] = useState('https://alexkim.substack.com');
  const [auditSocialBio, setAuditSocialBio] = useState(
    'Founder of Acme Coaching Co. (15k UI/UX designer community, 120k newsletter readers). Transitioning from $47 ebook sales into high-ticket $2,997 Pro Career Sprints and $10k/mo agency retainers. Needs 24/7 after-hours voice qualification to handle European and Asian inbound leads.'
  );

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];
  const isAuditJob = selectedJob?.jobType === 'lead_magnet_audit' || !!selectedJob?.leadMagnetAudit;
  const audit = selectedJob?.leadMagnetAudit;
  const pack = selectedJob?.contentPack;

  const handleCopy = (text: string, id: string | number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleManualTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTopic.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await onTriggerJob(customTopic);
    setCustomTopic('');
    setIsSubmitting(false);
  };

  const handleAuditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditCompany.trim() || isSubmitting) return;
    setIsSubmitting(true);
    if (onTriggerAudit) {
      await onTriggerAudit({
        companyOrCreator: auditCompany,
        website: auditWebsite,
        triggerEvent: auditTrigger,
        socialLinks: {
          twitter: auditTwitter,
          linkedin: auditLinkedIn,
          youtube: auditYouTube,
          instagram: auditInstagram,
          substack: auditSubstack
        },
        socialBioText: auditSocialBio
      });
    }
    setIsSubmitting(false);
    setIsAuditModalOpen(false);
  };

  const wordCount = pack?.newsletter?.bodyMarkdown ? pack.newsletter.bodyMarkdown.split(/\s+/).length : 0;
  const readTimeMin = Math.max(1, Math.round(wordCount / 200));

  const mailtoUrl = pack?.newsletter
    ? `mailto:?subject=${encodeURIComponent(pack.newsletter.subjectLine)}&body=${encodeURIComponent(
        pack.newsletter.bodyMarkdown + '\n\n' + pack.newsletter.callToAction
      )}`
    : '#';

  const coldEmailMailtoUrl = audit?.outreachSequence?.coldEmail
    ? `mailto:?subject=${encodeURIComponent(audit.outreachSequence.coldEmail.subject)}&body=${encodeURIComponent(
        audit.outreachSequence.coldEmail.bodyMarkdown
      )}`
    : '#';

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Top Banner: Dual Engine Switcher & Quick Launch */}
      <div className={`flex flex-col md:flex-row items-start md:items-center justify-between p-5 rounded-2xl border backdrop-blur-xl shadow-2xl gap-4 transition-all ${
        isGlass
          ? 'bg-[#fdfcf9]/80 border-[#e8e4dc]/90 shadow-[0_12px_40px_rgba(40,30,20,0.04)] text-slate-800'
          : 'bg-gradient-to-r from-purple-950/40 via-slate-900/60 to-cyan-950/40 border-purple-800/40 text-slate-100'
      }`}>
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <Sparkles className={`w-5 h-5 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
            <h2 className={`text-base font-bold tracking-tight ${isGlass ? 'text-slate-900' : 'text-white'}`}>
              Hermes Growth Studio: Inbound Audit & Multi-Channel Syndication
            </h2>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
              isGlass ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
            }`}>
              SOP Engine Active
            </span>
          </div>
          <p className={`text-xs ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
            Generate 5-Point Inbound Audits, Revenue Leakage Estimates, and Multi-Platform Campaigns from customer voice signals and social footprints.
          </p>
        </div>

        {/* Action Controls: New SOP Audit or Spoken Content Trigger */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenCredentialsModal?.()}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
              isGlass
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                : 'bg-amber-950/40 text-amber-300 border-amber-700/60 hover:bg-amber-900/50'
            }`}
            title="Manage isolated cloud API keys & webhooks for this client"
          >
            <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Connected Platforms & Keys</span>
          </button>

          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Target className="w-3.5 h-3.5" />
            <span>Run SOP Lead Audit & Magnet</span>
          </button>

          <form onSubmit={handleManualTrigger} className="flex items-center space-x-1.5">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Spoken objection topic..."
              className={`px-3 py-2 rounded-xl border text-xs font-mono w-56 transition-all ${
                isGlass
                  ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500'
                  : 'bg-slate-950/80 border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500'
              }`}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
              title="Launch Hermes Content Pack"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Pack</span>
            </button>
          </form>
        </div>
      </div>

      {/* Autonomous Social Pipeline & Cloud Dispatch Ribbon */}
      <div className={`p-4 rounded-2xl border backdrop-blur-xl transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
        isGlass
          ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90 shadow-[0_8px_30px_rgba(40,30,20,0.03)] text-slate-800'
          : 'bg-slate-900/80 border-slate-800/80 text-slate-100'
      }`}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
            <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
            <span>Autonomous Pipeline:</span>
          </span>

          <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
            <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 font-semibold border border-sky-300 dark:border-sky-800">
              1. Research Vault
            </span>
            <span>➔</span>
            <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 font-semibold border border-purple-300 dark:border-purple-800">
              2. Anna Voice Consult
            </span>
            <span>➔</span>
            <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 font-semibold border border-indigo-300 dark:border-indigo-800">
              3. Omnichannel Studio
            </span>
            <span>➔</span>
            <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800">
              4. Cloud Social Dispatch
            </span>
          </div>

          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 ml-1">
            Client: {activeCompanyName}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRunAutonomousPipeline}
            disabled={isAutoPipelineRunning}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Zap className={`w-3.5 h-3.5 ${isAutoPipelineRunning ? 'animate-spin' : ''}`} />
            <span>{isAutoPipelineRunning ? 'Running Pipeline...' : 'Run Autonomous Sync'}</span>
          </button>
        </div>
      </div>

      {/* Live Social Publication Notification Banner */}
      {publishReceipts && publishReceipts.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 shadow-md space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold font-mono">
                Dispatched {publishReceipts.filter(r => r.status === 'published').length}/{publishReceipts.length} Posts to Connected Platforms ({activeCompanyName}):
              </span>
            </div>
            <button
              onClick={() => setPublishReceipts(null)}
              className="text-xs text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 hover:underline"
            >
              Dismiss
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {publishReceipts.map((r, idx) => (
              <a
                key={idx}
                href={r.postUrl || '#'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-xs font-mono font-semibold shadow-xs hover:border-emerald-500 transition-all"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <span>{r.platform.toUpperCase()} ({r.accountHandle}) — {r.status.toUpperCase()}</span>
                <ExternalLink className="w-3 h-3 text-slate-400 ml-1" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Job Queue & Research Lanes */}
        <div className="lg:col-span-5 space-y-4 flex flex-col">
          {/* Active Jobs Selector */}
          <div className={`p-4 rounded-2xl border backdrop-blur-xl space-y-3 ${
            isGlass ? 'bg-white/80 border-slate-200/90 shadow-sm text-slate-800' : 'bg-slate-900/60 border-slate-800/80 text-slate-100'
          }`}>
            <div className={`flex items-center justify-between text-xs font-mono ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
              <span className={`font-semibold uppercase ${isGlass ? 'text-slate-800' : 'text-slate-300'}`}>Active Pipeline Deliverables:</span>
              <span>{jobs.length} Runs</span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {jobs.map((job) => {
                const isAudit = job.jobType === 'lead_magnet_audit' || !!job.leadMagnetAudit;
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all text-xs flex flex-col space-y-1.5 ${
                      selectedJob?.id === job.id
                        ? isGlass
                          ? isAudit
                            ? 'bg-sky-50 border-sky-300 text-sky-950 shadow-xs'
                            : 'bg-purple-50 border-purple-300 text-purple-950 shadow-xs'
                          : isAudit
                          ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200 shadow-md'
                          : 'bg-purple-950/40 border-purple-500/60 text-purple-200 shadow-md'
                        : isGlass
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-white'
                        : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate">
                        {isAudit ? (
                          <Target className={`w-3.5 h-3.5 flex-shrink-0 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
                        ) : (
                          <Flame className={`w-3.5 h-3.5 flex-shrink-0 ${isGlass ? 'text-purple-600' : 'text-purple-400'}`} />
                        )}
                        <span className={`font-semibold truncate max-w-[200px] ${isGlass ? 'text-slate-900' : 'text-slate-100'}`}>{job.topic}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold ${
                          job.status === 'published'
                            ? isGlass
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : job.status === 'needs_approval'
                            ? isGlass
                              ? 'bg-amber-50 text-amber-800 border border-amber-200 animate-pulse'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                            : isGlass
                            ? 'bg-sky-50 text-sky-800 border border-sky-200'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        }`}
                      >
                        {job.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className={`flex items-center justify-between text-[11px] font-mono ${isGlass ? 'text-slate-500' : 'text-slate-500'}`}>
                      <span>Type: {isAudit ? 'SOP Lead Audit' : '5-Channel Pack'}</span>
                      <span>Cost: ${job.costUsd?.toFixed(3) || '0.045'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 Parallel Research Lanes Inspector */}
          {selectedJob && (
            <div className={`p-4 rounded-2xl border backdrop-blur-xl space-y-3 flex-1 overflow-y-auto ${
              isGlass ? 'bg-white/80 border-slate-200/90 shadow-sm text-slate-800' : 'bg-slate-900/60 border-slate-800/80 text-slate-100'
            }`}>
              <div className={`flex items-center justify-between text-xs font-mono ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                <div className={`flex items-center space-x-1.5 ${isGlass ? 'text-sky-700' : 'text-cyan-400'}`}>
                  <Search className="w-4 h-4" />
                  <span className={`font-semibold uppercase ${isGlass ? 'text-slate-800' : 'text-slate-300'}`}>
                    Parallel Research Lanes:
                  </span>
                </div>
                <span className={`text-[11px] ${isGlass ? 'text-slate-500' : 'text-slate-500'}`}>Autonomous Synthesis</span>
              </div>

              <div className="space-y-2.5">
                {selectedJob.researchLanes?.map((lane, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border space-y-1.5 ${
                    isGlass ? 'bg-slate-50 border-slate-200/90 text-slate-800' : 'bg-slate-950/70 border-slate-800/80 text-slate-200'
                  }`}>
                    <div className={`flex items-center justify-between text-xs font-semibold ${isGlass ? 'text-slate-900' : 'text-slate-200'}`}>
                      <span>{lane.title}</span>
                      <span className={`text-[10px] font-mono ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>Completed</span>
                    </div>
                    {lane.snippets.map((snip, sIdx) => (
                      <p key={sIdx} className={`text-[11px] italic leading-relaxed ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                        "{snip.excerpt}"
                      </p>
                    ))}
                  </div>
                ))}
              </div>

              {/* Self-Healing Loop Log Card */}
              {selectedJob.selfHealingLogs && selectedJob.selfHealingLogs.length > 0 && (
                <div className={`p-3.5 rounded-xl border space-y-2 mt-3 shadow-xl relative overflow-hidden ${
                  isGlass ? 'bg-amber-50/90 border-amber-300' : 'bg-slate-950/90 border-amber-500/50'
                }`}>
                  <div className={`absolute top-0 right-0 px-2 py-0.5 rounded-bl text-[9px] font-mono font-bold border-b border-l flex items-center space-x-1 ${
                    isGlass ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    <span>DSPy AUTONOMOUS REPAIR</span>
                  </div>
                  <div className={`flex items-center space-x-2 text-xs font-mono font-semibold ${
                    isGlass ? 'text-amber-900' : 'text-amber-300'
                  }`}>
                    <AlertTriangle className={`w-4 h-4 animate-pulse ${isGlass ? 'text-amber-600' : 'text-amber-400'}`} />
                    <span>DeepSeek-R1 Self-Healing Engine:</span>
                  </div>
                  <div className={`rounded-lg p-3 border space-y-2 font-mono text-[11px] ${
                    isGlass ? 'bg-white border-amber-200 text-slate-800' : 'bg-black/80 border-slate-800'
                  }`}>
                    {selectedJob.selfHealingLogs.map((log, lIdx) => (
                      <div key={lIdx} className="space-y-1">
                        <div className="text-rose-600 flex items-start space-x-1.5">
                          <span className="font-bold">▶ FAULT:</span>
                          <span>{log.issueDetected}</span>
                        </div>
                        <div className={`flex items-start space-x-1.5 p-1.5 rounded border ${
                          isGlass ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400'
                        }`}>
                          <span className="font-bold text-emerald-700">✔ REPAIRED:</span>
                          <span>{log.repairApplied}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Deliverable Viewer */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {/* VIEW 1: SOP Outbound Lead Magnet & 5-Point Inbound Conversion Audit */}
          {isAuditJob && audit ? (
            <div className={`p-5 rounded-2xl border backdrop-blur-xl flex flex-col flex-1 shadow-2xl space-y-5 transition-all ${
              isGlass
                ? 'bg-white/80 border-slate-200/90 shadow-[0_12px_40px_rgba(0,0,0,0.05)] text-slate-800'
                : 'bg-slate-900/60 border-cyan-800/50 text-slate-100'
            }`}>
              {/* Header & Approval Gate */}
              <div className={`flex items-start justify-between border-b pb-4 ${
                isGlass ? 'border-[#e8e4dc]/80' : 'border-slate-800'
              }`}>
                <div>
                  <div className={`flex items-center space-x-2 text-xs font-mono uppercase ${
                    isGlass ? 'text-sky-700' : 'text-cyan-400'
                  }`}>
                    <Target className="w-3.5 h-3.5" />
                    <span>SOP Inbound Conversion & Revenue Leakage Audit</span>
                  </div>
                  <h3 className={`text-lg font-bold mt-1 flex items-center space-x-2 ${
                    isGlass ? 'text-slate-900' : 'text-white'
                  }`}>
                    <span>{audit.companyOrCreator}</span>
                    {audit.website && (
                      <a
                        href={audit.website}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-xs flex items-center space-x-1 font-mono font-normal ${
                          isGlass ? 'text-slate-500 hover:text-sky-700' : 'text-slate-400 hover:text-cyan-400'
                        }`}
                      >
                        <span>({audit.website})</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </h3>
                  <div className={`text-xs mt-1 ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                    <span className={`font-mono ${isGlass ? 'text-sky-700 font-semibold' : 'text-cyan-300'}`}>Trigger Event:</span> {audit.triggerEvent}
                  </div>
                </div>

                {!selectedJob.humanApproved ? (
                  <button
                    onClick={() => onApproveJob(selectedJob.id)}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex-shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Outreach Sequence</span>
                  </button>
                ) : (
                  <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-semibold flex-shrink-0 ${
                    isGlass
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                  }`}>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Dispatched to SDR / Voice</span>
                  </div>
                )}
              </div>

              {/* KPI Metrics Strip with Circular Radial Gauge and Leakage Flow Meter */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Annual Revenue Leakage with Visual Flow Meter */}
                <div className={`p-3.5 rounded-xl border space-y-2 shadow-lg relative overflow-hidden ${
                  isGlass
                    ? 'bg-rose-50 border-rose-200 text-rose-950 shadow-xs'
                    : 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/40'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-mono ${isGlass ? 'text-rose-700' : 'text-rose-400'}`}>
                    <div className="flex items-center space-x-1.5">
                      <TrendingDown className="w-4 h-4" />
                      <span>Annual Inbound Leakage</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      isGlass ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-rose-500/20 text-rose-300'
                    }`}>CRITICAL</span>
                  </div>
                  <div className={`text-2xl font-bold tracking-tight font-mono ${isGlass ? 'text-rose-700' : 'text-rose-200'}`}>
                    ${audit.estimatedAnnualRevenueLeakageUsd?.toLocaleString() || '114,000'} <span className={`text-xs font-normal ${isGlass ? 'text-rose-500' : 'text-rose-400'}`}>/ yr</span>
                  </div>
                  {/* Dynamic Visual Leakage Bar */}
                  <div className="space-y-1">
                    <div className={`h-2 w-full rounded-full overflow-hidden flex ${isGlass ? 'bg-slate-200' : 'bg-slate-800'}`}>
                      <div className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 w-[78%] rounded-full animate-pulse" />
                    </div>
                    <div className={`flex justify-between text-[9px] font-mono ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                      <span>Lost: $9.5k/mo</span>
                      <span className={`font-bold ${isGlass ? 'text-rose-700' : 'text-rose-400'}`}>Dropoff Rate: 68%</span>
                    </div>
                  </div>
                </div>

                {/* 2. Circular Radial Audit Gauge */}
                <div className={`p-3.5 rounded-xl border flex items-center justify-between shadow-lg ${
                  isGlass
                    ? 'bg-amber-50 border-amber-200 text-amber-950 shadow-xs'
                    : 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border-amber-500/40'
                }`}>
                  <div className="space-y-1">
                    <div className={`flex items-center space-x-1.5 text-xs font-mono ${isGlass ? 'text-amber-800' : 'text-amber-400'}`}>
                      <ShieldAlert className="w-4 h-4" />
                      <span>Audit Score</span>
                    </div>
                    <div className={`text-lg font-bold ${isGlass ? 'text-amber-900' : 'text-amber-200'}`}>
                      {audit.auditScore || 42} <span className={`text-xs font-normal ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>/ 100</span>
                    </div>
                    <p className={`text-[10px] font-mono ${isGlass ? 'text-amber-800' : 'text-amber-300/80'}`}>3 of 5 Pillars Need AI</p>
                  </div>

                  {/* Circular SVG Gauge */}
                  <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="5" fill="transparent" className={isGlass ? 'text-slate-200' : 'text-slate-800'} />
                      <circle
                        cx="32"
                        cy="32"
                        r="24"
                        stroke="currentColor"
                        strokeWidth="5"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 24}
                        strokeDashoffset={2 * Math.PI * 24 - ((audit.auditScore || 42) / 100) * (2 * Math.PI * 24)}
                        strokeLinecap="round"
                        className={isGlass ? 'text-amber-500' : 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'}
                      />
                    </svg>
                    <span className={`absolute font-mono text-xs font-bold ${isGlass ? 'text-slate-900' : 'text-white'}`}>
                      {audit.auditScore || 42}%
                    </span>
                  </div>
                </div>

              </div>

              {/* Social Footprint & Audience Analysis Box */}
              {audit.socialBioAnalysis && (
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="font-semibold text-slate-300">Client Social Footprint & Audience Analysis:</span>
                    <span className="text-cyan-400">{audit.socialBioAnalysis.identifiedNiche}</span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono">
                    <span className="text-slate-500">Authority Tier:</span> {audit.socialBioAnalysis.estimatedAudienceTier}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {audit.socialLinks?.twitter && (
                      <a
                        href={audit.socialLinks.twitter}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 hover:text-cyan-400"
                      >
                        <Twitter className="w-3 h-3 text-cyan-400" />
                        <span>Twitter/X</span>
                      </a>
                    )}
                    {audit.socialLinks?.linkedin && (
                      <a
                        href={audit.socialLinks.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 hover:text-blue-400"
                      >
                        <Linkedin className="w-3 h-3 text-blue-400" />
                        <span>LinkedIn</span>
                      </a>
                    )}
                    {audit.socialLinks?.youtube && (
                      <a
                        href={audit.socialLinks.youtube}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 hover:text-red-400"
                      >
                        <Youtube className="w-3 h-3 text-red-400" />
                        <span>YouTube</span>
                      </a>
                    )}
                    {audit.socialLinks?.substack && (
                      <a
                        href={audit.socialLinks.substack}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 hover:text-amber-400"
                      >
                        <Mail className="w-3 h-3 text-amber-400" />
                        <span>Substack</span>
                      </a>
                    )}
                    {audit.socialLinks?.instagram && (
                      <a
                        href={audit.socialLinks.instagram}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 hover:text-pink-400"
                      >
                        <Instagram className="w-3 h-3 text-pink-400" />
                        <span>Instagram</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* 5-Point Inbound Conversion Audit Pillars with Segmented Glowing Progress Meters */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-semibold uppercase text-slate-400">
                  <span>5-Point Inbound Conversion Audit Scorecard:</span>
                  <span className="text-cyan-400 text-[11px]">Segmented Reliability Meters</span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {audit.pillars?.map((pillar, pIdx) => {
                    const score = pillar.scoreOutOf10 || 5;
                    const isCritical = pillar.impactLevel === 'critical';
                    const isHigh = pillar.impactLevel === 'high';
                    const barColor = isCritical ? 'bg-rose-500' : isHigh ? 'bg-amber-500' : 'bg-emerald-500';

                    return (
                      <div
                        key={pIdx}
                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200">{pillar.pillarName}</span>
                          <div className="flex items-center space-x-2">
                            <span
                              className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                                isCritical
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : isHigh
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {pillar.impactLevel}
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-300">
                              {score}/10
                            </span>
                          </div>
                        </div>

                        {/* Segmented 10-step progress meter */}
                        <div className="flex items-center space-x-1 py-0.5">
                          {Array.from({ length: 10 }).map((_, idx) => (
                            <div
                              key={idx}
                              className={`h-1.5 flex-1 rounded-sm transition-all ${
                                idx < score
                                  ? `${barColor} shadow-[0_0_4px_currentColor]`
                                  : 'bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>

                        <p className="text-[11px] text-slate-400">
                          <span className="text-slate-500 font-semibold">Finding:</span> {pillar.finding}
                        </p>
                        <p className="text-[11px] text-emerald-400">
                          <span className="text-emerald-500/70 font-semibold">Remedy:</span> {pillar.recommendation}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SOP 3-Touch Outreach Deliverables Switcher */}
              <div className={`border-t pt-3 space-y-3 ${isGlass ? 'border-[#e8e4dc]/80' : 'border-slate-800'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setActiveOutreachTab('voice_script')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeOutreachTab === 'voice_script'
                          ? isGlass
                            ? 'bg-purple-100 text-purple-900 border border-purple-300 shadow-xs'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : isGlass
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Spoken Voice Note Script (Anna)</span>
                    </button>

                    <button
                      onClick={() => setActiveOutreachTab('email')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeOutreachTab === 'email'
                          ? isGlass
                            ? 'bg-sky-100 text-sky-900 border border-sky-300 shadow-xs'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : isGlass
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Cold Email</span>
                    </button>

                    <button
                      onClick={() => setActiveOutreachTab('linkedin')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeOutreachTab === 'linkedin'
                          ? isGlass
                            ? 'bg-blue-100 text-blue-900 border border-blue-300 shadow-xs'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : isGlass
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Linkedin className="w-3.5 h-3.5" />
                      <span>LinkedIn InMail</span>
                    </button>

                    <button
                      onClick={() => setActiveOutreachTab('lead_magnet')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeOutreachTab === 'lead_magnet'
                          ? isGlass
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : isGlass
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Free Lead Magnet Teardown</span>
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                {activeOutreachTab === 'voice_script' && audit.outreachSequence?.spokenAudioScript && (
                  <div className={`p-4 rounded-xl border space-y-3 ${
                    isGlass ? 'bg-slate-50/90 border-purple-200 text-slate-800' : 'bg-slate-950/80 border-purple-800/40 text-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center space-x-2 text-xs font-mono ${isGlass ? 'text-purple-700' : 'text-purple-400'}`}>
                        <Mic className="w-4 h-4" />
                        <span className="font-semibold">60-Second Personalized Voice Note Script (Anna / SDR):</span>
                      </div>
                      <button
                        onClick={() =>
                          handleCopy(
                            `${audit.outreachSequence.spokenAudioScript.intro} ${audit.outreachSequence.spokenAudioScript.triggerHook} ${audit.outreachSequence.spokenAudioScript.valueDrop} ${audit.outreachSequence.spokenAudioScript.frictionlessCallToAction}`,
                            'voice_script'
                          )
                        }
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${
                          isGlass ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-xs' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {copiedIndex === 'voice_script' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedIndex === 'voice_script' ? 'Copied' : 'Copy Audio Script'}</span>
                      </button>
                    </div>

                    <div className={`space-y-2 text-xs font-mono leading-relaxed p-3 rounded-lg border ${
                      isGlass ? 'bg-white border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}>
                      <p><span className={`font-bold ${isGlass ? 'text-purple-700' : 'text-purple-400'}`}>[Intro]:</span> "{audit.outreachSequence.spokenAudioScript.intro}"</p>
                      <p><span className={`font-bold ${isGlass ? 'text-sky-700' : 'text-cyan-400'}`}>[Trigger Hook]:</span> "{audit.outreachSequence.spokenAudioScript.triggerHook}"</p>
                      <p><span className={`font-bold ${isGlass ? 'text-amber-700' : 'text-amber-400'}`}>[Value Drop]:</span> "{audit.outreachSequence.spokenAudioScript.valueDrop}"</p>
                      <p><span className={`font-bold ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>[Frictionless CTA]:</span> "{audit.outreachSequence.spokenAudioScript.frictionlessCallToAction}"</p>
                    </div>
                  </div>
                )}

                {activeOutreachTab === 'email' && audit.outreachSequence?.coldEmail && (
                  <div className={`p-4 rounded-xl border space-y-3 ${
                    isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-slate-950/80 border-slate-800 text-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className={`text-xs font-mono ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                        <span className={isGlass ? 'text-slate-500' : 'text-slate-500'}>Subject:</span>{' '}
                        <span className={`font-bold ${isGlass ? 'text-slate-900' : 'text-slate-200'}`}>{audit.outreachSequence.coldEmail.subject}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <a
                          href={coldEmailMailtoUrl}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold font-mono"
                        >
                          <Mail className="w-3 h-3" />
                          <span>Open in Email App</span>
                        </a>
                        <button
                          onClick={() =>
                            handleCopy(
                              `Subject: ${audit.outreachSequence.coldEmail.subject}\n\n${audit.outreachSequence.coldEmail.bodyMarkdown}`,
                              'cold_email'
                            )
                          }
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${
                            isGlass ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-xs' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          {copiedIndex === 'cold_email' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>
                    <pre className={`text-xs whitespace-pre-wrap font-sans leading-relaxed p-3.5 rounded-lg border ${
                      isGlass ? 'bg-white border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}>
                      {audit.outreachSequence.coldEmail.bodyMarkdown}
                    </pre>
                  </div>
                )}

                {activeOutreachTab === 'linkedin' && audit.outreachSequence?.linkedInMessage && (
                  <div className={`p-4 rounded-xl border space-y-3 ${
                    isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-slate-950/80 border-slate-800 text-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className={`text-xs font-mono font-semibold ${isGlass ? 'text-blue-700' : 'text-blue-400'}`}>
                        LinkedIn Connection Note / InMail (Trigger + Context):
                      </div>
                      <button
                        onClick={() =>
                          handleCopy(audit.outreachSequence.linkedInMessage.body, 'linkedin_msg')
                        }
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${
                          isGlass ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-xs' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {copiedIndex === 'linkedin_msg' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Copy Message</span>
                      </button>
                    </div>
                    <pre className={`text-xs whitespace-pre-wrap font-sans leading-relaxed p-3.5 rounded-lg border ${
                      isGlass ? 'bg-white border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}>
                      {audit.outreachSequence.linkedInMessage.body}
                    </pre>
                  </div>
                )}

                {activeOutreachTab === 'lead_magnet' && audit.freeAssetPreviewMarkdown && (
                  <div className={`p-4 rounded-xl border space-y-3 ${
                    isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-slate-950/80 border-slate-800 text-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className={`text-xs font-mono font-semibold ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>
                        Free Lead Magnet Teardown Asset (Zero-Friction Deliverable):
                      </div>
                      <button
                        onClick={() => handleCopy(audit.freeAssetPreviewMarkdown, 'lead_magnet_asset')}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${
                          isGlass ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-xs' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {copiedIndex === 'lead_magnet_asset' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Copy Asset Markdown</span>
                      </button>
                    </div>
                    <pre className={`text-xs whitespace-pre-wrap font-sans leading-relaxed p-3.5 rounded-lg border max-h-48 overflow-y-auto ${
                      isGlass ? 'bg-white border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}>
                      {audit.freeAssetPreviewMarkdown}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : pack ? (
            /* VIEW 2: Hermes Multi-Channel Content Pack (5 Channels) */
            <div className={`p-5 rounded-2xl border backdrop-blur-xl flex flex-col flex-1 space-y-4 ${
              isGlass ? 'bg-white/85 border-slate-200/90 text-slate-800 shadow-xl' : 'bg-slate-900/60 border-slate-800/80 text-slate-200 shadow-2xl'
            }`}>
              {/* Header & Approval Boundary */}
              <div className={`flex items-center justify-between border-b pb-3.5 ${isGlass ? 'border-slate-200' : 'border-slate-800'}`}>
                <div>
                  <div className={`text-xs font-mono uppercase ${isGlass ? 'text-slate-500 font-semibold' : 'text-slate-400'}`}>Verified Thesis:</div>
                  <h3 className={`text-sm font-bold mt-0.5 ${isGlass ? 'text-slate-900' : 'text-slate-100'}`}>
                    {pack.thesis}
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePublishToSocial('all')}
                    disabled={isPublishingSocial}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-sky-500/20 transition-all disabled:opacity-50 cursor-pointer"
                    title="Publish directly to connected X, LinkedIn & Substack"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{isPublishingSocial ? 'Publishing...' : 'Broadcast to Connected Platforms'}</span>
                  </button>

                  {!selectedJob.humanApproved ? (
                    <button
                      onClick={() => onApproveJob(selectedJob.id)}
                      className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve Pack</span>
                    </button>
                ) : (
                  <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-semibold ${
                    isGlass ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                  }`}>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approved & Dispatched</span>
                  </div>
                )}
                </div>
              </div>

              {/* 5-Channel Platform Switcher */}
              <div className={`flex items-center space-x-1.5 border-b pb-2 overflow-x-auto ${isGlass ? 'border-slate-200' : 'border-slate-800'}`}>
                <button
                  onClick={() => setActiveAssetTab('twitter')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeAssetTab === 'twitter'
                      ? (isGlass ? 'bg-cyan-50 text-cyan-800 border border-cyan-300 shadow-xs' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm')
                      : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                  }`}
                >
                  <Twitter className="w-3.5 h-3.5" />
                  <span>X Thread ({pack.twitterThread?.length || 5})</span>
                </button>

                <button
                  onClick={() => setActiveAssetTab('linkedin')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeAssetTab === 'linkedin'
                      ? (isGlass ? 'bg-blue-50 text-blue-800 border border-blue-300 shadow-xs' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm')
                      : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                  }`}
                >
                  <Linkedin className="w-3.5 h-3.5" />
                  <span>LinkedIn Post</span>
                </button>

                <button
                  onClick={() => setActiveAssetTab('instagram')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeAssetTab === 'instagram'
                      ? (isGlass ? 'bg-pink-50 text-pink-800 border border-pink-300 shadow-xs' : 'bg-pink-500/20 text-pink-300 border border-pink-500/40 shadow-sm')
                      : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                  }`}
                >
                  <Instagram className="w-3.5 h-3.5" />
                  <span>Instagram/Threads Carousel</span>
                </button>

                <button
                  onClick={() => setActiveAssetTab('newsletter')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeAssetTab === 'newsletter'
                      ? (isGlass ? 'bg-purple-50 text-purple-800 border border-purple-300 shadow-xs' : 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm')
                      : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Substack/Email Newsletter</span>
                </button>

                <button
                  onClick={() => setActiveAssetTab('webinar')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeAssetTab === 'webinar'
                      ? (isGlass ? 'bg-amber-50 text-amber-900 border border-amber-300 shadow-xs' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm')
                      : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Webinar Pitch Script</span>
                </button>

                <button
                  onClick={() => setActiveAssetTab('instatic')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeAssetTab === 'instatic'
                      ? (isGlass ? 'bg-gradient-to-r from-amber-100 to-amber-200/90 text-amber-950 border border-amber-400 shadow-xs' : 'bg-gradient-to-r from-amber-500/30 to-amber-400/20 text-amber-300 border border-amber-400/60 shadow-sm')
                      : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>🎨 Instatic Visual CMS</span>
                </button>
              </div>

              {/* Asset Tab Views */}
              <div className="flex-1 overflow-y-auto space-y-4">
                {activeAssetTab === 'twitter' && pack.twitterThread && (
                  <div className="space-y-3">
                    <div className={`flex items-center justify-between text-xs font-mono ${isGlass ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                      <span>Twitter / X Thread (Strictly &lt;= 280 Chars per Tweet)</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handlePublishToSocial('twitter')}
                          disabled={isPublishingSocial}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[11px] shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <Twitter className="w-3 h-3" />
                          <span>Publish Thread to X</span>
                        </button>
                        <button
                          onClick={() => handleCopy(pack.twitterThread.join('\n\n'), 'all_tweets')}
                          className={`flex items-center space-x-1 ${isGlass ? 'text-cyan-700 hover:underline font-semibold' : 'text-cyan-400 hover:underline'}`}
                        >
                          {copiedIndex === 'all_tweets' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>Copy Full Thread</span>
                        </button>
                      </div>
                    </div>

                    {pack.twitterThread.map((tweet, idx) => (
                      <div key={idx} className={`p-3.5 rounded-xl border space-y-2 ${
                        isGlass ? 'bg-slate-50/90 border-slate-200 shadow-xs' : 'bg-slate-950/70 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className={isGlass ? 'text-slate-500 font-semibold' : 'text-slate-500'}>Tweet {idx + 1} / {pack.twitterThread.length}</span>
                          <span className={tweet.length > 280 ? (isGlass ? 'text-rose-600 font-bold' : 'text-red-400') : (isGlass ? 'text-slate-600' : 'text-slate-400')}>
                            {tweet.length} / 280 chars
                          </span>
                        </div>
                        <p className={`text-xs leading-relaxed font-sans ${isGlass ? 'text-slate-800' : 'text-slate-200'}`}>{tweet}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeAssetTab === 'linkedin' && pack.linkedInPost && (
                  <div className="space-y-3">
                    <div className={`flex items-center justify-between text-xs font-mono ${isGlass ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                      <span>LinkedIn Long-Form Post & Action Framework</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handlePublishToSocial('linkedin')}
                          disabled={isPublishingSocial}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow-xs transition-all disabled:opacity-50"
                        >
                          <Linkedin className="w-3 h-3" />
                          <span>Publish to LinkedIn</span>
                        </button>
                        <button
                        onClick={() =>
                          handleCopy(
                            `${pack.linkedInPost?.hook}\n\n${pack.linkedInPost?.bodyMarkdown}\n\nTakeaways:\n${pack.linkedInPost?.takeaways.map(t => '• ' + t).join('\n')}\n\n${pack.linkedInPost?.hashtags.join(' ')}`,
                            'linkedin_post'
                          )
                        }
                        className={`flex items-center space-x-1 ${isGlass ? 'text-blue-700 hover:underline font-semibold' : 'text-blue-400 hover:underline'}`}
                      >
                        {copiedIndex === 'linkedin_post' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Copy Post</span>
                        </button>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border space-y-3 text-xs leading-relaxed font-sans ${
                      isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-950/70 border-slate-800 text-slate-200'
                    }`}>
                      <div className={`font-bold text-sm pb-1 border-b ${isGlass ? 'text-slate-900 border-slate-200' : 'text-white border-slate-800/80'}`}>
                        {pack.linkedInPost.hook}
                      </div>
                      <p className={`whitespace-pre-wrap ${isGlass ? 'text-slate-800' : 'text-slate-200'}`}>{pack.linkedInPost.bodyMarkdown}</p>
                      <div className="space-y-1 pt-2">
                        <div className={`font-semibold font-mono text-[11px] ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>Core Takeaways:</div>
                        {pack.linkedInPost.takeaways.map((t, idx) => (
                          <div key={idx} className={`flex items-center space-x-2 ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>
                            <span className={isGlass ? 'text-blue-600 font-bold' : 'text-blue-400'}>✓</span>
                            <span>{t}</span>
                          </div>
                        ))}
                      </div>
                      <div className={`flex flex-wrap gap-1.5 pt-2 text-[11px] font-mono ${isGlass ? 'text-blue-700 font-semibold' : 'text-blue-400'}`}>
                        {pack.linkedInPost.hashtags.map((tag, idx) => (
                          <span key={idx}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeAssetTab === 'instagram' && pack.instagramCaption && (
                  <div className="space-y-3">
                    <div className={`flex items-center justify-between text-xs font-mono ${isGlass ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                      <span>Instagram / Threads Multi-Slide Carousel Deck</span>
                      <button
                        onClick={() =>
                          handleCopy(
                            `Hook: ${pack.instagramCaption?.hook}\n\nCaption: ${pack.instagramCaption?.caption}\n\nSlides:\n${pack.instagramCaption?.slideOutlines.join('\n')}`,
                            'insta_carousel'
                          )
                        }
                        className={`flex items-center space-x-1 ${isGlass ? 'text-pink-700 hover:underline font-semibold' : 'text-pink-400 hover:underline'}`}
                      >
                        {copiedIndex === 'insta_carousel' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Copy Carousel Outlines</span>
                      </button>
                    </div>

                    <div className={`p-4 rounded-xl border space-y-3 text-xs leading-relaxed font-sans ${
                      isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-950/70 border-slate-800 text-slate-200'
                    }`}>
                      <div className={`font-bold text-sm ${isGlass ? 'text-slate-900' : 'text-white'}`}>{pack.instagramCaption.hook}</div>
                      <p className={`italic ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>{pack.instagramCaption.caption}</p>
                      <div className="space-y-2 pt-2">
                        <div className={`font-semibold font-mono text-[11px] ${isGlass ? 'text-slate-700' : 'text-slate-400'}`}>5-Slide Visual Storyboard:</div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                          {pack.instagramCaption.slideOutlines.map((slide, idx) => (
                            <div key={idx} className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                              isGlass ? 'bg-white border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}>
                              <span className={`font-mono font-bold block ${isGlass ? 'text-pink-700' : 'text-pink-400'}`}>Slide {idx + 1}</span>
                              <span className={isGlass ? 'text-slate-700' : 'text-slate-300'}>{slide}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeAssetTab === 'newsletter' && pack.newsletter && (
                  <div className="space-y-3">
                    <div className={`flex items-center justify-between text-xs font-mono ${isGlass ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                      <div className="flex items-center space-x-3">
                        <span>Word count: {wordCount} words (~{readTimeMin} min read)</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handlePublishToSocial('substack')}
                          disabled={isPublishingSocial}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <Globe className="w-3 h-3" />
                          <span>Broadcast to Substack/Webhook</span>
                        </button>
                        <a
                          href={mailtoUrl}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                        >
                          <Mail className="w-3 h-3" />
                          <span>Draft Email</span>
                        </a>
                        <button
                          onClick={() => setIsFullscreenNewsletter(true)}
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs border ${
                            isGlass ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-xs' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>Fullscreen</span>
                        </button>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border space-y-3 text-xs leading-relaxed font-sans ${
                      isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-950/70 border-slate-800 text-slate-200'
                    }`}>
                      <div className={`border-b pb-2 ${isGlass ? 'border-slate-200' : 'border-slate-800'}`}>
                        <div className={`font-mono text-[11px] ${isGlass ? 'text-slate-500 font-semibold' : 'text-slate-400'}`}>Subject Line:</div>
                        <div className={`font-bold text-sm ${isGlass ? 'text-slate-900' : 'text-white'}`}>{pack.newsletter.subjectLine}</div>
                      </div>
                      <pre className={`whitespace-pre-wrap font-sans ${isGlass ? 'text-slate-800' : 'text-slate-300'}`}>{pack.newsletter.bodyMarkdown}</pre>
                    </div>
                  </div>
                )}

                {activeAssetTab === 'webinar' && pack.webinarScript && (
                  <div className="space-y-3">
                    <div className={`text-xs font-mono ${isGlass ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>Webinar & Video Pitch Script:</div>
                    <div className={`space-y-2 text-xs leading-relaxed p-4 rounded-xl border ${
                      isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-950/70 border-slate-800 text-slate-300'
                    }`}>
                      <p><span className={`font-bold font-mono ${isGlass ? 'text-amber-800' : 'text-amber-400'}`}>[The Hook]:</span> {pack.webinarScript.hook}</p>
                      <p><span className={`font-bold font-mono ${isGlass ? 'text-rose-700' : 'text-rose-400'}`}>[Core Problem]:</span> {pack.webinarScript.coreProblem}</p>
                      <p><span className={`font-bold font-mono ${isGlass ? 'text-cyan-700' : 'text-cyan-400'}`}>[Value Prop]:</span> {pack.webinarScript.valueProposition}</p>
                      <p><span className={`font-bold font-mono ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>[The Close]:</span> {pack.webinarScript.offerClose}</p>
                    </div>
                  </div>
                )}

                {activeAssetTab === 'instatic' && (
                  <div className="h-[750px] w-full mt-2">
                    <InstaticVisualEditor
                      companyName={activeCompanyName}
                      initialTopic={pack?.thesis || selectedJob?.topic || 'Lead Generation & High-Ticket Sprints'}
                      contentSummary={{
                        thesis: pack?.thesis,
                        hook: pack?.linkedInPost?.hook,
                        coreProblem: pack?.webinarScript?.coreProblem || pack?.newsletter?.previewText,
                        tacticalFramework: pack?.linkedInPost?.takeaways
                      }}
                      isGlass={isGlass}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`p-12 text-center font-mono text-xs rounded-2xl border ${
              isGlass ? 'bg-white/80 border-slate-200/90 text-slate-500 shadow-xs' : 'bg-slate-900/40 border-slate-800 text-slate-500'
            }`}>
              Select a job from the left queue to view details.
            </div>
          )}
        </div>
      </div>

      {/* MODAL: SOP Outbound Lead Magnet & Conversion Audit Generator */}
      {isAuditModalOpen && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-6 ${
          isGlass ? 'bg-slate-900/40' : 'bg-slate-950/80'
        }`}>
          <div className={`w-full max-w-2xl border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col ${
            isGlass ? 'bg-white border-cyan-300 shadow-cyan-500/10' : 'bg-slate-900 border-cyan-700/50'
          }`}>
            <div className={`flex items-center justify-between p-5 border-b flex-shrink-0 ${
              isGlass ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}>
              <div className={`flex items-center space-x-2 ${isGlass ? 'text-cyan-700' : 'text-cyan-400'}`}>
                <Target className="w-5 h-5" />
                <div>
                  <h3 className={`text-sm font-bold ${isGlass ? 'text-slate-900' : 'text-white'}`}>
                    SOP Outbound Lead Magnet & 5-Point Inbound Audit Generator
                  </h3>
                  <p className={`text-[11px] ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                    High-Volume Lead Gen & Personalized Outreach System (Trigger + Context + Free Resource)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className={`p-1.5 rounded-lg transition-all ${
                  isGlass ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAuditSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`font-mono font-semibold ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>Target Company / Creator Name:</label>
                  <input
                    type="text"
                    required
                    value={auditCompany}
                    onChange={(e) => setAuditCompany(e.target.value)}
                    placeholder="E.g. Acme Coaching Co."
                    className={`w-full px-3 py-2 rounded-xl border focus:outline-none font-mono ${
                      isGlass ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-cyan-600' : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500'
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={`font-mono font-semibold ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>Website URL:</label>
                  <input
                    type="url"
                    value={auditWebsite}
                    onChange={(e) => setAuditWebsite(e.target.value)}
                    placeholder="https://acmecoaching.example"
                    className={`w-full px-3 py-2 rounded-xl border focus:outline-none font-mono ${
                      isGlass ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-cyan-600' : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500'
                    }`}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className={`font-mono font-semibold flex items-center space-x-1.5 ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>
                  <Sparkles className={`w-3.5 h-3.5 ${isGlass ? 'text-cyan-700' : 'text-cyan-400'}`} />
                  <span>Outreach Trigger Event (From TheOrg.com / LinkedIn / Substack):</span>
                </label>
                <input
                  type="text"
                  required
                  value={auditTrigger}
                  onChange={(e) => setAuditTrigger(e.target.value)}
                  placeholder="E.g. Hiring first SDR / Launched $2,997 cohort on Substack"
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none font-mono ${
                    isGlass ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-cyan-600' : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* Social Platform Links */}
              <div className={`space-y-2 pt-1 border-t ${isGlass ? 'border-slate-200' : 'border-slate-800/80'}`}>
                <label className={`font-mono font-semibold block ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>
                  Social Platform Profiles:
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className={`flex items-center space-x-2 border rounded-xl px-2.5 py-1.5 ${
                    isGlass ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <Twitter className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                    <input
                      type="url"
                      value={auditTwitter}
                      onChange={(e) => setAuditTwitter(e.target.value)}
                      placeholder="https://x.com/..."
                      className={`bg-transparent text-xs w-full focus:outline-none font-mono ${
                        isGlass ? 'text-slate-800 placeholder-slate-400' : 'text-slate-200 placeholder-slate-600'
                      }`}
                    />
                  </div>

                  <div className={`flex items-center space-x-2 border rounded-xl px-2.5 py-1.5 ${
                    isGlass ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <Linkedin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <input
                      type="url"
                      value={auditLinkedIn}
                      onChange={(e) => setAuditLinkedIn(e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      className={`bg-transparent text-xs w-full focus:outline-none font-mono ${
                        isGlass ? 'text-slate-800 placeholder-slate-400' : 'text-slate-200 placeholder-slate-600'
                      }`}
                    />
                  </div>

                  <div className={`flex items-center space-x-2 border rounded-xl px-2.5 py-1.5 ${
                    isGlass ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <Youtube className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <input
                      type="url"
                      value={auditYouTube}
                      onChange={(e) => setAuditYouTube(e.target.value)}
                      placeholder="https://youtube.com/@..."
                      className={`bg-transparent text-xs w-full focus:outline-none font-mono ${
                        isGlass ? 'text-slate-800 placeholder-slate-400' : 'text-slate-200 placeholder-slate-600'
                      }`}
                    />
                  </div>

                  <div className={`flex items-center space-x-2 border rounded-xl px-2.5 py-1.5 ${
                    isGlass ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <Mail className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <input
                      type="url"
                      value={auditSubstack}
                      onChange={(e) => setAuditSubstack(e.target.value)}
                      placeholder="https://....substack.com"
                      className={`bg-transparent text-xs w-full focus:outline-none font-mono ${
                        isGlass ? 'text-slate-800 placeholder-slate-400' : 'text-slate-200 placeholder-slate-600'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Dedicated Analysis Text Box for Client Social Platforms and Bio */}
              <div className="space-y-1.5 pt-1">
                <label className={`font-mono font-semibold flex items-center justify-between ${isGlass ? 'text-slate-700' : 'text-slate-300'}`}>
                  <span>Client Social Footprint, Bio & Audience Context (For Analysis):</span>
                  <span className={`text-[10px] font-normal ${isGlass ? 'text-cyan-700' : 'text-cyan-400'}`}>Deep AI Extraction</span>
                </label>
                <textarea
                  rows={4}
                  value={auditSocialBio}
                  onChange={(e) => setAuditSocialBio(e.target.value)}
                  placeholder="Paste creator/prospect social bio, audience metrics, community size (Discord/Skool/Substack), current price tiers, and pain points here..."
                  className={`w-full p-3 rounded-xl border focus:outline-none font-mono text-xs leading-relaxed ${
                    isGlass ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-cyan-600' : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500'
                  }`}
                />
                <p className={`text-[11px] italic ${isGlass ? 'text-slate-600' : 'text-slate-500'}`}>
                  DeepSeek-R1 analyzes this footprint to calculate annual revenue leakage and personalize the 5-point conversion audit & audio script.
                </p>
              </div>

              <div className={`pt-3 flex items-center justify-end space-x-2 border-t ${isGlass ? 'border-slate-200' : 'border-slate-800'}`}>
                <button
                  type="button"
                  onClick={() => setIsAuditModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold ${
                    isGlass ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  <Target className="w-4 h-4" />
                  <span>Generate Inbound Audit & Lead Magnet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Newsletter Modal */}
      {isFullscreenNewsletter && pack?.newsletter && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-6 ${
          isGlass ? 'bg-slate-900/40' : 'bg-slate-950/90'
        }`}>
          <div className={`w-full max-w-3xl border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
            isGlass ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
          }`}>
            <div className={`flex items-center justify-between p-4 border-b ${
              isGlass ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'
            }`}>
              <div className={`text-xs font-mono ${isGlass ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>Newsletter Reader View</div>
              <button
                onClick={() => setIsFullscreenNewsletter(false)}
                className={`p-1 rounded ${
                  isGlass ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <h2 className={`text-lg font-bold ${isGlass ? 'text-slate-950' : 'text-white'}`}>{pack.newsletter.subjectLine}</h2>
              <pre className={`whitespace-pre-wrap font-sans text-xs leading-relaxed ${isGlass ? 'text-slate-800' : 'text-slate-300'}`}>{pack.newsletter.bodyMarkdown}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
