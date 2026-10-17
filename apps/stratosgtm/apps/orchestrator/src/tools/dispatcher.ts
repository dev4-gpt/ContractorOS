import type { CRMLead, ChurnRiskMember } from '@voice-os/shared';
import { ragEngine } from '../services/ragEngine';
import { cacheEngine } from '../services/cacheEngine';

/**
 * The slice of the CRM the tools need. Production passes the `crmStore`
 * singleton; the eval harness passes an in-memory implementation so a test run
 * never touches real leads, the Postgres write-through, or the Obsidian vault.
 */
export interface CrmPort {
  ready: Promise<void>;
  flush(): Promise<void>;
  createOrUpdateLead(data: {
    fullName: string;
    email: string;
    phone?: string;
    website?: string;
    linkedIn?: string;
    socialLinks?: Record<string, string | undefined>;
    socialBioText?: string;
    companyName?: string;
    businessSummary?: string;
    toneArchetype?: any;
    source: 'after_hours_inbound' | 'outbound_campaign' | 'web_callback';
  }): CRMLead;
  qualifyLead(data: {
    email: string;
    budgetRange: string;
    coreNeed: string;
    authority?: string;
    timelineWeeks?: number;
  }): { lead: CRMLead | null; calculatedScore: number };
  scheduleMeeting(data: {
    email: string;
    preferredDatetime: string;
    topic?: string;
  }): { success: boolean; lead: CRMLead | null; confirmationCode: string };
  processRetention(data: {
    memberId: string;
    churnReason: string;
    requestedAction: string;
    approvedDiscountPct: number;
    requiresManagerReview: boolean;
    bonusOffer?: string;
  }): ChurnRiskMember | null;
}

export interface DispatcherDeps {
  /** Starts a content-factory job. Defaults to the real engine; evals pass a recorder so no model call or draft is produced. */
  startContentJob?: (topic: string) => unknown;
}

/** Autonomous discount ceiling (percent). Anything the model proposes above this is clamped to it. */
export const MAX_AUTONOMOUS_DISCOUNT_PCT = 15;
/** Proposals strictly above this also require manager review and a non-cash bonus. */
export const MANAGER_REVIEW_ABOVE_PCT = 20;

export interface DiscountDecision {
  approvedDiscount: number;
  requiresReview: boolean;
  bonusOffer?: string;
}

/**
 * Deterministic guardrail ("model proposes, application enforces"). Pure so the
 * policy is testable without a CRM. A non-numeric or negative proposal is treated
 * as 0: the model must never be able to produce NaN or a negative discount.
 */
export function decideDiscount(proposed: unknown): DiscountDecision {
  const n = Number(proposed ?? 0);
  const proposedDiscount = Number.isFinite(n) && n > 0 ? n : 0;
  if (proposedDiscount > MANAGER_REVIEW_ABOVE_PCT) {
    return {
      approvedDiscount: MAX_AUTONOMOUS_DISCOUNT_PCT,
      requiresReview: true,
      bonusOffer: 'Complimentary 1-on-1 Growth Audit Call with Alex (Value: $500)'
    };
  }
  if (proposedDiscount > MAX_AUTONOMOUS_DISCOUNT_PCT) {
    return {
      approvedDiscount: MAX_AUTONOMOUS_DISCOUNT_PCT,
      requiresReview: false,
      bonusOffer: 'Access to Private Mastermind Vault recordings'
    };
  }
  return { approvedDiscount: proposedDiscount, requiresReview: false };
}

export class ToolDispatcher {
  constructor(
    private readonly store: CrmPort,
    private readonly deps: DispatcherDeps = {}
  ) {}

  /**
   * Runs a voice-agent tool.
   *
   * Waits for the CRM to finish loading stored data first — on a cold serverless
   * instance a lookup by email would otherwise miss an existing lead and create a
   * duplicate. Then flushes every write before returning, because the caller
   * responds to the agent as soon as this resolves and the host may freeze the
   * function the moment it does. `finally` so writes land even if a tool throws.
   */
  public async dispatch(name: string, args: Record<string, any>): Promise<Record<string, any>> {
    await this.store.ready;
    try {
      return await this.run(name, args);
    } finally {
      await this.store.flush();
    }
  }

  private async run(name: string, args: Record<string, any>): Promise<Record<string, any>> {
    switch (name) {
      case 'create_or_update_lead': {
        const lead = this.store.createOrUpdateLead({
          fullName: args.fullName,
          email: args.email,
          phone: args.phone,
          source: args.source || 'after_hours_inbound'
        });
        return {
          status: 'success',
          message: `Lead ${lead.fullName} registered in CRM. Initial score: ${lead.qualificationScore}/100.`,
          leadId: lead.id
        };
      }

      case 'enrich_prospect_dossier': {
        const lead = this.store.createOrUpdateLead({
          fullName: args.fullName || 'Prospective Founder',
          email: args.email,
          website: args.website,
          linkedIn: args.linkedIn,
          socialLinks: args.socialLinks,
          socialBioText: args.socialBioText,
          companyName: args.companyName,
          businessSummary: args.businessSummary,
          toneArchetype: args.toneArchetype,
          source: 'after_hours_inbound'
        });
        const platformsList = args.socialLinks
          ? Object.keys(args.socialLinks).filter((k) => (args.socialLinks as any)[k]).join(', ')
          : 'None specified';
        const toneLabel = lead.brandVoice?.toneLabel || 'Tactical Operator';
        return {
          status: 'success',
          message: `Dossier & Brand Voice (${toneLabel}) calibrated for ${lead.fullName}: Website (${args.website || 'N/A'}), Socials (${platformsList}), Business (${args.companyName || 'Verified'}). Profile active in RAG memory.`,
          leadId: lead.id,
          lead,
          brandVoice: lead.brandVoice
        };
      }

      case 'qualify_lead': {
        const { lead, calculatedScore } = this.store.qualifyLead({
          email: args.email,
          budgetRange: args.budgetRange,
          coreNeed: args.coreNeed,
          authority: args.authority,
          timelineWeeks: args.timelineWeeks ? Number(args.timelineWeeks) : undefined
        });

        if (!lead) {
          return {
            status: 'error',
            message: `Could not find lead with email ${args.email}. Please create contact first.`
          };
        }

        const isQualified = calculatedScore >= 60;
        return {
          status: 'success',
          qualified: isQualified,
          qualificationScore: calculatedScore,
          recommendedTier: calculatedScore >= 75 ? 'Elite Mastermind' : 'Pro Mentorship',
          message: isQualified
            ? `Lead is highly qualified (Score: ${calculatedScore}/100). Proceed to schedule onboarding call.`
            : `Lead scored ${calculatedScore}/100. Recommend Self-Paced Growth Sprint.`
        };
      }

      case 'get_product_knowledge': {
        const query = args.query;
        // Check semantic/exact cache first
        const cached = cacheEngine.getSemantic(query);
        if (cached) {
          return {
            status: 'success',
            source: 'semantic_cache',
            knowledge: cached
          };
        }

        const docs = ragEngine.search(query, args.category);
        if (docs.length === 0) {
          return {
            status: 'not_found',
            message: 'No specific document matched this query. Refer prospect to standard 14-day guarantee.'
          };
        }

        return {
          status: 'success',
          source: 'hybrid_rag',
          topResult: docs[0].content,
          reference: docs[0].title
        };
      }

      case 'schedule_growth_consultation': {
        const booking = this.store.scheduleMeeting({
          email: args.email,
          preferredDatetime: args.preferredDatetime,
          topic: args.topic
        });

        if (!booking.success) {
          return {
            status: 'error',
            message: `Unable to record the consultation request: email ${args.email} not registered in CRM.`
          };
        }

        return {
          status: 'success',
          scheduledTime: args.preferredDatetime,
          confirmationCode: booking.confirmationCode,
          message: `Consultation request recorded for ${args.preferredDatetime}. This is a request, not a confirmed slot: a person will follow up to confirm. Reference ${booking.confirmationCode}.`
        };
      }

      case 'process_retention_offer': {
        // ====================================================================
        // Deterministic Guardrail Policy ("Model Proposes, Application Enforces")
        // ====================================================================
        const { approvedDiscount, requiresReview, bonusOffer } = decideDiscount(args.proposedDiscountPct);

        const member = this.store.processRetention({
          memberId: args.memberId,
          churnReason: args.churnReason,
          requestedAction: args.requestedAction,
          approvedDiscountPct: approvedDiscount,
          requiresManagerReview: requiresReview,
          bonusOffer
        });

        if (!member) {
          return {
            status: 'error',
            message: `Member ID ${args.memberId} not found in billing directory.`
          };
        }

        if (args.requestedAction === 'confirm_cancellation') {
          return {
            status: 'cancelled',
            message: 'Membership cancellation processed gracefully. Retain access until end of current billing period.'
          };
        }

        return {
          status: 'retention_applied',
          approvedDiscountPct: approvedDiscount,
          bonusOffer: bonusOffer || 'Standard membership retention package',
          requiresManagerReview: requiresReview,
          message: `Retention offer applied: ${approvedDiscount}% discount${
            bonusOffer ? ` plus ${bonusOffer}` : ''
          }. Account status: ${member.status}.`
        };
      }

      case 'run_content_factory': {
        const topic = args.topic;
        // Asynchronously launch the background factory
        this.startContentJob(topic);

        // Return immediate spoken response for AssemblyAI Voice Agent to speak without waiting for research!
        return {
          status: 'queued',
          message: `I've queued the Hermes Content Factory on "${topic}". 3 parallel research lanes have been initiated, and verified drafts will appear in your Content Studio console in real-time for your review and one-click approval.`,
          topic
        };
      }

      default:
        return {
          status: 'error',
          message: `Unknown tool function: ${name}`
        };
    }
  }

  private startContentJob(topic: string): unknown {
    if (this.deps.startContentJob) return this.deps.startContentJob(topic);
    // Lazy: importing the content engine pulls in the DeepSeek service, which loads
    // .env on import. Keeping it out of module load keeps this file side-effect free.
    const { contentFactoryEngine } = require('../services/contentFactoryEngine');
    return contentFactoryEngine.startJob(topic, 'voice_agent_inbound');
  }
}

let productionDispatcher: ToolDispatcher | null = null;

/**
 * The production dispatcher, bound to the real CRM. Built on first use so that
 * merely importing this module does not construct the CRM singleton (which seeds
 * demo data and writes vault files) — the eval harness imports this file.
 */
export const toolDispatcher = {
  dispatch(name: string, args: Record<string, any>): Promise<Record<string, any>> {
    if (!productionDispatcher) {
      const { crmStore } = require('../services/crmStore');
      productionDispatcher = new ToolDispatcher(crmStore);
    }
    return productionDispatcher.dispatch(name, args);
  }
};
