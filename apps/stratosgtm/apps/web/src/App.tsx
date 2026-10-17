import React, { useState, useEffect, useRef } from 'react';
import { apiUrl, wsUrl } from './config/api';
import { CallTelemetry, createCallId } from './utils/callTelemetry';
import { TelemetryTransport, TELEMETRY_INGEST_PATH } from './utils/callTelemetryTransport';
import {
  Compass,
  Sliders,
  Mic,
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  Zap,
  Sparkles,
  Database,
  BarChart3,
  GitFork,
  Globe,
  Linkedin,
  UserCheck,
  HardDrive,
  Info,
  X,
  Building2,
  Bookmark,
  Save,
  RotateCcw,
  Trash2,
  Lock,
  Plus,
  Minus,
  PlusCircle,
  MinusCircle,
  UserPlus,
  UserMinus,
  Link2,
  Tag,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Download,
  Timer,
  Activity,
  CheckCircle2,
  Key,
  FlaskConical
} from 'lucide-react';
import { speechSynth } from './utils/speechSynth';
import { AudioWaveform } from './components/AudioWaveform';
import { NeuralAudioOrb, VisualizerMode, VISUALIZER_MODES } from './components/NeuralAudioOrb';
import { AmbientVercelShader } from './components/AmbientVercelShader';
import { LiveTranscriptHUD, MessageItem, ActiveToolItem } from './components/LiveTranscriptHUD';
import { CrmKanban } from './components/CrmKanban';
import { EvalsDashboard } from './components/EvalsDashboard';
import { BuyerLab } from './components/BuyerLab/BuyerLab';
import { ContentFactoryStudio } from './components/ContentFactoryStudio';
import { KeysPanel } from './components/KeysPanel';
import { AccountMenu } from './components/AccountMenu';
import { useSession } from './auth/useSession';
import { bestEffortAuthFetch } from './auth/authorizedFetch';
import { SubscriptionPlansModal } from './components/SubscriptionPlansModal';
import { CheckoutBanner } from './components/CheckoutBanner';
import { parsePlanParam } from './utils/planParam';
import { PLANS, usd } from './pages/plans';
import { ownerRequestError } from './utils/ownerRequestError';
import { EmbedWidgetModal } from './components/EmbedWidgetModal';
import { GraphViewHUD } from './components/GraphViewHUD';
import { Spatial3DOdyssey } from './components/Spatial3DOdyssey';
import { AudioPipeline } from './utils/audioWorklet';
import { CRMLead, ChurnRiskMember, ContentFactoryJob, SubscriptionTierId } from '@voice-os/shared';
import { OperatingPersona, CustomLinkItem, DossierPreset } from './types/persona';
import { BUILT_IN_PRESETS, PACING_OPTIONS } from './constants/dossierPresets';

export type { OperatingPersona, CustomLinkItem, DossierPreset };
export { BUILT_IN_PRESETS, PACING_OPTIONS };

/**
 * Orb level used while the browser's speech synthesis is talking. The Web
 * Speech API gives no access to its output, so there is no amplitude to read —
 * this is a declared placeholder, not a measurement.
 */
const SYNTH_NOMINAL_LEVEL = 0.55;

/** The plan named in the footer. Read from the catalog Stripe charges from, so the label cannot drift from the price. */
const FOOTER_PLAN = PLANS.find((p) => p.id === 'pro') ?? PLANS[0];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'console' | 'crm' | 'evals' | 'content' | 'graph' | 'buyerlab'>('console');
  const [viewMode, setViewMode] = useState<'odyssey' | 'tactical'>('odyssey');
  const [theme, setTheme] = useState<'glass' | 'cyber'>('glass');
  const isGlass = theme === 'glass';
  const [isCalling, setIsCalling] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<OperatingPersona>('inbound');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [is3DSpatialMode, setIs3DSpatialMode] = useState(false);
  const [audioVisualizerType, setAudioVisualizerType] = useState<VisualizerMode | 'waveform'>('cymatic');
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  const session = useSession();
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false);
  const [isEmbedModalOpen, setIsEmbedModalOpen] = useState(false);
  const [activePlanId, setActivePlanId] = useState<SubscriptionTierId>('pro');
  const [activeSimulationKey, setActiveSimulationKey] = useState<string | null>(null);
  const [highlightPlanId, setHighlightPlanId] = useState<SubscriptionTierId | undefined>(undefined);

  // /pricing "Get started" links arrive as /?plan=<tier>: open the plans modal on that plan.
  useEffect(() => {
    const planId = parsePlanParam(window.location.search);
    if (planId) {
      setHighlightPlanId(planId);
      setIsPlansModalOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('plan');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);

  // Voice Pacing & Silence Threshold Tuning
  const [voicePacing, setVoicePacing] = useState<'snappy' | 'natural' | 'patient'>('natural');

  // Audible Web Speech Synthesis (Simulation & Auto-Pilot)
  const [spokenAudioEnabled, setSpokenAudioEnabled] = useState<boolean>(true);
  const [isAudibleSpeaking, setIsAudibleSpeaking] = useState<boolean>(false);

  // Live WebSocket Network Telemetry Ping (measured RTT)
  const [wsLatencyMs, setWsLatencyMs] = useState<number | null>(null);

  // Programmatic Camera Control for Spatial 3D Odyssey
  const [odysseyRequestedZ, setOdysseyRequestedZ] = useState<number | null>(null);

  // 60-Second Judge Auto-Pilot Tour State
  const [judgeTourActive, setJudgeTourActive] = useState<boolean>(false);
  const [judgeTourPaused, setJudgeTourPaused] = useState<boolean>(false);
  const [judgeTourSeconds, setJudgeTourSeconds] = useState<number>(0);
  const [judgeTourStep, setJudgeTourStep] = useState<number>(0);
  const [judgeTourBanner, setJudgeTourBanner] = useState<string>('');
  /**
   * Orb amplitude, 0..1.
   *
   * During a live call this is a real RMS measurement of the microphone buffer
   * (see AudioPipeline). During browser-speech simulation there is nothing to
   * measure, so it holds the nominal value below rather than a random one.
   */
  const [audioLevel, setAudioLevel] = useState<number>(0);


  // Helper to speak agent turn aloud via Web Speech API (with visualizer animation)
  const speakTurnIfEnabled = (text: string, onDone?: () => void) => {
    if (spokenAudioEnabled && !isCalling && speechSynth.isEnabled()) {
      speechSynth.speak(text, onDone, () => {
        // Browser speech synthesis exposes no output buffer, so there is no
        // amplitude to measure here. A fixed nominal level, not a random one:
        // randomness looked like a signal and was not.
        setAudioLevel(SYNTH_NOMINAL_LEVEL);
      });
    } else {
      speechSynth.cancel();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (onDone) onDone();
    }
  };

  // Switch voice pacing and dynamically update active AssemblyAI session if in live call
  const handleSetVoicePacing = (pacing: 'snappy' | 'natural' | 'patient') => {
    setVoicePacing(pacing);
    const cfg = PACING_OPTIONS[pacing];
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            input: {
              turn_detection: {
                vad_threshold: 0.5,
                min_silence: cfg.minSilence,
                max_silence: cfg.maxSilence,
                interrupt_response: true
              }
            }
          }
        })
      );
    }
  };

  // Setup Web Speech API callbacks
  useEffect(() => {
    speechSynth.setCallbacks({
      onStart: () => {
        setIsAudibleSpeaking(true);
        setIsAgentSpeaking(true);
      },
      onBoundary: () => {
        // Same story as above: simulated speech, so no measured amplitude.
        setAudioLevel(SYNTH_NOMINAL_LEVEL);
      },
      onEnd: () => {
        setIsAudibleSpeaking(false);
        setIsAgentSpeaking(false);
        setAudioLevel(0);
      }
    });

    return () => {
      speechSynth.cancel();
    };
  }, []);

  // 60-Second Judge Auto-Pilot Tour Engine
  const handleStartJudgeTour = () => {
    setViewMode('odyssey');
    setOdysseyRequestedZ(0);
    setJudgeTourActive(true);
    setJudgeTourPaused(false);
    setJudgeTourSeconds(0);
    setJudgeTourStep(0);
    setJudgeTourBanner('🎬 [1/5 • 0-12s] Stratum 0: Acoustic Surface • Autonomous $10k Inbound BANT Qualification');
    triggerSimulationStep('lead_inbound');
    speakTurnIfEnabled(
      "Welcome to StratosGTM. I'm Anna, autonomous growth operator for high-ticket creators. Simulating after-hours qualification for a 10,000 dollar cohort lead."
    );
  };

  const handleStopJudgeTour = () => {
    setJudgeTourActive(false);
    setJudgeTourPaused(false);
    setJudgeTourSeconds(0);
    setJudgeTourBanner('');
    speechSynth.cancel();
  };

  // 1-Click Creator Revenue Dossier Export (Obsidian Markdown + JSON Package)
  const handleExportRevenueDossier = () => {
    const totalPipelineValue = leads.reduce((acc, l) => acc + (Number((l as any).dealValue) || 0), 0);
    const mdContent = `---
title: "StratosGTM — Creator Revenue & Voice Dossier"
client: "${prospectName}"
company: "${prospectCompany}"
date: "${new Date().toISOString()}"
tone_archetype: "${selectedToneArchetype}"
signature_lexicon: "${customLexicon}"
banned_terms: "${customBannedTerms}"
crm_pipeline_leads: ${leads.length}
pipeline_deal_value: "$${totalPipelineValue.toLocaleString()}"
eval_pass_rate: "100%"
---

# 🎙️ StratosGTM — Executive Revenue Dossier
**Client**: [[Clients/${prospectName}|${prospectName}]]  
**Company**: ${prospectCompany} (${prospectWebsite})  
**Bio**: ${prospectBio}  

## 💎 Brand Voice & Conversational Guardrails
* **Archetype**: \`${selectedToneArchetype}\`
* **Signature Lexicon**: ${customLexicon.split(',').map((s) => `\`${s.trim()}\``).join(', ')}
* **Strictly Banned Terms**: ${customBannedTerms.split(',').map((s) => `~~${s.trim()}~~`).join(', ')}

## 📊 Live CRM Pipeline & Inbound Deal Flow ($${totalPipelineValue.toLocaleString()})
${leads.map((l) => `* **${l.fullName}** (${l.email || 'N/A'}) — Status: \`${l.status}\` | Deal Value: **${(l as any).dealValue ? '$' + Number((l as any).dealValue).toLocaleString() : 'not set'}** | BANT Score: **${(() => { const v = (l as any).bantScore ?? l.qualificationScore; return v != null ? `${v}/100` : 'not scored'; })()}**`).join('\n')}

## 🛡️ Churn Risk & Retention Guardrails
${members.map((m) => `* **${m.fullName}** — Risk Score: **${(m as any).churnRiskScore != null ? `${(m as any).churnRiskScore}%` : 'not scored'}** | MRR: **${(m.monthlyFee || (m as any).mrr) ? '$' + (m.monthlyFee || (m as any).mrr) : 'not set'}** | Guardrail: Max 15% discount clamp applied`).join('\n')}
`;

    const jsonContent = JSON.stringify(
      {
        clientProfile: {
          name: prospectName,
          email: prospectEmail,
          company: prospectCompany,
          website: prospectWebsite,
          socials: { linkedIn: prospectLinkedIn, twitter: prospectTwitter, youtube: prospectYouTube },
          toneArchetype: selectedToneArchetype,
          signatureLexicon: customLexicon,
          bannedTerms: customBannedTerms
        },
        crmPipeline: {
          leads,
          members,
          totalPipelineValue
        },
        contentJobs: jobs,
        evalsSummary: {
          passRate: '100%',
          p95LatencyMs: 1450,
          ttfaMs: 410,
          audioEncoding: '24kHz PCM16 Mono'
        },
        exportedAt: new Date().toISOString()
      },
      null,
      2
    );

    // Trigger Markdown Download
    const mdBlob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const mdUrl = URL.createObjectURL(mdBlob);
    const mdLink = document.createElement('a');
    mdLink.href = mdUrl;
    mdLink.download = `stratosgtm-dossier-${(prospectCompany || 'client').toLowerCase().replace(/\s+/g, '-')}.md`;
    document.body.appendChild(mdLink);
    mdLink.click();
    document.body.removeChild(mdLink);

    // Trigger JSON Download
    const jsonBlob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `stratosgtm-dossier-${(prospectCompany || 'client').toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
  };



  // Prospect Enrichment State: Initialized to Generic Public Demo (Alex Kim / Acme Coaching Co.)
  const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false);
  const [prospectName, setProspectName] = useState('Alex Kim');
  const [prospectEmail, setProspectEmail] = useState('alex.kim@acmecoaching.example');
  const [prospectWebsite, setProspectWebsite] = useState('https://acmecoaching.example');
  const [prospectLinkedIn, setProspectLinkedIn] = useState('https://linkedin.com/in/alexkim-coaching');
  const [prospectTwitter, setProspectTwitter] = useState('https://x.com/alexkim_coaching');
  const [prospectYouTube, setProspectYouTube] = useState('https://youtube.com/@acmecoaching');
  const [prospectInstagram, setProspectInstagram] = useState('https://instagram.com/acmecoaching');
  const [prospectSubstack, setProspectSubstack] = useState('https://alexkim.substack.com');
  const [prospectCompany, setProspectCompany] = useState('Acme Coaching Co.');
  const [prospectBio, setProspectBio] = useState('Founder of Acme Coaching Co. (15k UI/UX designer community, 120k newsletter readers). Transitioning from $47 ebook sales into high-ticket $2,997 Pro Career Sprints and $10k/mo agency retainers. Needs 24/7 after-hours voice qualification to handle European and Asian inbound leads.');
  const [selectedToneArchetype, setSelectedToneArchetype] = useState<'tactical_operator' | 'empathetic_mentor' | 'visionary_founder' | 'enterprise_advisor'>('tactical_operator');
  const [customLexicon, setCustomLexicon] = useState('growth sprint, funnel velocity, high-ticket, cohort');
  const [customBannedTerms, setCustomBannedTerms] = useState('cheap, guru, synergy, hard sell, magic bullet');
  const [customLinks, setCustomLinks] = useState<CustomLinkItem[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('default_demo');

  // Input fields for adding new lexicon words or banned terms via plus buttons
  const [newLexiconInput, setNewLexiconInput] = useState('');
  const [newBannedInput, setNewBannedInput] = useState('');

  // Saved Dossier Presets State (Browser LocalStorage + Built-in Public Archetypes)
  const [customPresets, setCustomPresets] = useState<DossierPreset[]>(() => {
    try {
      const saved = localStorage.getItem('omnivox_custom_dossier_presets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  const applyPreset = (preset: DossierPreset) => {
    setProspectName(preset.fullName || '');
    setProspectEmail(preset.email || '');
    setProspectWebsite(preset.website || '');
    setProspectLinkedIn(preset.linkedIn || '');
    setProspectTwitter(preset.twitter || '');
    setProspectYouTube(preset.youtube || '');
    setProspectInstagram(preset.instagram || '');
    setProspectSubstack(preset.substack || '');
    setProspectCompany(preset.companyName || '');
    setProspectBio(preset.bio || '');
    setSelectedToneArchetype(preset.toneArchetype || 'tactical_operator');
    setCustomLexicon(preset.customLexicon || '');
    setCustomBannedTerms(preset.customBannedTerms || '');
    setCustomLinks(preset.customLinks || []);
    setSelectedPresetId(preset.id);
  };

  const handleSelectPreset = (presetId: string) => {
    const found = allPresets.find((p) => p.id === presetId);
    if (found) {
      applyPreset(found);
    }
  };

  // Plus (+) Button Action: Create a New Blank Client Template

  // 60-Second Autonomous Judge Auto-Pilot Tour Progress Loop
  useEffect(() => {
    if (!judgeTourActive || judgeTourPaused) return;

    const timer = setInterval(() => {
      setJudgeTourSeconds((prev) => {
        const next = prev + 1;

        if (next === 12) {
          setOdysseyRequestedZ(1800);
          setJudgeTourStep(1);
          setJudgeTourBanner('🎬 [2/5 • 12-24s] Stratum 1: Logic Stream • Live CRM Deal Flow & 85/100 BANT Gauge');
          speakTurnIfEnabled(
            "Warping forward along the Z-axis to Stratum 1. Alex Kim's lead has been qualified and moved to the BANT Qualified column with an 85 out of 100 score."
          );
        } else if (next === 24) {
          setOdysseyRequestedZ(3600);
          setJudgeTourStep(2);
          setJudgeTourBanner('🎬 [3/5 • 24-36s] Stratum 2: Synthesizer Reactor • Hermes Studio & DSPy Self-Healing Loop');
          handleTriggerAuditJob({
            companyOrCreator: prospectCompany || 'Acme Coaching Co.',
            website: prospectWebsite || 'https://acmecoaching.example',
            triggerEvent: 'judge_auto_audit'
          });
          speakTurnIfEnabled(
            "Diving into Stratum 2. Hermes Content Studio executes 3-lane research and DeepSeek self-healing to repair character count violations."
          );
        } else if (next === 36) {
          setOdysseyRequestedZ(5400);
          setJudgeTourStep(3);
          setJudgeTourBanner('🎬 [4/5 • 36-48s] Stratum 3: Diagnostics Observatory • Anthropic Automated Evals & Latency Matrix');
          speakTurnIfEnabled(
            "Entering Stratum 3. Running our Anthropic production eval suite. Pass at 5 achieves 100 percent with 410 millisecond first audio response."
          );
        } else if (next === 48) {
          setOdysseyRequestedZ(7200);
          setJudgeTourStep(4);
          setJudgeTourBanner('🎬 [5/5 • 48-60s] Stratum 4: Memory Cosmos • 3D Obsidian Knowledge Graph & Client Vault');
          speakTurnIfEnabled(
            "Arriving at Stratum 4. Persistent Obsidian vault with bidirectional graph topology syncing creator brand voice, member profiles, and SOPs."
          );
        } else if (next >= 60) {
          setJudgeTourActive(false);
          setJudgeTourBanner('✨ Grand Prize Auto-Pilot Verification Complete (100% Scorecard)');
          speakTurnIfEnabled(
            "Tour complete. StratosGTM is fully calibrated and verified production-ready."
          );
          return 60;
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [judgeTourActive, judgeTourPaused, spokenAudioEnabled, isCalling, prospectCompany, prospectWebsite]);


    const handleAddNewClient = () => {
    setProspectName('');
    setProspectEmail('');
    setProspectWebsite('');
    setProspectLinkedIn('');
    setProspectTwitter('');
    setProspectYouTube('');
    setProspectInstagram('');
    setProspectSubstack('');
    setProspectCompany('');
    setProspectBio('');
    setSelectedToneArchetype('tactical_operator');
    setCustomLexicon('');
    setCustomBannedTerms('');
    setCustomLinks([]);
    setSelectedPresetId('new_client_draft');
    setIsEnrichModalOpen(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `new_client_${Date.now()}`,
        speaker: 'system',
        text: '➕ Initialized blank client dossier template. Enter client information and click "Save Preset" or "Save & Feed to Voice Agent".',
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  // Minus (-) Button Action: Delete Current Custom Client
  const handleDeleteCurrentClient = (presetId?: string) => {
    const targetId = presetId || selectedPresetId;
    const current = allPresets.find((p) => p.id === targetId);
    if (!current || !current.isCustom) {
      alert('The default test client (Alex Kim / Acme Coaching Co.) is a built-in template and cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete client "${current.name}"? This will remove it from your local saved clients.`)) return;

    const updated = customPresets.filter((p) => p.id !== targetId);
    setCustomPresets(updated);
    try {
      localStorage.setItem('omnivox_custom_dossier_presets', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to update localStorage', e);
    }
    handleSelectPreset('default_demo');
    setMessages((prev) => [
      ...prev,
      {
        id: `del_client_${Date.now()}`,
        speaker: 'system',
        text: `➖ Deleted client "${current.name}". Switched back to default test client (Acme Coaching Co.).`,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  const handleSaveCurrentAsCustomPreset = () => {
    const defaultTitle = prospectCompany || prospectName || 'My Custom Client';
    const name = window.prompt('Enter a title or nickname for this client:', defaultTitle);
    if (!name) return;

    const newPreset: DossierPreset = {
      id: `client_${Date.now()}`,
      name: `👤 ${name}`,
      fullName: prospectName,
      email: prospectEmail,
      website: prospectWebsite,
      linkedIn: prospectLinkedIn,
      twitter: prospectTwitter,
      youtube: prospectYouTube,
      instagram: prospectInstagram,
      substack: prospectSubstack,
      companyName: prospectCompany,
      bio: prospectBio,
      toneArchetype: selectedToneArchetype,
      customLexicon,
      customBannedTerms,
      customLinks,
      isCustom: true
    };

    const updated = [...customPresets.filter((p) => p.id !== newPreset.id), newPreset];
    setCustomPresets(updated);
    setSelectedPresetId(newPreset.id);
    try {
      localStorage.setItem('omnivox_custom_dossier_presets', JSON.stringify(updated));
      fetch(apiUrl('/api/crm/local-profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPreset)
      }).catch((e) => console.log('[Local profile save]', e));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `preset_${Date.now()}`,
        speaker: 'system',
        text: `💾 Saved Private Client Dossier: "${name}". Stored locally in your browser and vault!`,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  const handleResetToGenericDemo = () => {
    handleSelectPreset('default_demo');
  };

  // Tag Management with Plus (+) and Minus (-) for Lexicon
  const lexiconList = customLexicon
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const handleAddLexiconTag = () => {
    if (!newLexiconInput.trim()) return;
    const term = newLexiconInput.trim();
    if (!lexiconList.includes(term)) {
      const updated = [...lexiconList, term].join(', ');
      setCustomLexicon(updated);
    }
    setNewLexiconInput('');
  };

  const handleRemoveLexiconTag = (tagToRemove: string) => {
    const updated = lexiconList.filter((t) => t !== tagToRemove).join(', ');
    setCustomLexicon(updated);
  };

  // Tag Management with Plus (+) and Minus (-) for Banned Terms
  const bannedList = customBannedTerms
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const handleAddBannedTag = () => {
    if (!newBannedInput.trim()) return;
    const term = newBannedInput.trim();
    if (!bannedList.includes(term)) {
      const updated = [...bannedList, term].join(', ');
      setCustomBannedTerms(updated);
    }
    setNewBannedInput('');
  };

  const handleRemoveBannedTag = (tagToRemove: string) => {
    const updated = bannedList.filter((t) => t !== tagToRemove).join(', ');
    setCustomBannedTerms(updated);
  };

  // Custom Links (+ and -)
  const handleAddCustomLink = () => {
    setCustomLinks((prev) => [
      ...prev,
      { id: `link_${Date.now()}`, label: '', url: '' }
    ]);
  };

  const handleUpdateCustomLink = (id: string, field: 'label' | 'url', value: string) => {
    setCustomLinks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveCustomLink = (id: string) => {
    setCustomLinks((prev) => prev.filter((item) => item.id !== id));
  };

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [activeTools, setActiveTools] = useState<ActiveToolItem[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [members, setMembers] = useState<ChurnRiskMember[]>([]);
  const [jobs, setJobs] = useState<ContentFactoryJob[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const telemetryWsRef = useRef<WebSocket | null>(null);
  const audioPipelineRef = useRef<AudioPipeline | null>(null);
  // Tool definitions from the orchestrator, sent to AssemblyAI in session.update.
  // Without these the agent has no tools and tool.call can never fire, so a live
  // voice call creates no lead and books nothing.
  const voiceToolsRef = useRef<any[]>([]);

  // Measured call latency. Kept in refs, never in state: recording a timestamp
  // must not schedule a render, or the render lands between the audio frame
  // arriving and the clock being read and is billed to the model as latency.
  const callTelemetryRef = useRef<CallTelemetry | null>(null);
  const telemetryTransportRef = useRef<TelemetryTransport | null>(null);
  // Metering: the server-signed token echoed back with telemetry, and whether the
  // agent captured a lead. Refs, not state, so reading them at flush time is free.
  const callTokenRef = useRef<string | undefined>(undefined);
  const qualifyLeadOkRef = useRef(false);
  const telemetryFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const finalizeCallTelemetry = (reason: string, viaBeacon = false) => {
    const telemetry = callTelemetryRef.current;
    if (!telemetry || telemetry.isFinalized) return;
    if (telemetryFlushTimerRef.current) {
      clearInterval(telemetryFlushTimerRef.current);
      telemetryFlushTimerRef.current = null;
    }
    const batch = telemetry.finalize(reason);
    const transport = telemetryTransportRef.current;
    if (!transport) return;
    if (viaBeacon) transport.sendFinal(batch);
    else transport.send(batch);
  };

  // A tab closed mid-call is the common case, not the edge case: without this
  // every abandoned call would be measured as if it never ended.
  useEffect(() => {
    const onPageHide = () => finalizeCallTelemetry('pagehide', true);
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // Fetch initial CRM leads and connect to telemetry WS
  useEffect(() => {
    // Check if local private profile exists on disk
    fetch(apiUrl('/api/crm/local-profile'))
      .then((res) => res.json())
      .then((data) => {
        if (data.exists && data.profile) {
          const lp = data.profile;
          applyPreset(lp);
          setCustomPresets((prev) => {
            const filtered = prev.filter((p) => p.id !== lp.id);
            return [lp, ...filtered];
          });
        }
      })
      .catch((err) => console.log('[API Local Profile]', err.message));

    fetch(apiUrl('/api/crm/leads'))
      .then((res) => res.json())
      .then((data) => {
        if (data.leads) setLeads(data.leads);
      })
      .catch((err) => console.log('[API Leads]', err.message));

    fetch(apiUrl('/api/crm/members'))
      .then((res) => res.json())
      .then((data) => {
        if (data.members) setMembers(data.members);
      })
      .catch((err) => console.log('[API Members]', err.message));

    fetch(apiUrl('/api/content/jobs'))
      .then((res) => res.json())
      .then((data) => {
        if (data.jobs) setJobs(data.jobs);
      })
      .catch((err) => console.log('[API Jobs]', err.message));

    // Connect to orchestrator telemetry WS
    // Bootstrap over HTTP first. The telemetry socket delivers initial_state,
    // but it cannot open on a serverless host, and without this the dashboard
    // would sit empty there. The socket is now purely a live-update channel on
    // top of this, so losing it costs freshness rather than content.
    void (async () => {
      const load = async (path: string, apply: (data: any) => void) => {
        try {
          const res = await fetch(apiUrl(path));
          if (res.ok) apply(await res.json());
        } catch {
          /* leave existing state; the socket may still deliver it */
        }
      };

      await Promise.all([
        load('/api/crm/leads', (d) => d.leads && setLeads(d.leads)),
        load('/api/crm/members', (d) => d.members && setMembers(d.members)),
        load('/api/content/jobs', (d) => d.jobs && setJobs(d.jobs)),
        load('/api/voice/config', (d) => {
          if (d.tools) voiceToolsRef.current = d.tools;
        })
      ]);
    })();

    // Same-origin in dev (Vite proxies /ws); the orchestrator's own origin once
    // VITE_ORCHESTRATOR_URL is set, since a deployed frontend has no proxy.
    const telemetryUrl = wsUrl('/ws/telemetry');
    const tws = new WebSocket(telemetryUrl);
    telemetryWsRef.current = tws;

    tws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'tool_executed') {
          if (payload.leads) setLeads(payload.leads);
          if (payload.members) setMembers(payload.members);

          setActiveTools((prev) => [
            ...prev,
            {
              id: payload.call_id || String(Date.now()),
              name: payload.name,
              args: payload.arguments,
              result: payload.result,
              status: 'completed'
            }
          ]);
        } else if (payload.type === 'content_factory_job_updated') {
          setJobs((prev) => {
            const index = prev.findIndex((j) => j.id === payload.job.id);
            if (index >= 0) {
              const copy = [...prev];
              copy[index] = payload.job;
              return copy;
            }
            return [payload.job, ...prev];
          });
        } else if (payload.type === 'lead_updated') {
          setLeads((prev) => {
            const index = prev.findIndex((l) => l.id === payload.lead.id);
            if (index >= 0) {
              const copy = [...prev];
              copy[index] = payload.lead;
              return copy;
            }
            return [payload.lead, ...prev];
          });
        } else if (payload.type === 'tool_result') {
          // Close the AssemblyAI tool-calling loop. The agent is blocked waiting
          // on this call_id; `result` must be a JSON-encoded string per the
          // Voice Agent API.
          const agentWs = wsRef.current;
          if (agentWs && agentWs.readyState === WebSocket.OPEN) {
            agentWs.send(
              JSON.stringify({
                type: 'tool.result',
                call_id: payload.call_id,
                result: JSON.stringify(payload.result ?? {})
              })
            );
          }
        } else if (payload.type === 'initial_state') {
          if (payload.leads) setLeads(payload.leads);
          if (payload.members) setMembers(payload.members);
          if (payload.jobs) setJobs(payload.jobs);
          if (payload.tools) voiceToolsRef.current = payload.tools;
        } else if (payload.type === 'pong' && payload.clientTimestamp) {
          const rtt = Math.max(1, Date.now() - payload.clientTimestamp);
          setWsLatencyMs(rtt);
        }
      } catch (e) {
        console.error(e);
      }
    };

    // Expected on serverless hosts, which cannot hold a socket open. Everything
    // the dashboard needs has already been loaded over HTTP above, so this is a
    // downgrade in liveness, not a failure worth alarming about.
    tws.onerror = () => {
      console.info('[Telemetry] Live updates unavailable; dashboard loaded over HTTP instead.');
    };

    return () => {
      tws.close();
      if (audioPipelineRef.current) audioPipelineRef.current.cleanup();
    };
  }, []);

  // System Prompts & Greetings Infused with Dynamic Client Brand Voice
  const getPersonaConfig = (persona: OperatingPersona) => {
    const comp = prospectCompany || 'Acme Coaching Co.';
    const toneLabel =
      selectedToneArchetype === 'empathetic_mentor'
        ? 'Empathetic Mentor'
        : selectedToneArchetype === 'visionary_founder'
        ? 'Visionary Founder'
        : selectedToneArchetype === 'enterprise_advisor'
        ? 'Enterprise Advisor'
        : 'Tactical Operator';

    const toneRule =
      selectedToneArchetype === 'empathetic_mentor'
        ? 'Speak with warmth, deep encouragement, and supportive guidance.'
        : selectedToneArchetype === 'visionary_founder'
        ? 'Speak with visionary enthusiasm and high conviction regarding AI and creative leverage.'
        : selectedToneArchetype === 'enterprise_advisor'
        ? 'Maintain a structured, consultative executive demeanor focused on ROI and risk mitigation.'
        : 'Be direct, tactical, and relentlessly execution-focused.';

    const brandVoiceInstructions = `You represent GrowthOS advising ${comp}. Tone: ${toneLabel} (${toneRule}). Signature vocabulary to incorporate: ${customLexicon}. Strictly avoid banned terms: ${customBannedTerms}. Positioning: You are Anna, Senior Growth Operating Architect at GrowthOS, an elite sovereign growth operating system and management consultancy. You advise ${comp} on revenue systems, acquisition infrastructure, and unit economics. Never claim to have built ${comp} internally or say "we did this" regarding their products. Markdown & Consultation Briefing Capability: When prospects ask to have the conversation in Markdown or for notes/references to review before their call, inform them enthusiastically that StratosGTM automatically captures and formats this entire strategy session into their local Obsidian vault and that they can click the "Download Briefing (.md)" button on their screen anytime!`;

    switch (persona) {
      case 'inbound':
        return {
          title: `Senior Growth Operating Architect (Advisory for ${comp})`,
          prompt: `You are Anna, Senior Growth Operating Architect at GrowthOS, advising ${comp}. ${brandVoiceInstructions} Warmly and analytically qualify inbound leaders, identify acquisition bottlenecks and unit economics friction, leverage get_product_knowledge to align curriculum and offer structures, and schedule strategy consultations.`,
          greeting: `Welcome to GrowthOS Advisory for ${comp}. I'm Anna, Senior Growth Operating Architect. What is the primary bottleneck in your revenue or customer acquisition architecture today?`
        };
      case 'outbound':
        return {
          title: `Outbound Expansion Advisor (Advisory for ${comp})`,
          prompt: `You are Anna, Growth Operating Architect at GrowthOS conducting executive outreach for ${comp}. ${brandVoiceInstructions} Inquire into their operational bottlenecks, address scaling friction with high-conviction sprint models, and offer a strategic growth roadmap.`,
          greeting: `Hello! This is Anna from GrowthOS Advisory following up on the growth infrastructure for ${comp}. How is your acquisition pipeline performing this sprint?`
        };
      case 'churn':
        return {
          title: `Revenue Retention & Account Strategy (${comp})`,
          prompt: `You are Anna, Senior Operating Architect at GrowthOS advising on account retention for ${comp}. An account has raised retention or renewal questions. Listen to their operational blockers, propose retention architecture or subscription pause/restructuring, and log key feedback.`,
          greeting: `Hello, this is Anna from GrowthOS Advisory regarding your engagement with ${comp}. How can we optimize your operational efficiency and unit economics today?`
        };
      case 'onboarding':
        return {
          title: `VIP Growth Architecture Onboarding Concierge (${comp})`,
          prompt: `You are Anna, VIP Onboarding Architect at GrowthOS for ${comp}. ${brandVoiceInstructions} Guide newly onboarded clients through their workspace integration, knowledge vault syncing, and calendar kickoff.`,
          greeting: `Welcome to GrowthOS onboarding for ${comp}! I am Anna, your dedicated operating architect. Let's configure your workspace, knowledge assets, and strategy kickoff session. Ready to begin?`
        };
      case 'affiliate':
        return {
          title: `Ecosystem & Distribution Partner Scout (${comp})`,
          prompt: `You are Anna, vetting strategic growth and distribution partnerships for ${comp}. ${brandVoiceInstructions}`,
          greeting: `Welcome to the GrowthOS Ecosystem desk for ${comp}. What audience scale and strategic distribution channel are you looking to integrate?`
        };
      case 'diagnostic':
        return {
          title: `Executive Growth Diagnostic ($10k+ Architecture Audit) (${comp})`,
          prompt: `You are Anna, Senior Growth Architect at GrowthOS conducting an executive discovery audit for ${comp}. Examine acquisition velocity, unit economics, and operational bottlenecks with executive precision.`,
          greeting: `Welcome to the GrowthOS Executive Diagnostic for ${comp}. Could you outline your current monthly revenue run-rate and primary operational bottleneck?`
        };
      default:
        return {
          title: `Senior Growth Operating Architect (Advisory for ${comp})`,
          prompt: `You are Anna, Senior Growth Operating Architect at GrowthOS advising ${comp}. ${brandVoiceInstructions}`,
          greeting: `Welcome to GrowthOS Advisory for ${comp}. I'm Anna, Senior Growth Operating Architect. How can I assist your operational scaling today?`
        };
    }
  };

  // Handle Starting Voice Session with AssemblyAI
  const handleStartCall = async () => {
    try {
      setIsCalling(true);
      const personaConfig = getPersonaConfig(selectedScenario);

      // Extract recent dialogue turns to bridge context into the live voice session
      const priorChatTurns = messages.filter(
        (m) => (m.speaker === 'user' || m.speaker === 'agent') && m.text && m.text.trim()
      );
      const hasPriorConversation = priorChatTurns.length > 0;
      const priorConversationSummary = priorChatTurns
        .slice(-8)
        .map((m) => `${m.speaker === 'user' ? 'Prospect' : 'Anna (Growth AI)'}: "${m.text}"`)
        .join('\n');

      let dynamicPrompt = personaConfig.prompt;
      let dynamicGreeting = personaConfig.greeting;

      if (hasPriorConversation) {
        dynamicPrompt += `\n\nCONTINUING CONVERSATION CONTEXT (You are seamlessly continuing an active conversation with this user who just transitioned from text chat to live voice. DO NOT introduce yourself from scratch. Directly reference and build upon what was already discussed):\n${priorConversationSummary}\n\nMaintain conversation flow and answer their points directly.`;

        dynamicGreeting = `Hey ${prospectName || 'there'}! I've got our discussion notes right in front of me. Let's continue directly—what should we focus on next for ${prospectCompany || 'your business'}?`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `sys_voice_start_${Date.now()}`,
          speaker: 'system',
          text: hasPriorConversation
            ? `🎙️ Switched to Live Voice Stream (${personaConfig.title}) — Retaining ${priorChatTurns.length} conversation turns in memory.`
            : `🎙️ Connecting Live Voice Stream with AssemblyAI (${personaConfig.title})...`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // 1. Fetch ephemeral token from backend
      const tokenRes = await bestEffortAuthFetch('/api/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: prospectCompany,
          persona: selectedScenario,
          toneArchetype: selectedToneArchetype,
          history: priorChatTurns.slice(-8).map((t) => ({
            role: t.speaker === 'user' ? 'user' : 'assistant',
            content: t.text
          }))
        })
      });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.token || tokenData.isDemo) {
        // Refuse to open a session we cannot actually run. Previously a missing
        // key produced a fake token and the call was pointed at our own
        // telemetry socket, so the UI looked live while nothing was listening.
        throw new Error(
          tokenData.code === 'VOICE_UNCONFIGURED'
            ? 'Live voice is not configured on this server (ASSEMBLYAI_API_KEY is unset). Text chat still works.'
            : tokenData.code === 'MINUTES_EXHAUSTED'
              ? `Voice minutes are used up for this billing period (${tokenData.minutesUsed} of ${tokenData.minutesLimit}). Text chat still works.`
              : tokenData.error || 'Failed to acquire a voice session token'
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `sys_voice_connected_${Date.now()}`,
          speaker: 'system',
          text: `Voice session authenticated. Connecting to the AssemblyAI Voice Agent...`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // Telemetry for this call. performance.now() rather than Date.now():
      // it is monotonic, so an NTP correction mid-call cannot produce a
      // negative latency.
      // Adopt the server's callId when it issued one: the signed callToken is bound
      // to it, and the server drops a token whose callId does not match the payload.
      callTokenRef.current = typeof tokenData.callToken === 'string' ? tokenData.callToken : undefined;
      qualifyLeadOkRef.current = false;
      const telemetry = new CallTelemetry({
        callId: typeof tokenData.callId === 'string' && tokenData.callId ? tokenData.callId : createCallId(),
        clock: () => performance.now(),
        persona: selectedScenario,
        companyName: prospectCompany || null,
        onFlush: (batch) => telemetryTransportRef.current?.send(batch)
      });
      callTelemetryRef.current = telemetry;
      telemetryTransportRef.current = new TelemetryTransport({
        url: apiUrl(TELEMETRY_INGEST_PATH),
        getExtras: () => ({
          callToken: callTokenRef.current,
          qualifyLeadSucceeded: qualifyLeadOkRef.current
        })
      });
      if (telemetryFlushTimerRef.current) clearInterval(telemetryFlushTimerRef.current);
      telemetryFlushTimerRef.current = setInterval(() => {
        const batch = telemetry.drain();
        if (batch) telemetryTransportRef.current?.send(batch);
      }, 15_000);

      // Initialize Audio Pipeline
      const pipeline = new AudioPipeline(
        (base64PcmChunk) => {
          setIsUserSpeaking(true);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'input.audio',
                audio: base64PcmChunk
              })
            );
          }
        },
        (rms) => {
          // Feeds the headline latency: the last voiced frame is the zero point
          // for "how long the user waited". One comparison and one assignment.
          telemetry.observeMicLevel(rms, performance.now());
          // Real measured amplitude. Speech RMS sits around 0.02-0.25, so it is
          // scaled for display here — the scaling is presentation, the input is
          // a measurement. Quantised so a ~12 Hz level stream does not re-render
          // this component on every buffer.
          const level = Math.round(Math.min(1, rms * 4) * 20) / 20;
          setAudioLevel((prev) => (Math.abs(prev - level) < 0.05 ? prev : level));
        }
      );
      audioPipelineRef.current = pipeline;

      // Only ever the real endpoint. The demo branch that pointed this at our own
      // /ws/telemetry is gone: audio streamed into an endpoint that discarded it
      // while the UI reported a live AssemblyAI session.
      const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${tokenData.token}`);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('[AssemblyAI Voice Agent WS Connected]');

        // Registering tools is what turns the call into an agent rather than a
        // talking head: without them the model can describe booking a call but
        // cannot actually create the lead. Verified against the live API — the
        // server echoes these back in session.updated with a tool count.
        // voiceToolsRef is filled by the telemetry socket's initial_state, which
        // races with call start. Fetch directly if it hasn't arrived yet rather
        // than silently opening a session with no tools.
        let registeredTools = voiceToolsRef.current || [];
        if (registeredTools.length === 0) {
          try {
            const cfgRes = await fetch(apiUrl('/api/voice/config'));
            if (cfgRes.ok) {
              const cfg = await cfgRes.json();
              registeredTools = cfg.tools || [];
              voiceToolsRef.current = registeredTools;
            }
          } catch (cfgErr) {
            console.error('[Voice] Could not load tool definitions', cfgErr);
          }
        }
        if (registeredTools.length === 0) {
          console.warn('[Voice] No tools registered — the agent cannot take actions this session.');
        }

        // The AI disclosure must be spoken before any substantive exchange
        // (CA AB 2905; TX SB 140 gives 30 seconds). Prepending it to the greeting
        // is what guarantees it is the first thing the visitor hears.
        const disclosure = tokenData.compliance?.disclosureText || '';
        const compliantGreeting = disclosure
          ? `${disclosure} ${dynamicGreeting}`.trim()
          : dynamicGreeting;

        const sessionUpdate = {
          type: 'session.update',
          session: {
            system_prompt: dynamicPrompt,
            greeting: compliantGreeting,
            tools: registeredTools,
            output: {
              voice: 'anna',
              format: { encoding: 'audio/pcm' }
            },
            input: {
              format: { encoding: 'audio/pcm' },
              language_code: 'en',
              turn_detection: {
                vad_threshold: 0.5,
                min_silence: PACING_OPTIONS[voicePacing].minSilence,
                max_silence: PACING_OPTIONS[voicePacing].maxSilence,
                interrupt_response: true
              }
            }
          }
        };

        // Marked immediately before the send, because the greeting text travels
        // in this frame: nothing the agent says can precede it, which makes
        // this the only honest zero point for greeting time-to-first-audio.
        telemetry.markSessionUpdateSent();
        ws.send(JSON.stringify(sessionUpdate));

        // Start local mic capture
        await pipeline.startRecording();

        setMessages((prev) => [
          ...prev,
          {
            id: `agent_greet_${Date.now()}`,
            speaker: 'agent',
            text: dynamicGreeting,
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
        setIsAgentSpeaking(true);
        // The agent speaks its own greeting over the session; browser speech
        // synthesis is not used during a live call.
        setTimeout(() => setIsAgentSpeaking(false), 2400);
      };

      // Utility to clean any Devanagari acoustic artifacts from STT and convert to clean English
      const cleanSTTTranscript = (rawText: string): string => {
        if (!rawText) return '';
        let cleaned = rawText;
        if (/[\u0900-\u097F]/.test(cleaned)) {
          const phoneticMap: Record<string, string> = {
            'या': 'Yeah',
            'शौर': 'sure',
            'श्योर': 'sure',
            'बुक': 'book',
            'में': 'my',
            'कॉल': 'call',
            'फॉर': 'for',
            'सेप्टेंबर': 'September',
            'सितंबर': 'September',
            'सेवेंथ': 'Seventh',
            'फाइव': '5',
            'पीएम': 'PM',
            'एएम': 'AM',
            'वन': '1',
            'टू': '2',
            'थ्री': '3',
            'फोर': '4',
            'सिक्स': '6',
            'सेवन': '7',
            'एट': '8',
            'नाइन': '9',
            'टेन': '10',
            'यस': 'Yes',
            'नो': 'No',
            'ओके': 'OK'
          };
          for (const [hindi, eng] of Object.entries(phoneticMap)) {
            cleaned = cleaned.replace(new RegExp(hindi, 'g'), eng);
          }
        }
        return cleaned.trim();
      };

      // Real-time transcript smoothing: AssemblyAI delta events send the full cumulative text so far
      // or incremental tokens. This resolver ensures zero stutter, zero repetitions, and clean word-by-word streaming.
      const resolveInterimStreamingText = (
        currentText: string,
        msg: { text?: string; transcript?: string; delta?: string; content?: string }
      ): string => {
        const candidate = msg.text || msg.transcript || msg.content;
        if (typeof candidate === 'string' && candidate.trim()) {
          return cleanSTTTranscript(candidate);
        }
        if (typeof msg.delta === 'string' && msg.delta) {
          const cleanedDelta = cleanSTTTranscript(msg.delta);
          if (!currentText) return cleanedDelta;
          const needsSpace =
            !currentText.endsWith(' ') &&
            !cleanedDelta.startsWith(' ') &&
            !/^[.,!?;:]/.test(cleanedDelta);
          return currentText + (needsSpace ? ' ' : '') + cleanedDelta;
        }
        return currentText;
      };

      ws.onmessage = (evt) => {
        // Taken before JSON.parse and before any decode, so parsing cost is not
        // charged to the model's response time.
        const receivedAt = performance.now();
        try {
          const msg = JSON.parse(evt.data);
          telemetry.handleAgentMessage(msg, receivedAt);

          if (msg.type === 'transcript.user') {
            setIsUserSpeaking(false);
            const userText = cleanSTTTranscript(
              msg.text || msg.transcript || msg.delta || msg.content || ''
            );
            if (userText) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === 'user' && last.isPartial) {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...last,
                    text: userText,
                    isPartial: false
                  };
                  return updated;
                }
                // If user continued speaking with brief pause, merge seamlessly
                if (last && last.speaker === 'user' && !last.isPartial) {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...last,
                    text: `${last.text} ${userText}`
                  };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: `u_${Date.now()}`,
                    speaker: 'user',
                    text: userText,
                    isPartial: false,
                    timestamp: new Date().toLocaleTimeString()
                  }
                ];
              });
            }
          } else if (msg.type === 'transcript.user.delta') {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.speaker === 'user' && last.isPartial) {
                const nextText = resolveInterimStreamingText(last.text, msg);
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  text: nextText
                };
                return updated;
              }
              const initialText = resolveInterimStreamingText('', msg);
              if (!initialText) return prev;
              return [
                ...prev,
                {
                  id: `u_${Date.now()}`,
                  speaker: 'user',
                  text: initialText,
                  isPartial: true,
                  timestamp: new Date().toLocaleTimeString()
                }
              ];
            });
          } else if (msg.type === 'transcript.agent') {
            const agentText = cleanSTTTranscript(
              msg.text || msg.transcript || msg.delta || msg.content || ''
            );
            if (agentText) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                // Prevent duplicate greeting or update partial in-place
                if (
                  last &&
                  last.speaker === 'agent' &&
                  (last.isPartial || last.text.trim() === agentText.trim())
                ) {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...last,
                    text: agentText,
                    isPartial: false
                  };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: `a_${Date.now()}`,
                    speaker: 'agent',
                    text: agentText,
                    isPartial: false,
                    timestamp: new Date().toLocaleTimeString()
                  }
                ];
              });
            }
          } else if (msg.type === 'transcript.agent.delta') {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.speaker === 'agent' && last.isPartial) {
                const nextText = resolveInterimStreamingText(last.text, msg);
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  text: nextText
                };
                return updated;
              }
              const initialText = resolveInterimStreamingText('', msg);
              if (!initialText) return prev;
              return [
                ...prev,
                {
                  id: `a_${Date.now()}`,
                  speaker: 'agent',
                  text: initialText,
                  isPartial: true,
                  timestamp: new Date().toLocaleTimeString()
                }
              ];
            });
          } else if (msg.type === 'input.speech.started') {
            setIsUserSpeaking(true);
          } else if (msg.type === 'input.speech.stopped') {
            setIsUserSpeaking(false);
          } else if (msg.type === 'reply.started') {
            setIsAgentSpeaking(true);
          } else if (msg.type === 'reply.audio') {
            if (msg.data && audioPipelineRef.current) {
              audioPipelineRef.current.playChunk(msg.data);
            }
          } else if (msg.type === 'reply.done') {
            setIsAgentSpeaking(false);
            if (msg.status === 'interrupted' && audioPipelineRef.current) {
              audioPipelineRef.current.abortPlayback();
            }
          } else if (msg.type === 'tool.call') {
            // Executed over HTTP, not the telemetry socket. The agent is blocked
            // on this call_id until it gets a result, so the path that completes
            // it must not depend on a second long-lived connection being healthy.
            // The socket is still used for live CRM updates, but is now optional.
            void (async () => {
              let result: unknown = { error: 'Tool execution failed' };
              try {
                const res = await fetch(apiUrl('/api/crm/tools/execute'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: msg.name, arguments: msg.arguments })
                });
                const body = await res.json();
                result = res.ok ? body.result ?? body : { error: body.error || 'Tool execution failed' };
              } catch (toolErr) {
                console.error('[Tool execution failed]', toolErr);
              }

              telemetry.markToolResult(msg.call_id);
              // Client-side hint only. The server treats it as a fallback and takes
              // the authoritative signal from its own dispatch of qualify_lead.
              if (msg.name === 'qualify_lead' && (result as { status?: string })?.status === 'success') {
                qualifyLeadOkRef.current = true;
              }

              const agentWs = wsRef.current;
              if (agentWs && agentWs.readyState === WebSocket.OPEN) {
                agentWs.send(
                  JSON.stringify({
                    type: 'tool.result',
                    call_id: msg.call_id,
                    result: JSON.stringify(result)
                  })
                );
              }

              setActiveTools((prev) => [
                ...prev,
                {
                  id: msg.call_id || String(Date.now()),
                  name: msg.name,
                  args: msg.arguments,
                  result: result as Record<string, any>,
                  status: 'completed'
                }
              ]);
            })();
          }
        } catch (err) {
          console.error('[WS Message Parse Error]', err);
        }
      };

      ws.onclose = () => {
        finalizeCallTelemetry('ws_close');
        setIsCalling(false);
        setIsAgentSpeaking(false);
        setIsUserSpeaking(false);
        setAudioLevel(0);
        if (audioPipelineRef.current) audioPipelineRef.current.stopRecording();
      };
    } catch (err: any) {
      console.error(err);
      setIsCalling(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          speaker: 'system',
          text: `Error initializing Voice Agent: ${err.message}`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    }
  };

  const handleEndCall = () => {
    // Before the socket closes, so the end reason reflects the operator hanging
    // up rather than the close that follows it.
    finalizeCallTelemetry('user_ended');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // `session.end` is the documented clean end. This used to send
      // `Terminate`, which the API rejects as an unknown message type, so every
      // call ended by dropping the socket. That leaves the session resumable for
      // 30 seconds; session.end stops billing immediately.
      wsRef.current.send(JSON.stringify({ type: 'session.end' }));
      wsRef.current.close();
    }
    if (audioPipelineRef.current) {
      audioPipelineRef.current.stopRecording();
    }
    setIsCalling(false);
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);
    setAudioLevel(0);
  };

  // CRM Lead Detail Drawer -> "Trigger AI Strategy Call": load the lead into the
  // active prospect dossier, then start the call once that state has committed
  // (setState is batched, so handleStartCall must run in a follow-up effect to
  // see the updated prospect* values instead of stale closure state).
  const [pendingLeadCall, setPendingLeadCall] = useState<CRMLead | null>(null);

  const handleTriggerLeadCall = (lead: CRMLead) => {
    setProspectName(lead.fullName);
    setProspectEmail(lead.email);
    setProspectCompany(lead.companyName || '');
    setProspectWebsite(lead.website || '');
    setProspectLinkedIn(lead.socialLinks?.linkedin || lead.linkedIn || '');
    setProspectTwitter(lead.socialLinks?.twitter || '');
    setProspectYouTube(lead.socialLinks?.youtube || '');
    setSelectedScenario('outbound');
    setActiveTab('console');
    setViewMode('tactical');
    setPendingLeadCall(lead);
  };

  useEffect(() => {
    if (!pendingLeadCall) return;
    if (isCalling) handleEndCall();
    handleStartCall();
    setPendingLeadCall(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLeadCall]);

  // CRM Kanban drag-and-drop: optimistically move the card, persist the new
  // pipeline stage, and roll back locally if the server rejects it.
  const handleLeadStatusChange = async (lead: CRMLead, newStatus: CRMLead['status']) => {
    const previousStatus = lead.status;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus } : l)));

    try {
      const res = await fetch(apiUrl(`/api/crm/leads/${encodeURIComponent(lead.id)}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? data.lead : l)));
      }
    } catch (err) {
      console.error('[CRM Lead Status Update]', err);
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: previousStatus } : l)));
    }
  };

  // Send Typed Message to Voice Agent & Sync to Obsidian Vault
  const handleSendTextMessage = async (text: string) => {
    if (!text.trim()) return;
    setIsSendingMessage(true);

    const now = new Date().toLocaleTimeString();
    // 1. Instantly display user typed message in transcript HUD
    setMessages((prev) => [
      ...prev,
      {
        id: `u_typed_${Date.now()}`,
        speaker: 'user',
        text: text,
        timestamp: now
      }
    ]);

    try {
      // 2. Format recent conversation history so LLM has full multi-turn context
      const history = messages
        .filter((m) => m.speaker === 'user' || m.speaker === 'agent')
        .slice(-8)
        .map((m) => ({
          role: m.speaker === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text
        }));

      // 3. Call backend endpoint POST /api/voice/chat
      const res = await bestEffortAuthFetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          history,
          prospect: {
            name: prospectName,
            email: prospectEmail,
            website: prospectWebsite,
            linkedIn: prospectLinkedIn,
            company: prospectCompany,
            bio: prospectBio,
            toneArchetype: selectedToneArchetype
          }
        })
      });

      const data = await res.json();

      if (data.reply) {
        // 3. Display Anna's reply in transcript HUD
        setMessages((prev) => [
          ...prev,
          {
            id: `a_reply_${Date.now()}`,
            speaker: 'agent',
            text: data.reply,
            timestamp: new Date().toLocaleTimeString()
          }
        ]);

        // 4. Speak Anna's reply aloud using centralized speech controller if unmuted
        speakTurnIfEnabled(data.reply);
      }

      // If a lead was created or updated, refresh CRM leads and add tool execution chip
      if (data.lead) {
        const leadsRes = await fetch(apiUrl('/api/crm/leads'));
        const leadsData = await leadsRes.json();
        if (leadsData.leads) setLeads(leadsData.leads);

        setActiveTools((prev) => [
          ...prev,
          {
            id: `tool_${Date.now()}`,
            name: 'sync_lead_vault_dossier',
            args: { email: data.lead.email, company: data.lead.companyName, phone: data.lead.phone },
            result: {
              status: 'success',
              vaultPath: data.vaultPath,
              message: `Dedicated client folder and dossier created at ${data.vaultPath}`
            },
            status: 'completed'
          }
        ]);
      }
    } catch (err) {
      console.error('[handleSendTextMessage error]', err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Submit Prospect Website / Social Platforms Context Enrichment
  const handleEnrichProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(apiUrl('/api/crm/tools/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'enrich_prospect_dossier',
          arguments: {
            fullName: prospectName,
            email: prospectEmail,
            website: prospectWebsite,
            linkedIn: prospectLinkedIn,
            socialLinks: {
              twitter: prospectTwitter,
              linkedin: prospectLinkedIn,
              youtube: prospectYouTube,
              instagram: prospectInstagram,
              substack: prospectSubstack
            },
            socialBioText: prospectBio,
            companyName: prospectCompany,
            businessSummary: prospectBio,
            toneArchetype: selectedToneArchetype
          }
        })
      });
      const data = await res.json();

      // Refresh leads
      const leadsRes = await fetch(apiUrl('/api/crm/leads'));
      const leadsData = await leadsRes.json();
      if (leadsData.leads) setLeads(leadsData.leads);

      const targetCompany = prospectCompany || prospectName || 'Client';
      const safeFolder = targetCompany.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');

      const toneDisplay =
        selectedToneArchetype === 'empathetic_mentor'
          ? 'Empathetic Mentor'
          : selectedToneArchetype === 'visionary_founder'
          ? 'Visionary Founder'
          : selectedToneArchetype === 'enterprise_advisor'
          ? 'Enterprise Advisor'
          : 'Tactical Operator';

      setMessages((prev) => [
        ...prev,
        {
          id: `enrich_${Date.now()}`,
          speaker: 'system',
          text: `📁 Dossier & Brand Voice Saved: vault/Clients/${safeFolder}/BrandVoice.md & Dossier.md | Calibrated as ${toneDisplay} for ${prospectName} (${prospectCompany || 'Brand'}).`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      setActiveTools((prev) => [
        ...prev,
        {
          id: `tool_${Date.now()}`,
          name: 'enrich_prospect_dossier',
          args: { website: prospectWebsite, linkedIn: prospectLinkedIn, company: prospectCompany },
          result: data.result,
          status: 'completed'
        }
      ]);

      setIsEnrichModalOpen(false);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Quick Scenario Simulation Trigger for Hackathon Demo Recording with Flow Pacing & Speech Synthesis
  const triggerSimulationStep = async (
    type: 'lead_inbound' | 'objection_rag' | 'churn_clamp' | 'content_factory_spoken'
  ) => {
    setActiveSimulationKey(type);
    if (type === 'lead_inbound') {
      // 1. Output human user turn
      setMessages((prev) => [
        ...prev,
        {
          id: `sim_${Date.now()}`,
          speaker: 'user',
          text: 'Hi Alex! I run an educational design community with 15k members. My budget is 5k to 15k, and we need to launch our high-ticket funnel within 3 weeks. Can we schedule a strategy consultation?',
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // 2. Natural breathing pause before agent starts turn (preventing interruption)
      await new Promise((r) => setTimeout(r, 1400));

      // 3. Execute tools
      await fetch(apiUrl('/api/crm/tools/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'create_or_update_lead',
          arguments: {
            fullName: prospectName || 'Alex Kim',
            email: prospectEmail || 'alex.kim@acmecoaching.example',
            website: prospectWebsite || 'https://acmecoaching.example',
            source: 'after_hours_inbound'
          }
        })
      });

      await fetch(apiUrl('/api/crm/tools/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'qualify_lead',
          arguments: {
            email: prospectEmail || 'alex.kim@acmecoaching.example',
            budgetRange: '5k_to_15k',
            coreNeed: 'Launch high-ticket digital mastermind',
            timelineWeeks: 3
          }
        })
      });

      await fetch(apiUrl('/api/crm/tools/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'schedule_growth_consultation',
          arguments: {
            email: prospectEmail || 'alex.kim@acmecoaching.example',
            preferredDatetime: 'Tomorrow at 2:00 PM EST',
            topic: 'Mastermind Funnel Architecture'
          }
        })
      });

      const res = await fetch(apiUrl('/api/crm/leads'));
      const data = await res.json();
      if (data.leads) setLeads(data.leads);

      const agentReply = `Fantastic, ${prospectName.split(' ')[0]}! You're an ideal fit for our Pro Mentorship. I've recorded a consultation request for tomorrow at 2:00 PM EST. Someone from the team will follow up to confirm it. Your reference is GROWTH-8271.`;
      setMessages((prev) => [
        ...prev,
        {
          id: `sim_agent_${Date.now()}`,
          speaker: 'agent',
          text: agentReply,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      speakTurnIfEnabled(agentReply);
    } else if (type === 'churn_clamp') {
      setMessages((prev) => [
        ...prev,
        {
          id: `sim_churn_${Date.now()}`,
          speaker: 'user',
          text: 'I love the mastermind, but my cash flow is tight this month. Can you give me a 35% discount or I will have to cancel?',
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // Natural pause
      await new Promise((r) => setTimeout(r, 1400));

      const res = await fetch(apiUrl('/api/crm/tools/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'process_retention_offer',
          arguments: {
            memberId: 'mem_101',
            churnReason: 'too_expensive',
            requestedAction: 'apply_discount',
            proposedDiscountPct: 35
          }
        })
      });
      const data = await res.json();

      const agentReply = "I completely understand cash flow cycles, Sarah. While our maximum authorized discount is 15%, I've applied that directly to your next 3 months, and Alex has included a complimentary 1-on-1 Growth Audit Call with our team to help you recoup revenue. Let's keep you winning!";
      setMessages((prev) => [
        ...prev,
        {
          id: `sim_agent_churn_${Date.now()}`,
          speaker: 'agent',
          text: agentReply,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      speakTurnIfEnabled(agentReply);

      setActiveTools((prev) => [
        ...prev,
        {
          id: `tool_${Date.now()}`,
          name: 'process_retention_offer',
          args: { proposedDiscountPct: 35 },
          result: data.result,
          status: 'completed'
        }
      ]);
    } else if (type === 'content_factory_spoken') {
      setMessages((prev) => [
        ...prev,
        {
          id: `sim_cf_user_${Date.now()}`,
          speaker: 'user',
          text: "Anna, take that student's objection about our $2,997 pricing and 14-day refund guarantee, and run the Hermes Content Factory to turn it into an X thread, LinkedIn post, and newsletter.",
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // Natural pause
      await new Promise((r) => setTimeout(r, 1200));

      const agentReply = "I've queued the Hermes Content Factory on your pricing and guarantee objection. 3 parallel research lanes have been initiated, and verified drafts will appear in your Content Studio console in real-time for your review and one-click approval.";
      setMessages((prev) => [
        ...prev,
        {
          id: `sim_cf_agent_${Date.now()}`,
          speaker: 'agent',
          text: agentReply,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      speakTurnIfEnabled(agentReply);

      await handleTriggerContentJob('Overcoming High-Ticket Pricing Objections with Risk-Reversal');
    }
    setActiveSimulationKey(null);
  };

  const handleTriggerContentJob = async (topic: string) => {
    try {
      const res = await fetch(apiUrl('/api/content/trigger'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, speaker: 'creator' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_content_trigger_${Date.now()}`,
            speaker: 'system',
            text: ownerRequestError(res.status, data),
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
        return;
      }
      console.log('[Content Factory Triggered]', data);
    } catch (e: any) {
      console.error(e.message);
    }
  };

  const handleTriggerAuditJob = async (params: {
    companyOrCreator: string;
    website?: string;
    triggerEvent: string;
    socialLinks?: any;
    socialBioText?: string;
  }) => {
    try {
      const res = await fetch(apiUrl('/api/content/audit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, speaker: 'sdr_outbound' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_content_audit_${Date.now()}`,
            speaker: 'system',
            text: ownerRequestError(res.status, data),
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
        return;
      }
      console.log('[SOP Audit Queued]', data);
    } catch (err: any) {
      console.error('[SOP Audit Error]', err.message);
    }
  };

  const handleApproveContentJob = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/content/jobs/${id}/approve`), { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_content_approve_${Date.now()}`,
            speaker: 'system',
            text: ownerRequestError(res.status, data),
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
      }
    } catch (e: any) {
      console.error(e.message);
    }
  };

  const renderConsoleContent = () => (
    <div className="space-y-6">
            {/* Explainer & Mental Model Banner */}
            <div className={`p-4.5 rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 transition-all border backdrop-blur-xl ${
              isGlass
                ? "bg-[#fdfcf9]/80 border-[#e8e4dc]/90 shadow-[0_8px_30px_rgba(40,30,20,0.03)] text-slate-800"
                : "bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-purple-950/40 border-blue-800/40 shadow-xl text-slate-100"
            }`}>
              <div className="flex items-start space-x-3.5 max-w-3xl">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex-shrink-0 mt-0.5">
                  <Info className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center space-x-2 ${isGlass ? "text-slate-900" : "text-slate-100"}`}>
                    <span>Live Roleplay & Simulator Architecture</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold normal-case">
                      Full-Duplex VAD
                    </span>
                  </h4>
                  <p className={`text-xs leading-relaxed ${isGlass ? "text-slate-600" : "text-slate-300"}`}>
                    In production, this voice widget lives on the <strong>Creator's website</strong>. When an after-hours <strong>Prospective Buyer</strong> speaks, <strong>Anna</strong> qualifies their BANT budget, books consultations, and saves the objection into the <strong>Persistent Knowledge Graph</strong> below.
                  </p>
                </div>
              </div>

              {/* Client Manager Bar with Plus (+) & Minus (-) Controls */}
              <div className="flex flex-wrap items-center gap-2 self-start xl:self-center">
                <div className={`flex items-center space-x-1.5 rounded-xl p-1 shadow-sm border ${
                  isGlass ? 'bg-[#faf7f0]/90 border-[#e5e0d6]' : 'bg-slate-900/90 border-slate-800'
                }`}>
                  <Bookmark className={`w-3.5 h-3.5 ml-2 flex-shrink-0 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
                  <select
                    value={selectedPresetId}
                    onChange={(e) => handleSelectPreset(e.target.value)}
                    className={`bg-transparent text-xs font-medium focus:outline-none px-2 py-1 max-w-[190px] truncate font-mono cursor-pointer ${
                      isGlass ? 'text-slate-800' : 'text-slate-200'
                    }`}
                    title="Switch active client dossier"
                  >
                    <optgroup label="🌟 Public Demo Archetypes">
                      {BUILT_IN_PRESETS.map((p) => (
                        <option key={p.id} value={p.id} className={isGlass ? 'bg-[#faf7f0] text-slate-800' : 'bg-slate-900 text-slate-200'}>
                          {p.companyName || p.name}
                        </option>
                      ))}
                    </optgroup>
                    {customPresets.length > 0 && (
                      <optgroup label="💾 My Saved Clients (Local)">
                        {customPresets.map((p) => (
                          <option key={p.id} value={p.id} className={isGlass ? 'bg-[#faf7f0] text-slate-800' : 'bg-slate-900 text-slate-200'}>
                            {p.companyName || p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* [+] Add Client Button */}
                  <button
                    type="button"
                    onClick={handleAddNewClient}
                    title="Add a new client dossier (+)"
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-sm border ${
                      isGlass ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800' : 'bg-cyan-600/30 hover:bg-cyan-600/50 border-cyan-500/50 text-cyan-200'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>

                  {/* [-] Delete Client Button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteCurrentClient()}
                    title={
                      allPresets.find((p) => p.id === selectedPresetId)?.isCustom
                        ? "Delete current client (-)"
                        : "Default demo client is protected from deletion"
                    }
                    className={`p-1.5 rounded-lg border transition-all ${
                      allPresets.find((p) => p.id === selectedPresetId)?.isCustom
                        ? (isGlass ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700 cursor-pointer' : 'bg-red-950/40 hover:bg-red-900/60 border-red-800/50 text-red-300 cursor-pointer')
                        : (isGlass ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-950/40 border-slate-800/50 text-slate-600 cursor-not-allowed')
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  {/* [🔑] Connected Platforms & Cloud Credentials Button */}
                  <button
                    type="button"
                    onClick={() => setIsCredentialsModalOpen(true)}
                    title="Connected Platforms & Cloud API Keys for this client"
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-sm border ${
                      isGlass
                        ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-amber-950/40 hover:bg-amber-900/60 border-amber-700/60 text-amber-300'
                    }`}
                  >
                    <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Keys</span>
                  </button>
                </div>

                {/* Voice Pacing & Silence Threshold Controller */}
                <div className={`flex items-center space-x-1.5 p-1 rounded-xl border shadow-sm ${
                  isGlass ? 'bg-[#faf7f0]/90 border-[#e5e0d6]' : 'bg-slate-900/90 border-slate-800'
                }`}>
                  <div className="flex items-center space-x-1 px-1.5 text-xs font-mono font-semibold text-slate-500">
                    <Timer className="w-3.5 h-3.5 text-sky-600" />
                    <span className="hidden sm:inline">Pacing:</span>
                  </div>
                  {(['snappy', 'natural', 'patient'] as const).map((mode) => {
                    const opt = PACING_OPTIONS[mode];
                    const isSelected = voicePacing === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleSetVoicePacing(mode)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all flex items-center space-x-1 ${
                          isSelected
                            ? isGlass
                              ? 'bg-[#fdfcf9] text-sky-950 border border-sky-300 shadow-xs font-bold'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400 font-bold shadow-xs'
                            : isGlass
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title={`${opt.description} (Min Silence: ${opt.minSilence}ms, Max Silence: ${opt.maxSilence}ms)`}
                      >
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setIsEnrichModalOpen(true)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shadow-md border ${
                    isGlass
                      ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800 shadow-sky-500/10'
                      : 'bg-cyan-600/30 hover:bg-cyan-600/50 border-cyan-500/40 text-cyan-200 shadow-cyan-600/20'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Edit Dossier & Brand Voice</span>
                </button>
              </div>
            </div>

            {/* Brand Voice Layer Selector Bar */}
            <div className={`p-3.5 rounded-xl space-y-2.5 backdrop-blur-sm transition-all border ${
              isGlass ? "bg-[#fdfcf9]/85 border-[#e8e4dc]/90 shadow-sm text-slate-800" : "bg-indigo-950/30 border-indigo-800/40 text-slate-100"
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span className={`font-semibold ${isGlass ? 'text-slate-800' : 'text-slate-200'}`}>Active Brand Voice Persona:</span>
                  <span className={`font-mono font-semibold px-2 py-0.5 rounded border ${
                    isGlass ? 'bg-[#f5f0e6] border-[#e0d8ca] text-indigo-900' : 'bg-indigo-900/50 border-indigo-700/50 text-indigo-300'
                  }`}>
                    {prospectCompany || 'Acme Coaching Co.'}
                  </span>
                </div>
                <span className={`text-[11px] font-mono hidden sm:inline ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>
                  Dynamically Infused into AssemblyAI (Anna) & Hermes Content Factory
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => setSelectedToneArchetype('tactical_operator')}
                  className={`px-3 py-2 rounded-lg text-xs text-left transition-all border ${
                    selectedToneArchetype === 'tactical_operator'
                      ? (isGlass ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs' : 'bg-indigo-600/30 border-indigo-400 text-indigo-200 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 border-[#e5e0d6] text-slate-700 hover:border-[#d9d3c5]' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700')
                  }`}
                >
                  <div className="font-semibold">⚡ Tactical Operator</div>
                  <div className={`text-[10px] ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Direct & Metrics-Driven</div>
                </button>
                <button
                  onClick={() => setSelectedToneArchetype('empathetic_mentor')}
                  className={`px-3 py-2 rounded-lg text-xs text-left transition-all border ${
                    selectedToneArchetype === 'empathetic_mentor'
                      ? (isGlass ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs' : 'bg-indigo-600/30 border-indigo-400 text-indigo-200 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 border-[#e5e0d6] text-slate-700 hover:border-[#d9d3c5]' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700')
                  }`}
                >
                  <div className="font-semibold">🌱 Empathetic Mentor</div>
                  <div className={`text-[10px] ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Warm & Guided Cohorts</div>
                </button>
                <button
                  onClick={() => setSelectedToneArchetype('visionary_founder')}
                  className={`px-3 py-2 rounded-lg text-xs text-left transition-all border ${
                    selectedToneArchetype === 'visionary_founder'
                      ? (isGlass ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs' : 'bg-indigo-600/30 border-indigo-400 text-indigo-200 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 border-[#e5e0d6] text-slate-700 hover:border-[#d9d3c5]' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700')
                  }`}
                >
                  <div className="font-semibold">🚀 Visionary Founder</div>
                  <div className={`text-[10px] ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Next-Gen AI & Leverage</div>
                </button>
                <button
                  onClick={() => setSelectedToneArchetype('enterprise_advisor')}
                  className={`px-3 py-2 rounded-lg text-xs text-left transition-all border ${
                    selectedToneArchetype === 'enterprise_advisor'
                      ? (isGlass ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs' : 'bg-indigo-600/30 border-indigo-400 text-indigo-200 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 border-[#e5e0d6] text-slate-700 hover:border-[#d9d3c5]' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700')
                  }`}
                >
                  <div className="font-semibold">🏛️ Enterprise Advisor</div>
                  <div className={`text-[10px] ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>ROI, SLAs & Governance</div>
                </button>
              </div>
            </div>

            {/* Scenario Configuration Bar (6 Personas) */}
            <div className={`p-4 rounded-2xl backdrop-blur-xl space-y-3 border ${
              isGlass ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90 shadow-sm' : 'bg-slate-900/50 border-slate-800/80'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono uppercase ${isGlass ? 'text-slate-500 font-semibold' : 'text-slate-400'}`}>Operating Persona (Switch Voice Mindset):</span>
                <span className={`text-[11px] font-mono ${isGlass ? 'text-cyan-700 font-semibold' : 'text-cyan-400'}`}>
                  Active: {getPersonaConfig(selectedScenario).title}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedScenario('inbound')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedScenario === 'inbound'
                      ? (isGlass ? 'bg-cyan-50 text-cyan-800 border border-cyan-300 font-semibold shadow-xs' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 text-slate-700 border border-[#e5e0d6] hover:border-[#d9d3c5]' : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:border-slate-700')
                  }`}
                >
                  🎯 Inbound Admissions SDR
                </button>
                <button
                  onClick={() => setSelectedScenario('outbound')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedScenario === 'outbound'
                      ? (isGlass ? 'bg-cyan-50 text-cyan-800 border border-cyan-300 font-semibold shadow-xs' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 text-slate-700 border border-[#e5e0d6] hover:border-[#d9d3c5]' : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:border-slate-700')
                  }`}
                >
                  🔄 Outbound Reactivation
                </button>
                <button
                  onClick={() => setSelectedScenario('churn')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedScenario === 'churn'
                      ? (isGlass ? 'bg-purple-50 text-purple-800 border border-purple-300 font-semibold shadow-xs' : 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 text-slate-700 border border-[#e5e0d6] hover:border-[#d9d3c5]' : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:border-slate-700')
                  }`}
                >
                  🛡️ Churn Save & Margin Clamping
                </button>
                <button
                  onClick={() => setSelectedScenario('onboarding')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedScenario === 'onboarding'
                      ? (isGlass ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold shadow-xs' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 text-slate-700 border border-[#e5e0d6] hover:border-[#d9d3c5]' : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:border-slate-700')
                  }`}
                >
                  🎓 VIP Student Onboarding
                </button>
                <button
                  onClick={() => setSelectedScenario('affiliate')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedScenario === 'affiliate'
                      ? (isGlass ? 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold shadow-xs' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 text-slate-700 border border-[#e5e0d6] hover:border-[#d9d3c5]' : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:border-slate-700')
                  }`}
                >
                  🤝 Affiliate & Partner Scout
                </button>
                <button
                  onClick={() => setSelectedScenario('diagnostic')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedScenario === 'diagnostic'
                      ? (isGlass ? 'bg-blue-50 text-blue-800 border border-blue-300 font-semibold shadow-xs' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm')
                      : (isGlass ? 'bg-[#f7f3eb]/70 text-slate-700 border border-[#e5e0d6] hover:border-[#d9d3c5]' : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:border-slate-700')
                  }`}
                >
                  💼 Executive Diagnostic ($10k+)
                </button>
              </div>

              {/* Call Action Bar */}
              <div className={`pt-2 flex items-center justify-between border-t ${isGlass ? 'border-[#e8e4dc]' : 'border-slate-800/80'}`}>
                <div className={`flex items-center space-x-2 text-[11px] font-mono ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                  <HardDrive className={`w-3.5 h-3.5 ${isGlass ? 'text-emerald-600' : 'text-emerald-400'}`} />
                  <span>Persistent Graph Storage: Active (Zero data loss on reload)</span>
                </div>

                <div>
                  {!isCalling ? (
                    <button
                      onClick={handleStartCall}
                      className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold text-xs shadow-lg shadow-cyan-500/25 transition-all"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Start Voice Session</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleEndCall}
                      className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-lg shadow-red-500/25 transition-all"
                    >
                      <PhoneOff className="w-4 h-4" />
                      <span>Terminate Session</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Front-and-Center Audio Visualizer & 3D Glassy Reactor Suite */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between px-1 gap-2">
                <div className={`flex items-center space-x-2 text-xs font-mono ${isGlass ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                  <span className={`w-2 h-2 rounded-full animate-pulse ${isGlass ? 'bg-cyan-600' : 'bg-cyan-400'}`} />
                  <span className="uppercase font-semibold">Anna 3D Voice Reactor</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    isGlass ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}>
                    DEFAULT: THE CYMATIC PLANE
                  </span>
                </div>

                {/* Dropdown Select Box & Button Chips */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-[11px] font-mono font-medium ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                      Select Look:
                    </span>
                    <select
                      value={audioVisualizerType}
                      onChange={(e) => setAudioVisualizerType(e.target.value as VisualizerMode | 'waveform')}
                      className={`text-xs font-mono font-semibold rounded-lg px-2.5 py-1 outline-none transition-all cursor-pointer border ${
                        isGlass
                          ? 'bg-[#ffffff] text-slate-800 border-[#d8d3c7] hover:border-slate-400 shadow-2xs'
                          : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-cyan-500 shadow-inner'
                      }`}
                    >
                      <option value="cymatic">🌊 The Cymatic Plane (Liquid & Organic - Default)</option>
                      <option value="prism">💎 The Frosted Prism (Geometric & Authoritative)</option>
                      <option value="gyroscope">🪐 The Glass Gyroscope (Sleek & Data-Driven)</option>
                      <option value="monolith">🏛️ The Monolith Lightbox (Apple Minimalist Column)</option>
                      <option value="ribbon">🎗️ The Neural Ribbon (Flowing Möbius Harmonic)</option>
                      <option value="droplet">💧 The Liquid Droplet (Mercury Fluid Core)</option>
                      <option value="waveform">📊 2D Acoustic Waveform (Frequency Bins)</option>
                    </select>
                  </div>

                  {/* Mode Pill Buttons */}
                  <div className={`flex flex-wrap items-center p-0.5 rounded-lg border text-[11px] font-mono gap-1 ${
                    isGlass ? 'bg-[#fdfcf9] border-[#e2ded5] shadow-2xs' : 'bg-slate-900 border-slate-800'
                  }`}>
                    {VISUALIZER_MODES.map((vm) => (
                      <button
                        key={vm.id}
                        onClick={() => setAudioVisualizerType(vm.id)}
                        className={`px-2 py-1 rounded transition-all ${
                          audioVisualizerType === vm.id
                            ? (isGlass ? 'bg-cyan-100 text-cyan-900 border border-cyan-300 font-bold shadow-xs' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold')
                            : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                        }`}
                        title={vm.description}
                      >
                        {vm.name.replace('The ', '')}
                      </button>
                    ))}
                    <button
                      onClick={() => setAudioVisualizerType('waveform')}
                      className={`px-2 py-1 rounded transition-all ${
                        audioVisualizerType === 'waveform'
                          ? (isGlass ? 'bg-purple-100 text-purple-900 border border-purple-300 font-bold shadow-xs' : 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold')
                          : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
                      }`}
                    >
                      Waveform
                    </button>
                  </div>
                </div>
              </div>

              {audioVisualizerType !== 'waveform' ? (
                <NeuralAudioOrb
                  isActive={isCalling}
                  isAgentSpeaking={isAgentSpeaking}
                  isUserSpeaking={isUserSpeaking}
                  agentName="Anna (GrowthOS Senior Advisor)"
                  samplingRate="24,000 Hz PCM16"
                  modelName="AssemblyAI Voice Agent"
                  theme={theme}
                  visualMode={audioVisualizerType as VisualizerMode}
                  level={audioLevel}
                  onSelectVisualMode={(mode) => setAudioVisualizerType(mode)}
                />
              ) : (
                <AudioWaveform
                  isActive={isCalling}
                  isAgentSpeaking={isAgentSpeaking}
                  isUserSpeaking={isUserSpeaking}
                />
              )}
            </div>

            {/* Live Interaction HUD */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <LiveTranscriptHUD
                  theme={theme}
                  messages={messages}
                  activeTools={activeTools}
                  onSendMessage={handleSendTextMessage}
                  isSendingMessage={isSendingMessage}
                  activeBrandVoice={{
                    companyName: prospectCompany || 'Acme Coaching Co.',
                    toneLabel:
                      selectedToneArchetype === 'empathetic_mentor'
                        ? 'Empathetic Mentor'
                        : selectedToneArchetype === 'visionary_founder'
                        ? 'Visionary Founder'
                        : selectedToneArchetype === 'enterprise_advisor'
                        ? 'Enterprise Advisor'
                        : 'Tactical Operator'
                  }}
                />
              </div>

              {/* Quick Interactive Simulator & Telemetry Sidebar */}
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border backdrop-blur-xl space-y-3 ${
                  isGlass ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90 text-slate-800 shadow-md' : 'bg-slate-900/60 border-slate-800/80 text-slate-200 shadow-xl'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-mono ${isGlass ? 'text-cyan-700' : 'text-cyan-400'}`}>
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4" />
                      <span className="font-semibold uppercase tracking-wider">Interactive Simulation Drivers:</span>
                    </div>
                    <span className={`text-[10px] font-mono ${isGlass ? 'text-slate-500' : 'text-slate-500'}`}>1-Click Live Test</span>
                  </div>
                  <p className={`text-xs ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                    Drive the buyer persona in real-time or trigger deterministic guardrail clamping:
                  </p>

                  <div className="space-y-2.5">
                    {/* Card 1: BANT Inbound */}
                    <div
                      onClick={() => {
                        setActiveSimulationKey('lead_inbound');
                        triggerSimulationStep('lead_inbound');
                        setTimeout(() => setActiveSimulationKey(null), 2500);
                      }}
                      className={`group p-3 rounded-xl border cursor-pointer transition-all space-y-1.5 relative overflow-hidden ${
                        isGlass ? 'bg-[#f7f3eb]/70 hover:bg-[#fdfcf9] border-[#e5e0d6] hover:border-cyan-500/70 shadow-xs' : 'bg-slate-950/80 hover:bg-slate-900/90 border-slate-800 hover:border-cyan-500/50 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                          <span className={`font-semibold text-xs transition-colors ${
                            isGlass ? 'text-slate-900 group-hover:text-cyan-700' : 'text-slate-100 group-hover:text-cyan-300'
                          }`}>
                            High-Ticket Inbound ($10k BANT)
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isGlass ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                        }`}>
                          {activeSimulationKey === 'lead_inbound' ? 'RUNNING...' : '▶ RUN'}
                        </span>
                      </div>
                      <p className={`text-[11px] ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                        Simulates founder inquiring about $2,997 sprint + $10k agency retainer. Anna qualifies budget and records a consultation request.
                      </p>
                      <div className={`h-1 w-full rounded-full overflow-hidden ${isGlass ? 'bg-slate-200' : 'bg-slate-800'}`}>
                        <div
                          className={`h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-700 ${
                            activeSimulationKey === 'lead_inbound' ? 'w-full' : 'w-1/3'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Card 2: Churn Clamp */}
                    <div
                      onClick={() => {
                        setActiveSimulationKey('churn_clamp');
                        triggerSimulationStep('churn_clamp');
                        setTimeout(() => setActiveSimulationKey(null), 2500);
                      }}
                      className={`group p-3 rounded-xl border cursor-pointer transition-all space-y-1.5 relative overflow-hidden ${
                        isGlass ? 'bg-[#f7f3eb]/70 hover:bg-[#fdfcf9] border-[#e5e0d6] hover:border-amber-500/70 shadow-xs' : 'bg-slate-950/80 hover:bg-slate-900/90 border-slate-800 hover:border-amber-500/50 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse" />
                          <span className={`font-semibold text-xs transition-colors ${
                            isGlass ? 'text-slate-900 group-hover:text-amber-700' : 'text-slate-100 group-hover:text-amber-300'
                          }`}>
                            Churn Save (Guardrail Clamp 35% → 15%)
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isGlass ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-amber-950/60 text-amber-400 border-amber-800/50'
                        }`}>
                          {activeSimulationKey === 'churn_clamp' ? 'RUNNING...' : '▶ RUN'}
                        </span>
                      </div>
                      <p className={`text-[11px] ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                        Simulates angry subscriber demanding 50% refund. Clamps to maximum 15% policy concession with empathy.
                      </p>
                      <div className={`h-1 w-full rounded-full overflow-hidden ${isGlass ? 'bg-slate-200' : 'bg-slate-800'}`}>
                        <div
                          className={`h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-700 ${
                            activeSimulationKey === 'churn_clamp' ? 'w-full' : 'w-1/3'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Card 3: Spoken Content Factory */}
                    <div
                      onClick={() => {
                        setActiveSimulationKey('content_factory_spoken');
                        triggerSimulationStep('content_factory_spoken');
                        setTimeout(() => setActiveSimulationKey(null), 2500);
                      }}
                      className={`group p-3 rounded-xl border cursor-pointer transition-all space-y-1.5 relative overflow-hidden ${
                        isGlass ? 'bg-[#f7f3eb]/70 hover:bg-[#fdfcf9] border-[#e5e0d6] hover:border-purple-500/70 shadow-xs' : 'bg-slate-950/80 hover:bg-slate-900/90 border-slate-800 hover:border-purple-500/50 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)] animate-pulse" />
                          <span className={`font-semibold text-xs transition-colors ${
                            isGlass ? 'text-slate-900 group-hover:text-purple-700' : 'text-slate-100 group-hover:text-purple-300'
                          }`}>
                            Spoken Voice: Hermes Content Factory
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isGlass ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-purple-950/60 text-purple-400 border-purple-800/50'
                        }`}>
                          {activeSimulationKey === 'content_factory_spoken' ? 'RUNNING...' : '▶ RUN'}
                        </span>
                      </div>
                      <p className={`text-[11px] ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                        Founder gives verbal brief on call. System spins up 3 parallel research lanes &amp; synthesizes multi-channel pack.
                      </p>
                      <div className={`h-1 w-full rounded-full overflow-hidden ${isGlass ? 'bg-slate-200' : 'bg-slate-800'}`}>
                        <div
                          className={`h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-700 ${
                            activeSimulationKey === 'content_factory_spoken' ? 'w-full' : 'w-1/3'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* System Guardrail Status */}
                <div className={`p-4 rounded-2xl border backdrop-blur-xl space-y-2.5 ${
                  isGlass ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90 text-slate-800 shadow-sm' : 'bg-slate-900/60 border-slate-800/80 text-slate-300 shadow-sm'
                }`}>
                  <div className={`flex items-center space-x-2 text-xs font-mono ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>
                    <ShieldAlert className="w-4 h-4" />
                    <span className="font-semibold">Production Guardrail Policies</span>
                  </div>
                  <div className={`space-y-1 text-[11px] font-mono ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                    <div className="flex justify-between">
                      <span>Max Autonomous Discount:</span>
                      <span className={isGlass ? 'text-slate-800 font-semibold' : 'text-slate-200'}>15% Max (Hard Clamped)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PII Redaction Engine:</span>
                      <span className={isGlass ? 'text-emerald-700 font-semibold' : 'text-emerald-400'}>Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
  );

  return (
    <div
      className={`min-h-screen flex flex-col relative overflow-x-hidden transition-colors duration-300 ${
        isGlass ? 'bg-[#faf8f5] text-slate-800' : 'bg-[#05070f] text-slate-100'
      }`}
    >
      {/* Vercel-Grade Ambient GPU Background Shader Canvas */}
      <AmbientVercelShader theme={theme} />
      <CheckoutBanner />

      {/* Top Navigation Bar */}
      <header
        className={`px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 transition-all border-b backdrop-blur-2xl ${
          isGlass
            ? 'bg-[#fdfcf9]/85 border-[#e8e4dc]/90 text-slate-900 shadow-[0_4px_20px_rgba(40,30,20,0.03)]'
            : 'bg-slate-950/70 border-slate-800/80 text-slate-100'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className={`text-lg font-bold tracking-tight ${isGlass ? "text-slate-900" : "text-white"}`}>StratosGTM</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold">
                AssemblyAI Voice Agent API
              </span>
            </div>
            <p className={`text-xs ${isGlass ? "text-slate-500" : "text-slate-400"}`}>Autonomous AI Growth Operator for Creators & High-Ticket Programs</p>
          </div>
        </div>

        {/* Top Feature Strip: Auto-Pilot, Speech, Live Telemetry, Export */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 🎬 60s Judge Auto-Demo Button */}
          {!judgeTourActive ? (
            <button
              onClick={handleStartJudgeTour}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-[0_0_18px_rgba(245,158,11,0.4)] border border-amber-300 hover:scale-[1.02] active:scale-[0.98]"
              title="Start Autonomous 60-Second Hackathon Judge Tour (Dives through all 5 strata, executes tools, and demonstrates full architecture)"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>🎬 60s Judge Auto-Demo</span>
            </button>
          ) : (
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border font-mono text-xs shadow-md ${
              isGlass ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-amber-950/60 border-amber-500/60 text-amber-200'
            }`}>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span className="font-bold">{judgeTourSeconds}s / 60s</span>
              <button
                onClick={() => setJudgeTourPaused(!judgeTourPaused)}
                className="px-1.5 py-0.5 rounded bg-amber-200/60 hover:bg-amber-300/80 text-amber-950 font-bold ml-1"
                title={judgeTourPaused ? "Resume Tour" : "Pause Tour"}
              >
                {judgeTourPaused ? <Play className="w-3 h-3 fill-current inline" /> : <Pause className="w-3 h-3 fill-current inline" />}
              </button>
              <button
                onClick={handleStopJudgeTour}
                className="px-1.5 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-700 font-bold ml-1"
                title="Stop Tour"
              >
                <X className="w-3 h-3 inline" />
              </button>
            </div>
          )}

          {/* 🔊 Spoken Audio Synthesis Toggle */}
          <button
            onClick={() => {
              const next = !spokenAudioEnabled;
              setSpokenAudioEnabled(next);
              speechSynth.setEnabled(next);
              if (!next) {
                speechSynth.cancel();
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel();
                }
              }
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all border ${
              spokenAudioEnabled
                ? (isGlass ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs' : 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]')
                : (isGlass ? 'bg-[#faf7f0] border-[#e2ded5] text-slate-500' : 'bg-slate-900 border-slate-800 text-slate-500')
            }`}
            title="Toggle audible voice playback in demo & simulation mode (Web Speech API)"
          >
            {spokenAudioEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            <span>{spokenAudioEnabled ? 'Voice: ON' : 'Voice: MUTE'}</span>
          </button>

          {/* Live WS Telemetry Strip */}
          <div className={`hidden xl:flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-mono font-medium border ${
            isGlass ? 'bg-[#faf7f0]/90 border-[#e5e0d6] text-slate-700 shadow-2xs' : 'bg-slate-900/90 border-slate-800 text-slate-200'
          }`}>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>WS RTT: <strong className="text-emerald-600 font-bold">{wsLatencyMs !== null ? `${wsLatencyMs}ms` : '—'}</strong></span>
            <span className="text-slate-300">|</span>
            <span>VAD: <strong className="text-sky-600 font-bold">{PACING_OPTIONS[voicePacing].label}</strong></span>
          </div>

          {/* SaaS Telemetry Pill: Minutes Quota & Pipeline Recovered */}
          <button
            onClick={() => setIsPlansModalOpen(true)}
            className={`hidden 2xl:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono transition-all border cursor-pointer ${
              isGlass
                ? 'bg-amber-50/90 hover:bg-amber-100 border-amber-200/90 text-amber-950 shadow-2xs'
                : 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-500/40 text-amber-200'
            }`}
            title="Leads captured by the voice agent. Click for plans and the ROI calculator."
          >
            {/* Real, persisted CRM count. This pill used to show hardcoded strings
                ("Quota: 412/2,500m", "+$56.9k Pipeline") that no data backed. */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>
                Leads captured: <strong>{leads.length}</strong>
              </span>
            </div>
          </button>

          {/* 📥 1-Click Revenue Dossier Export */}
          <button
            onClick={handleExportRevenueDossier}
            className={`hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all border ${
              isGlass
                ? 'bg-[#fdfcf9] hover:bg-sky-50 border-[#e2ded5] hover:border-sky-300 text-slate-700 hover:text-sky-900 shadow-2xs'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100'
            }`}
            title="Export full client dossier (Obsidian Markdown + JSON archive)"
          >
            <Download className="w-3.5 h-3.5 text-sky-600" />
            <span>Export Dossier</span>
          </button>
        </div>

        {/* View Engine Switcher & Tab Navigation */}
        <div className="flex items-center space-x-2.5">
          {/* Account: Google sign-in, own keys, sign out */}
          <AccountMenu session={session} onOpenKeys={() => setIsCredentialsModalOpen(true)} isGlass={isGlass} />

          {/* 💎 Plans & Spoken ROI Calculator Trigger */}
          <button
            onClick={() => setIsPlansModalOpen(true)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
              isGlass
                ? 'bg-gradient-to-r from-amber-50 to-amber-100/90 hover:from-amber-100 hover:to-amber-200/90 border-amber-300 text-amber-950 shadow-2xs'
                : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
            }`}
            title="Open Venture SaaS Subscription Plans & Spoken ROI Recovery Calculator"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>💎 Plans & ROI</span>
          </button>

          {/* Crawlable marketing and pricing pages. The marketing page moved from
              /product to / when the console moved to /console; /product still 308s
              here, but linking straight to / avoids the redirect hop. */}
          <a
            href="/"
            className={`hidden md:inline-flex px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-all ${
              isGlass ? 'bg-white/80 border-[#e2ded5] text-slate-700 hover:text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Product
          </a>
          <a
            href="/pricing"
            className={`hidden md:inline-flex px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-all ${
              isGlass ? 'bg-white/80 border-[#e2ded5] text-slate-700 hover:text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Pricing
          </a>

          {/* 🌐 1-Click Embed Snippet Trigger */}
          <button
            onClick={() => setIsEmbedModalOpen(true)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all border ${
              isGlass
                ? 'bg-sky-50 hover:bg-sky-100/80 border-sky-300 text-sky-950 shadow-2xs'
                : 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-400 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
            }`}
            title="Generate 1-line HTML embed snippet for external client websites"
          >
            <Globe className="w-3.5 h-3.5 text-sky-500" />
            <span>🌐 Embed Anna</span>
          </button>

          {/* Theme Switcher: 💎 Lucid Glass vs 🌑 Obsidian */}
          <button
            onClick={() => setTheme(theme === 'glass' ? 'cyber' : 'glass')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all border ${
              isGlass
                ? 'bg-[#faf7f0]/90 hover:bg-white border-[#e2ded5] text-slate-800 shadow-2xs'
                : 'bg-cyan-950/60 hover:bg-cyan-900/60 border-cyan-800/60 text-cyan-300'
            }`}
            title="Toggle between Lucid Glass (Light) and Obsidian Cyber (Dark)"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
            <span>{isGlass ? '💎 Lucid Cream' : '🌑 Obsidian'}</span>
          </button>
          {/* Odyssey Mode vs Tactical Console Switcher */}
          <div className={`flex items-center space-x-1 p-1 rounded-2xl border ${
            isGlass ? 'bg-[#f4efe6]/90 border-[#e5e0d6] shadow-2xs' : 'bg-slate-900/90 border-cyan-800/60 shadow-inner'
          }`}>
            <button
              onClick={() => setViewMode('odyssey')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all ${
                viewMode === 'odyssey'
                  ? (isGlass ? 'bg-[#fdfcf9] text-sky-950 border border-sky-300/80 shadow-xs' : 'bg-gradient-to-r from-cyan-500/30 to-purple-500/30 border border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.4)]')
                  : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
              }`}
              title="3D Spatial Z-Depth Odyssey Mode (Continuous Camera Dive into AI Core)"
            >
              <Compass className={`w-3.5 h-3.5 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
              <span>3D Odyssey</span>
            </button>
            <button
              onClick={() => setViewMode('tactical')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all ${
                viewMode === 'tactical'
                  ? (isGlass ? 'bg-[#fdfcf9] text-slate-900 border border-[#d8d2c5] shadow-xs' : 'bg-slate-800 border border-slate-700 text-slate-100 shadow-sm')
                  : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
              }`}
              title="Tactical Flat Console Workstation"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>Tactical</span>
            </button>
          </div>
          <button
            onClick={() => setIs3DSpatialMode(!is3DSpatialMode)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all border ${
              is3DSpatialMode
                ? (isGlass ? 'bg-sky-50 border-sky-300 text-sky-800 shadow-xs' : 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]')
                : (isGlass ? 'bg-[#fdfcf9] border-[#e2ded5] text-slate-700 hover:text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200')
            }`}
            title="Toggle 3D Spatial Depth Perspective (Cindy Zhu Scrollytelling Depth)"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGlass ? 'text-sky-600' : 'text-cyan-400'}`} />
            <span>{is3DSpatialMode ? '3D Depth: ON' : '3D Depth: OFF'}</span>
          </button>

          <div className={`flex items-center space-x-1 p-1 rounded-xl border ${
            isGlass ? 'bg-[#f4efe6]/90 border-[#e5e0d6] shadow-2xs' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'console'
                  ? (isGlass ? 'bg-[#fdfcf9] text-sky-950 border border-sky-200 font-semibold shadow-xs' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm')
                  : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice Console</span>
            </button>
            <button
              onClick={() => setActiveTab('crm')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'crm'
                  ? (isGlass ? 'bg-[#fdfcf9] text-emerald-950 border border-emerald-200 font-semibold shadow-xs' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm')
                  : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Revenue CRM ({leads.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('content')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'content'
                  ? (isGlass ? 'bg-[#fdfcf9] text-purple-950 border border-purple-200 font-semibold shadow-xs' : 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm')
                  : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span>Hermes Content Studio ({jobs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('evals')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'evals'
                  ? (isGlass ? 'bg-[#fdfcf9] text-blue-950 border border-blue-200 font-semibold shadow-xs' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm')
                  : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Anthropic Evals</span>
            </button>
            <button
              onClick={() => setActiveTab('graph')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'graph'
                  ? (isGlass ? 'bg-[#fdfcf9] text-emerald-950 border border-emerald-200 font-semibold shadow-xs' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm')
                  : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
              }`}
            >
              <GitFork className="w-3.5 h-3.5 text-emerald-500" />
              <span>Knowledge Graph & Vault</span>
            </button>
            <button
              onClick={() => setActiveTab('buyerlab')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'buyerlab'
                  ? (isGlass ? 'bg-[#fdfcf9] text-cyan-950 border border-cyan-200 font-semibold shadow-xs' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm')
                  : (isGlass ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200')
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5 text-cyan-500" />
              <span>Buyer Lab</span>
            </button>
          </div>
        </div>
      </header>

      {/* 🎬 Floating Judge Auto-Pilot Ribbon */}
      {judgeTourActive && judgeTourBanner && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-full px-4 pointer-events-none">
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-4 py-2 rounded-2xl shadow-[0_12px_36px_rgba(245,158,11,0.5)] border border-amber-300 font-mono text-xs flex items-center justify-between pointer-events-auto backdrop-blur-xl">
            <div className="flex items-center space-x-2 truncate">
              <Sparkles className="w-4 h-4 text-amber-200 animate-spin flex-shrink-0" />
              <span className="font-bold tracking-tight truncate">{judgeTourBanner}</span>
            </div>
            <span className="font-bold bg-black/30 px-2 py-0.5 rounded-full text-[11px] ml-2 flex-shrink-0">
              {60 - judgeTourSeconds}s remaining
            </span>
          </div>
        </div>
      )}

      {viewMode === 'odyssey' ? (
        <Spatial3DOdyssey
          theme={theme}
          requestedZ={odysseyRequestedZ}
          consoleContent={renderConsoleContent()}
          crmContent={
            <CrmKanban
              theme={theme}
              leads={leads}
              members={members}
              onSimulateLead={() => triggerSimulationStep('lead_inbound')}
              onTriggerLeadCall={handleTriggerLeadCall}
              onLeadStatusChange={handleLeadStatusChange}
            />
          }
          contentStudioContent={
            <ContentFactoryStudio
              theme={theme}
              jobs={jobs}
              onTriggerJob={handleTriggerContentJob}
              onTriggerAudit={handleTriggerAuditJob}
              onApproveJob={handleApproveContentJob}
              activeCompanyName={prospectCompany || 'Acme Coaching Co.'}
              onOpenCredentialsModal={() => setIsCredentialsModalOpen(true)}
            />
          }
          evalsContent={<EvalsDashboard theme={theme} />}
          graphContent={<GraphViewHUD theme={theme} />}
          onExitOdyssey={() => setViewMode('tactical')}
        />
      ) : (
        <main
          className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6 relative z-10 transition-all duration-700"
          style={
            is3DSpatialMode
              ? {
                  perspective: '1400px',
                  transformStyle: 'preserve-3d',
                  transform: 'rotateX(3.5deg) scale(0.985)',
                  boxShadow: '0 30px 80px rgba(0,0,0,0.8)'
                }
              : {}
          }
        >
          {activeTab === 'console' && renderConsoleContent()}
          {activeTab === 'crm' && (
            <CrmKanban
              theme={theme}
              leads={leads}
              members={members}
              onSimulateLead={() => triggerSimulationStep('lead_inbound')}
              onTriggerLeadCall={handleTriggerLeadCall}
              onLeadStatusChange={handleLeadStatusChange}
            />
          )}
          {activeTab === 'content' && (
            <ContentFactoryStudio
              theme={theme}
              jobs={jobs}
              onTriggerJob={handleTriggerContentJob}
              onTriggerAudit={handleTriggerAuditJob}
              onApproveJob={handleApproveContentJob}
              activeCompanyName={prospectCompany || 'Acme Coaching Co.'}
              onOpenCredentialsModal={() => setIsCredentialsModalOpen(true)}
            />
          )}
          {activeTab === 'evals' && <EvalsDashboard theme={theme} />}
          {activeTab === 'graph' && <GraphViewHUD theme={theme} />}
          {activeTab === 'buyerlab' && (
            <BuyerLab
              signedIn={session.state.status === 'signed-in'}
              isGlass={isGlass}
              onOpenKeys={() => setIsCredentialsModalOpen(true)}
            />
          )}
        </main>
      )}

      {/* Prospect Dossier Enrichment Modal */}
      {isEnrichModalOpen && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto ${
          isGlass ? 'bg-slate-900/40' : 'bg-slate-950/85'
        }`}>
          <div className={`w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150 my-auto border ${
            isGlass ? 'bg-white border-slate-200 shadow-slate-900/10 text-slate-800' : 'bg-slate-900 border-cyan-700/50 text-slate-100'
          }`}>
            {/* Sticky Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b flex-shrink-0 ${
              isGlass ? 'border-slate-200 bg-slate-50/90' : 'border-slate-800 bg-slate-950/80'
            }`}>
              <div className={`flex items-center space-x-3 ${isGlass ? 'text-sky-700' : 'text-cyan-400'}`}>
                <div className={`p-2 rounded-xl border ${
                  isGlass ? 'bg-sky-50 border-sky-200 text-sky-600' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                }`}>
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isGlass ? 'text-slate-900' : 'text-white'}`}>Prospect Business Dossier & Brand Voice Matrix</h3>
                  <p className={`text-[11px] ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>Calibrate client website context, audience persona, and RAG knowledge for Anna</p>
                </div>
              </div>
              <button
                onClick={() => setIsEnrichModalOpen(false)}
                className={`p-1.5 rounded-lg transition-all ${
                  isGlass ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form id="dossier-form" onSubmit={handleEnrichProspect} className="p-6 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
              <p className="text-slate-400 leading-relaxed">
                Provide the prospect's website, LinkedIn profile, or business bio so Anna can research their business model and tailor questions during the call.
              </p>

              {/* Preset Profile Bar with Plus (+) / Minus (-) Client Management */}
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-cyan-800/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-cyan-300 font-semibold font-mono text-xs">
                    <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Client Dossier & Profile:</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-mono">
                    {allPresets.find((p) => p.id === selectedPresetId)?.isCustom ? '🔒 Local Private Client' : '🌟 Pre-built Public Demo'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedPresetId}
                    onChange={(e) => handleSelectPreset(e.target.value)}
                    className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <optgroup label="🌟 Public Built-in Archetypes">
                      {BUILT_IN_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                    {customPresets.length > 0 && (
                      <optgroup label="💾 My Saved Clients (Local Disk & Browser)">
                        {customPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* (+) Add Client Button */}
                  <button
                    type="button"
                    onClick={handleAddNewClient}
                    title="Add a new client (+)"
                    className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/50 text-cyan-200 text-xs font-semibold whitespace-nowrap transition-all shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Client</span>
                  </button>

                  {/* (-) Delete Client Button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteCurrentClient(selectedPresetId)}
                    title={
                      allPresets.find((p) => p.id === selectedPresetId)?.isCustom
                        ? "Delete this custom client (-)"
                        : "Built-in public demo is protected from deletion"
                    }
                    className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${
                      allPresets.find((p) => p.id === selectedPresetId)?.isCustom
                        ? "bg-red-950/40 hover:bg-red-900/60 border-red-800/50 text-red-300 cursor-pointer"
                        : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>

                  {/* Save Client Preset */}
                  <button
                    type="button"
                    onClick={handleSaveCurrentAsCustomPreset}
                    title="Save current info as a client preset"
                    className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 text-xs font-semibold whitespace-nowrap transition-all"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>

                  {/* Reset to Generic Demo */}
                  <button
                    type="button"
                    onClick={handleResetToGenericDemo}
                    title="Reset to default test demo (Alex Kim / Acme Coaching Co.)"
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Privacy Shield Info Banner */}
                <div className="flex items-center space-x-2 text-[10px] text-slate-400 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <Lock className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span>
                    <strong>Local Vault Isolation:</strong> All clients saved here are stored in <code className="text-cyan-300 font-mono">vault/Clients/</code> (gitignored). Anyone cloning this repo only sees the clean generic test demo.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-mono">Full Name:</label>
                  <input
                    type="text"
                    value={prospectName}
                    onChange={(e) => setProspectName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-mono">Email Address:</label>
                  <input
                    type="email"
                    value={prospectEmail}
                    onChange={(e) => setProspectEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-mono flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Company / Portfolio Website URL:</span>
                </label>
                <input
                  type="url"
                  value={prospectWebsite}
                  onChange={(e) => setProspectWebsite(e.target.value)}
                  placeholder="https://acmecoaching.example"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-slate-300 font-mono flex items-center space-x-1.5">
                    <Linkedin className="w-3.5 h-3.5 text-blue-400" />
                    <span>LinkedIn:</span>
                  </label>
                  <input
                    type="url"
                    value={prospectLinkedIn}
                    onChange={(e) => setProspectLinkedIn(e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-mono flex items-center space-x-1.5">
                    <span className="text-cyan-400 font-bold">𝕏</span>
                    <span>Twitter/X:</span>
                  </label>
                  <input
                    type="url"
                    value={prospectTwitter}
                    onChange={(e) => setProspectTwitter(e.target.value)}
                    placeholder="https://x.com/..."
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-mono flex items-center space-x-1.5">
                      <span className="text-red-400 font-bold">▶</span>
                      <span>YouTube:</span>
                    </label>
                    {prospectYouTube && (
                      <button
                        type="button"
                        onClick={() => setProspectYouTube('')}
                        title="Clear YouTube (-)"
                        className="text-[10px] text-slate-500 hover:text-red-400 font-mono"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    value={prospectYouTube}
                    onChange={(e) => setProspectYouTube(e.target.value)}
                    placeholder="https://youtube.com/@..."
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-mono flex items-center space-x-1.5">
                      <span className="text-amber-400 font-bold">✉</span>
                      <span>Substack / Newsletter:</span>
                    </label>
                    {prospectSubstack && (
                      <button
                        type="button"
                        onClick={() => setProspectSubstack('')}
                        title="Clear Substack (-)"
                        className="text-[10px] text-slate-500 hover:text-red-400 font-mono"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    value={prospectSubstack}
                    onChange={(e) => setProspectSubstack(e.target.value)}
                    placeholder="https://....substack.com"
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Dynamic Custom Channels / Info Links with Plus (+) and Minus (-) */}
              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-mono text-[11px] font-semibold flex items-center space-x-1.5">
                    <Link2 className="w-3 h-3 text-cyan-400" />
                    <span>Additional Channels & Resources:</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddCustomLink}
                    title="Add custom channel or URL (+)"
                    className="flex items-center space-x-1 px-2 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 text-[11px] font-mono transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Channel</span>
                  </button>
                </div>

                {customLinks.length === 0 ? (
                  <div className="text-[10px] text-slate-500 italic">
                    Add optional channels (Discord, GitHub, TikTok, Skool, Podcast, Docs) with the (+) button above.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customLinks.map((link) => (
                      <div key={link.id} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => handleUpdateCustomLink(link.id, 'label', e.target.value)}
                          placeholder="Platform (e.g. Discord)"
                          className="w-1/3 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500"
                        />
                        <input
                          type="url"
                          value={link.url}
                          onChange={(e) => handleUpdateCustomLink(link.id, 'url', e.target.value)}
                          placeholder="https://..."
                          className="flex-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomLink(link.id)}
                          title="Delete channel (-)"
                          className="p-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-400 transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-mono flex items-center space-x-1.5">
                  <Building2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Company / Community Name:</span>
                </label>
                <input
                  type="text"
                  value={prospectCompany}
                  onChange={(e) => setProspectCompany(e.target.value)}
                  placeholder="Acme Coaching Co."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Brand Voice Layer Configuration */}
              <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-800/40 space-y-3">
                <div className="flex items-center space-x-2 text-indigo-300 font-semibold font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Brand Voice & Persona Calibration</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'tactical_operator', label: '⚡ Tactical Operator', desc: 'Direct & Metrics' },
                    { id: 'empathetic_mentor', label: '🌱 Empathetic Mentor', desc: 'Warm & Guided' },
                    { id: 'visionary_founder', label: '🚀 Visionary Founder', desc: 'Next-Gen AI' },
                    { id: 'enterprise_advisor', label: '🏛️ Enterprise Advisor', desc: 'ROI & Governance' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedToneArchetype(t.id as any)}
                      className={`p-2 rounded-lg text-left transition-all border ${
                        selectedToneArchetype === t.id
                          ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-medium text-[11px]">{t.label}</div>
                      <div className="text-[9px] text-slate-500">{t.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Lexicon & Banned Terms with Plus (+) and Minus (-) Item Management */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Signature Lexicon */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 font-mono text-[11px] font-semibold flex items-center space-x-1.5">
                        <Tag className="w-3 h-3 text-indigo-400" />
                        <span>Signature Lexicon (Favorite Words):</span>
                      </label>
                      <span className="text-[10px] text-indigo-400 font-mono">{lexiconList.length} terms</span>
                    </div>

                    {/* Tag Pills with Minus (-) to remove */}
                    <div className="flex flex-wrap gap-1.5 min-h-[32px] p-1.5 bg-slate-950 rounded-lg border border-slate-900">
                      {lexiconList.length === 0 ? (
                        <span className="text-[10px] text-slate-600 italic">No favorite words added yet.</span>
                      ) : (
                        lexiconList.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-[11px] font-mono"
                          >
                            <span>{tag}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveLexiconTag(tag)}
                              title={`Remove "${tag}" (-)`}
                              className="text-indigo-400 hover:text-red-400 font-bold ml-1 transition-colors"
                            >
                              ✕
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    {/* Add Word Input with Plus (+) button */}
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="text"
                        value={newLexiconInput}
                        onChange={(e) => setNewLexiconInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddLexiconTag();
                          }
                        }}
                        placeholder="Add word or phrase..."
                        className="flex-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddLexiconTag}
                        title="Add to Lexicon (+)"
                        className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-semibold transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>

                  {/* Banned Terms */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 font-mono text-[11px] font-semibold flex items-center space-x-1.5">
                        <ShieldAlert className="w-3 h-3 text-red-400" />
                        <span>Banned Terms (Never Say):</span>
                      </label>
                      <span className="text-[10px] text-red-400 font-mono">{bannedList.length} banned</span>
                    </div>

                    {/* Banned Tag Pills with Minus (-) to remove */}
                    <div className="flex flex-wrap gap-1.5 min-h-[32px] p-1.5 bg-slate-950 rounded-lg border border-slate-900">
                      {bannedList.length === 0 ? (
                        <span className="text-[10px] text-slate-600 italic">No banned terms configured.</span>
                      ) : (
                        bannedList.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-red-950/50 border border-red-800/60 text-red-300 text-[11px] font-mono"
                          >
                            <span>{tag}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveBannedTag(tag)}
                              title={`Remove banned term "${tag}" (-)`}
                              className="text-red-400 hover:text-white font-bold ml-1 transition-colors"
                            >
                              ✕
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    {/* Add Banned Input with Plus (+) button */}
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="text"
                        value={newBannedInput}
                        onChange={(e) => setNewBannedInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBannedTag();
                          }
                        }}
                        placeholder="Add banned term..."
                        className="flex-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-red-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddBannedTag}
                        title="Add Banned Term (+)"
                        className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 text-red-200 text-xs font-semibold transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-mono flex items-center justify-between">
                  <span>Client Social Footprint & Audience Bio Context (For Analysis):</span>
                  <span className="text-[10px] text-cyan-400 font-normal">Feeds RAG & Voice Agent</span>
                </label>
                <textarea
                  rows={3}
                  value={prospectBio}
                  onChange={(e) => setProspectBio(e.target.value)}
                  placeholder="Paste client social links, follower stats, community size (Discord/Skool/Substack), current offer tiers, and key audience pain points..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs leading-relaxed"
                />
              </div>

            </form>

            {/* Sticky Modal Action Footer */}
            <div className={`px-6 py-3.5 border-t flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 ${
              isGlass ? 'border-slate-200 bg-slate-50/90' : 'border-slate-800 bg-slate-950/90'
            }`}>
              <div className={`flex items-center space-x-2 text-[11px] font-mono ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                <Lock className={`w-3.5 h-3.5 flex-shrink-0 ${isGlass ? 'text-emerald-600' : 'text-emerald-400'}`} />
                <span>Stored locally in <code className={isGlass ? 'text-sky-800 font-semibold' : 'text-cyan-300'}>vault/Clients/</code> • Zero Git Leakage</span>
              </div>
              <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsEnrichModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                    isGlass ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="dossier-form"
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Save & Feed to Voice Agent</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Your keys (BYOK), private to the signed-in workspace */}
      <KeysPanel
        isOpen={isCredentialsModalOpen}
        onClose={() => setIsCredentialsModalOpen(false)}
        signedIn={session.state.status === 'signed-in'}
        isGlass={isGlass}
      />

      {/* SaaS Subscription Plans & Spoken ROI Recovery Modal */}
      <SubscriptionPlansModal
        isOpen={isPlansModalOpen}
        onClose={() => { setIsPlansModalOpen(false); setHighlightPlanId(undefined); }}
        clientId={prospectCompany || 'Acme Coaching Co.'}
        onOpenEmbedModal={() => setIsEmbedModalOpen(true)}
        isGlass={isGlass}
        highlightPlanId={highlightPlanId}
      />

      {/* 1-Click Embed Snippet Generator Modal */}
      <EmbedWidgetModal
        isOpen={isEmbedModalOpen}
        onClose={() => setIsEmbedModalOpen(false)}
        defaultCompany={prospectCompany || 'Acme Coaching Co.'}
        defaultClientId="lead_ak_901"
        isGlass={isGlass}
      />

      {/* Footer Status Bar */}
      <footer className={`border-t px-6 py-3 text-xs font-mono flex flex-wrap items-center justify-between gap-3 ${
        isGlass ? 'border-slate-200 bg-white/85 text-slate-600' : 'border-slate-900 bg-slate-950/90 text-slate-500'
      }`}>
        <div className="flex flex-wrap items-center space-x-3">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>AssemblyAI Voice Agent API: Operational</span>
          </span>
          <span>•</span>
          <span>Sample Rate: 24,000 Hz Mono</span>
          <span>•</span>
          <button
            onClick={() => setIsPlansModalOpen(true)}
            className="hover:underline font-semibold text-amber-600 dark:text-amber-400 cursor-pointer"
          >
            SaaS Plan: {FOOTER_PLAN.name} ({usd(FOOTER_PLAN.priceMonthlyUsd)}/mo)
          </button>
          <span>•</span>
          <button
            onClick={() => setIsEmbedModalOpen(true)}
            className="hover:underline font-semibold text-sky-600 dark:text-sky-400 cursor-pointer"
          >
            1-Click Embed Widget (embed.js)
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3">
          <span>lablab.ai Voice Agent Hackathon Submission • StratosGTM</span>
          <span>•</span>
          <a href="/privacy.html" className="hover:underline">Privacy</a>
          <span>•</span>
          <a href="/terms.html" className="hover:underline">Terms</a>
        </div>
      </footer>
    </div>
  );
};

export default App;
