import type { FlatToolDefinition } from '@voice-os/shared';

export const VOICE_AGENT_TOOLS: FlatToolDefinition[] = [
  {
    type: 'function',
    name: 'create_or_update_lead',
    description: 'Capture or update prospect contact information in the CRM system.',
    parameters: {
      type: 'object',
      properties: {
        fullName: { type: 'string', description: "The prospect's full name" },
        email: { type: 'string', description: "The prospect's valid email address" },
        phone: { type: 'string', description: "The prospect's phone number if provided" },
        source: {
          type: 'string',
          enum: ['after_hours_inbound', 'outbound_campaign', 'web_callback'],
          description: 'The origin channel of this call interaction'
        }
      },
      required: ['fullName', 'email']
    }
  },
  {
    type: 'function',
    name: 'enrich_prospect_dossier',
    description: 'Enrich a prospect with their business website, LinkedIn profile, company name, and bio summary.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "The prospect's email address" },
        fullName: { type: 'string', description: "The prospect's name if known" },
        website: { type: 'string', description: "The prospect's company or portfolio website URL" },
        linkedIn: { type: 'string', description: "The prospect's LinkedIn profile URL" },
        socialBioText: { type: 'string', description: "Prospect's multi-platform social bio, audience size, or about-me summary" },
        companyName: { type: 'string', description: "The prospect's company or community name" },
        businessSummary: { type: 'string', description: "Brief overview of what they do and their audience or revenue" }
      },
      required: ['email']
    }
  },
  {
    type: 'function',
    name: 'qualify_lead',
    description: 'Record BANT qualification metrics (Budget, Authority, Need, Timeline) and compute fit score.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "The prospect's email address" },
        budgetRange: {
          type: 'string',
          enum: ['under_1k', '1k_to_5k', '5k_to_15k', 'above_15k'],
          description: 'Allocated budget range for growth implementation'
        },
        coreNeed: {
          type: 'string',
          description: 'Primary problem or goal (e.g., scale high-ticket course, build funnel, reduce churn)'
        },
        authority: {
          type: 'string',
          enum: ['decision_maker', 'influencer', 'researcher'],
          description: "Prospect's role and purchasing authority"
        },
        timelineWeeks: {
          type: 'number',
          description: 'Desired implementation timeline in weeks'
        }
      },
      required: ['email', 'budgetRange', 'coreNeed']
    }
  },
  {
    type: 'function',
    name: 'get_product_knowledge',
    description: 'Retrieve verified creator product details, course curriculum, tiers, pricing, or case studies.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Specific inquiry about the curriculum, pricing, guarantee, or case studies'
        },
        category: {
          type: 'string',
          enum: ['pricing', 'curriculum', 'guarantee', 'roi_case_study'],
          description: 'Optional category filter for the knowledge base'
        }
      },
      required: ['query']
    }
  },
  {
    type: 'function',
    name: 'schedule_growth_consultation',
    description: "Record a consultation request for the prospect. No calendar is connected: this saves the requested time on the lead and a person follows up to confirm. Never tell the prospect that a slot is booked or confirmed.",
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "The prospect's email address" },
        preferredDatetime: {
          type: 'string',
          description: 'Preferred appointment date and time (e.g., "Tomorrow at 3pm EST" or ISO timestamp)'
        },
        topic: { type: 'string', description: 'Focus area or discussion topic for the call' }
      },
      required: ['email', 'preferredDatetime']
    }
  },
  {
    type: 'function',
    name: 'process_retention_offer',
    description: 'Evaluate and negotiate retention solutions for members requesting cancellation.',
    parameters: {
      type: 'object',
      properties: {
        memberId: { type: 'string', description: 'The unique ID or email of the churn-risk member' },
        churnReason: {
          type: 'string',
          enum: ['too_expensive', 'no_time', 'completed_goals', 'technical_issues'],
          description: 'Underlying reason for wanting to cancel'
        },
        requestedAction: {
          type: 'string',
          enum: ['pause_subscription', 'apply_discount', 'switch_tier', 'confirm_cancellation'],
          description: 'The requested action from the member'
        },
        proposedDiscountPct: {
          type: 'number',
          description: 'Discount percentage proposed by the model (e.g. 15 for 15%)'
        }
      },
      required: ['memberId', 'churnReason', 'requestedAction']
    }
  },
  {
    type: 'function',
    name: 'run_content_factory',
    description:
      'Trigger the autonomous Hermes Content Factory to research, synthesize, and draft a verified multi-platform content pack (X thread, newsletter, webinar pitch) from a topic, student question, or objection.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The core topic, objection, or question to research and turn into content.'
        },
        targetAudience: {
          type: 'string',
          description: 'Optional target audience description.'
        }
      },
      required: ['topic']
    }
  }
];
