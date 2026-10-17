// ============================================================================
// AssemblyAI Voice Agent API Types (Speech-in / Speech-out)
// ============================================================================

export type AssemblyAIVoice =
  | 'anna'
  | 'alba'
  | 'jane'
  | 'michael'
  | 'charles'
  | 'paul'
  | 'vera'
  | 'lola'
  | 'estelle'
  | 'juergen'
  | 'giovanni'
  | 'rafael';

export interface FlatToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
}

export interface FlatToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, FlatToolParameterProperty>;
    required?: string[];
  };
}

export interface SessionUpdateMessage {
  type: 'session.update';
  session: {
    system_prompt: string;
    greeting?: string;
    input?: {
      format: { encoding: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma' };
      keyterms?: string[];
      turn_detection?: {
        vad_threshold?: number;
        min_silence?: number;
        max_silence?: number;
        interrupt_response?: boolean;
      };
    };
    output?: {
      voice: AssemblyAIVoice | string;
      format: { encoding: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma' };
    };
    tools?: FlatToolDefinition[];
  };
}

export interface InputAudioMessage {
  type: 'input.audio';
  audio: string; // base64 encoded PCM16 24kHz mono
}

/** Clean session end. The API has no `Terminate` message; it answers one with session.error. */
export interface SessionEndMessage {
  type: 'session.end';
}

export interface SessionReadyEvent {
  type: 'session.ready';
  session_id: string;
}

export interface TranscriptUserEvent {
  type: 'transcript.user';
  transcript: string;
  end_of_turn: boolean;
}

export interface TranscriptAgentEvent {
  type: 'transcript.agent';
  transcript: string;
}

export interface ReplyAudioEvent {
  type: 'reply.audio';
  data: string; // base64 encoded PCM16 24kHz
}

export interface ReplyDoneEvent {
  type: 'reply.done';
  status: 'completed' | 'interrupted';
}

export interface ToolCallEvent {
  type: 'tool.call';
  call_id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResultEvent {
  type: 'tool.result';
  call_id: string;
  result: Record<string, any> | string;
}

// ============================================================================
// Hermes Content Factory & Self-Healing Loop Types
// ============================================================================

export type ContentChannel = 'twitter_thread' | 'newsletter' | 'webinar_script' | 'social_carousel';

export type JobStatus =
  | 'queued'
  | 'researching_lanes'
  | 'synthesizing'
  | 'self_healing_verification'
  | 'needs_approval'
  | 'approved'
  | 'published'
  | 'failed';

export interface ResearchSnippet {
  sourceTitle: string;
  sourceUrl?: string;
  excerpt: string;
  relevanceScore: number;
  lane: 'creator_rag' | 'market_trends' | 'community_objections';
}

export interface ResearchLaneResult {
  lane: 'creator_rag' | 'market_trends' | 'community_objections';
  title: string;
  status: 'completed' | 'timeout' | 'failed';
  snippets: ResearchSnippet[];
}

export interface SelfHealingAttempt {
  attemptNumber: number;
  issueDetected: string;
  ruleBroken: string; // e.g. "tweet_length_exceeded_280", "unsupported_refund_claim", "missing_citation"
  repairApplied: string;
  healedSuccessfully: boolean;
  timestamp: string;
}

export interface GeneratedContentPack {
  thesis: string;
  targetAudience: string;
  twitterThread: string[]; // 5-7 tweets, each verified <= 280 chars
  newsletter: {
    subjectLine: string;
    previewText: string;
    bodyMarkdown: string;
    callToAction: string;
  };
  webinarScript: {
    hook: string;
    coreProblem: string;
    valueProposition: string;
    offerClose: string;
  };
  linkedInPost?: {
    hook: string;
    bodyMarkdown: string;
    takeaways: string[];
    hashtags: string[];
  };
  instagramCaption?: {
    hook: string;
    caption: string;
    slideOutlines: string[];
  };
}

// ============================================================================
// SOP Engine: High-Volume Lead Gen & Personalized Outreach Types
// ============================================================================

export interface SocialPlatformLinks {
  twitter?: string;
  linkedin?: string;
  youtube?: string;
  instagram?: string;
  substack?: string;
  tiktok?: string;
  podcast?: string;
  other?: string;
}

export interface ConversionAuditPillar {
  pillarName: string;
  scoreOutOf10: number;
  finding: string;
  recommendation: string;
  impactLevel: 'critical' | 'high' | 'medium';
}

export interface LeadMagnetAudit {
  companyOrCreator: string;
  website?: string;
  socialLinks?: SocialPlatformLinks;
  socialBioAnalysis?: {
    identifiedNiche: string;
    estimatedAudienceTier: string;
    channelStrengths: string[];
    monetizationAngle: string;
  };
  triggerEvent: string; // e.g. "Hiring first SDR", "Launched $2,997 cohort", "Scaling past $20k MRR"
  leadMagnetTitle: string; // e.g. "The 24/7 Inbound Conversion Blueprint & Revenue Leakage Audit"
  executiveSummary: string;
  auditScore: number; // 0 - 100
  estimatedAnnualRevenueLeakageUsd: number;
  pillars: ConversionAuditPillar[]; // The 5-Point Inbound Conversion Audit
  outreachSequence: {
    coldEmail: {
      subject: string;
      bodyMarkdown: string;
    };
    linkedInMessage: {
      hook: string;
      body: string;
    };
    spokenAudioScript: {
      intro: string;
      triggerHook: string;
      valueDrop: string;
      frictionlessCallToAction: string;
    };
  };
  freeAssetPreviewMarkdown: string;
}

export interface ContentFactoryJob {
  id: string;
  topic: string;
  jobType?: 'content_pack' | 'lead_magnet_audit';
  requestedBySpeaker: 'creator' | 'voice_agent_inbound' | 'sdr_outbound';
  status: JobStatus;
  researchLanes: ResearchLaneResult[];
  contentPack?: GeneratedContentPack;
  leadMagnetAudit?: LeadMagnetAudit;
  selfHealingLogs: SelfHealingAttempt[];
  verificationScore: number; // 0 - 100
  humanApproved: boolean;
  approvedAt?: string;
  createdAt: string;
  completedAt?: string;
  modelRouting: {
    researchModel: string;
    synthesisModel: string;
    verifierModel: string;
  };
  costUsd: number;
}

// ============================================================================
// Revenue OS Domain Types
// ============================================================================

export type LeadStatus =
  | 'new'
  | 'inbound_qualified'
  | 'call_scheduled'
  | 'negotiating'
  | 'enrolled'
  | 'disqualified';

export interface CRMLead {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  website?: string;
  linkedIn?: string;
  socialLinks?: SocialPlatformLinks;
  socialBioText?: string;
  companyName?: string;
  businessSummary?: string;
  source: 'after_hours_inbound' | 'outbound_campaign' | 'web_callback';
  budgetRange?: string;
  coreNeed?: string;
  authority?: string;
  timelineWeeks?: number;
  qualificationScore: number; // 0 - 100
  status: LeadStatus;
  scheduledCallTime?: string;
  matchedOffer?: string;
  notes: string[];
  brandVoice?: any;
  createdAt: string;
  updatedAt: string;
}

export interface ChurnRiskMember {
  memberId: string;
  fullName: string;
  email: string;
  tier: 'starter' | 'pro' | 'vip_mastermind';
  monthlyFee: number;
  churnReason?: string;
  status: 'active' | 'retention_offered' | 'saved' | 'cancelled';
  appliedDiscountPct?: number;
  bonusOffer?: string;
  requiresManagerReview: boolean;
}

// ============================================================================
// Production GenAI Systems: Evals & Observability
// ============================================================================

export interface TurnTelemetry {
  turnId: string;
  turnOrder: number;
  speaker: 'user' | 'agent';
  transcript: string;
  ttfaMs?: number; // Time to first audio
  turnDurationMs: number;
  toolInvocations: string[];
  tokensEstimated: number;
  costEstimatedUsd: number;
  timestamp: string;
}

export interface EvalTask {
  id: string;
  name: string;
  description: string;
  userTurns: string[];
  expectedTools: string[];
  successCriteria: {
    requiredFields?: string[];
    maxAutonomousDiscountPct?: number;
    mustScheduleMeeting?: boolean;
    forbiddenTerms?: string[];
  };
}

export interface EvalGraderResult {
  graderName: string;
  passed: boolean;
  score: number; // 0.0 - 1.0
  reason: string;
  /**
   * True when the grader could not run at all (e.g. no API key for a model judge).
   * A skipped grader is excluded from scoring — it must never be reported as a pass,
   * because "we could not evaluate this" is not evidence that the agent behaved.
   */
  skipped?: boolean;
}

export interface EvalTrialOutcome {
  taskId: string;
  trialNumber: number;
  allPassed: boolean;
  graderResults: EvalGraderResult[];
  transcriptTurns: TurnTelemetry[];
  completedAt: string;
}

export interface EvalSuiteReport {
  suiteName: string;
  totalTasks: number;
  kTrials: number;
  passAtK: number; // pass@k probability (at least 1 success)
  passPowerK: number; // pass^k probability (all k trials succeed)
  outcomes: EvalTrialOutcome[];
  timestamp: string;
}

// ============================================================================
// SaaS Subscription, Monetization & ROI Telemetry
// ============================================================================

export type SubscriptionTierId = 'starter' | 'pro' | 'enterprise';

export interface SubscriptionPlan {
  id: SubscriptionTierId;
  name: string;
  tagline: string;
  priceMonthlyUsd: number;
  priceAnnualMonthlyUsd: number; // discounted rate when billed annually
  voiceMinutesMonthly: number;
  overageRatePerMinUsd: number;
  maxAutonomousAgents: number;
  features: string[];
  recommended?: boolean;
}

export interface ClientUsageTelemetry {
  clientId: string;
  companyName: string;
  planId: SubscriptionTierId;
  billingCycle: 'monthly' | 'annual';
  billingCycleStart: string;
  billingCycleEnd: string;
  minutesUsed: number;
  minutesLimit: number;
  callsCount: number;
  /** Calls where qualify_lead succeeded. Measured, not modeled. */
  leadsCaptured: number;
  /** Sum of deal values actually recorded on captured leads. 0 until a real value is recorded. */
  pipelineGeneratedUsd: number;
  /** true only when these numbers were read from usage_records (Postgres). */
  persisted: boolean;
  /** Where the numbers come from, in plain words. */
  measuredFrom: string;
  source: 'usage_records' | 'memory';
  /**
   * Stripe's own subscription status (active, trialing, past_due, canceled...).
   * Mirrored rather than reinterpreted, because Stripe is the authority on
   * whether the customer is actually paying. Absent until a webhook arrives.
   */
  subscriptionStatus?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface ROIParameters {
  monthlyTraffic: number;
  averageContractValueUsd: number;
  /** Share of after-hours visitors a static contact form converts. Default 0.8. */
  currentConversionPct?: number;
  /** Share of web traffic arriving outside business hours. Default 32. */
  afterHoursTrafficSharePct?: number;
  /**
   * Share of after-hours visitors the voice agent turns into a qualified lead.
   * Default 4.5. Unmeasured — the whole model rests on this, so it is an input
   * the prospect sets, not a claim we make.
   */
  voiceConversionPct?: number;
  /** Share of qualified leads that close. Default 20. Pipeline is not revenue without it. */
  closeRatePct?: number;
  planId?: SubscriptionTierId;
  billingCycle?: 'monthly' | 'annual';
}

/**
 * Worked ROI model. Every figure is derived from the assumptions echoed back in
 * `assumptions`; nothing here is a measured outcome.
 */
export interface ROICalculationResult {
  monthlyTraffic: number;
  averageContractValueUsd: number;
  afterHoursVisitors: number;
  expectedSpokenLeadsMonthly: number;
  staticFormBaselineLeadsMonthly: number;
  /** Leads the voice agent adds over what the form would have caught anyway. */
  incrementalLeadsMonthly: number;
  /** Incremental leads x contract value. Pipeline, NOT revenue. */
  incrementalPipelineUsd: number;
  incrementalClosedDealsMonthly: number;
  /** Incremental closed deals x contract value. The figure ROI is computed from. */
  incrementalRevenueUsd: number;
  netRevenueGainUsd: number;
  planCostMonthlyUsd: number;
  estimatedRoiMultiple: number;
  /** Closed deals per month needed to cover the plan. Independent of the conversion assumptions. */
  breakEvenDealsPerMonth: number;
  /** How often one extra closed deal is needed to cover the plan, in months. */
  monthsPerDealToBreakEven: number;
  assumptions: {
    afterHoursTrafficSharePct: number;
    currentConversionPct: number;
    voiceConversionPct: number;
    closeRatePct: number;
  };
}

