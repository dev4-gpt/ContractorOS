import type { CRMLead, ChurnRiskMember } from '@voice-os/shared';
import type { CrmPort } from '../tools/dispatcher';
import type { CrmSnapshot } from './types';

/**
 * In-memory CRM for evals. Implements the same port as the production store so
 * the real ToolDispatcher runs unchanged, but never touches Postgres or the vault.
 *
 * The BANT scoring mirrors CRMStore.qualifyLead in services/crmStore.ts (that
 * class is not exported and writes vault files on construction, so it cannot be
 * reused here). If the scoring there changes, change it here too. The discount
 * clamp — the policy under test — lives in the dispatcher, not in either store.
 */
export class MemoryCrm implements CrmPort {
  public readonly ready = Promise.resolve();
  private leads = new Map<string, CRMLead>();
  private members = new Map<string, ChurnRiskMember>();
  private seq = 0;

  constructor() {
    // Same members the production store seeds, so member ids in tasks are realistic.
    this.members.set('mem_101', { memberId: 'mem_101', fullName: 'Sarah Jenkins', email: 'sarah.j@example.com', tier: 'vip_mastermind', monthlyFee: 997, status: 'active', requiresManagerReview: false });
    this.members.set('mem_102', { memberId: 'mem_102', fullName: 'David Vance', email: 'david.v@example.com', tier: 'pro', monthlyFee: 297, status: 'active', requiresManagerReview: false });
  }

  async flush(): Promise<void> {}

  private byEmail(email: string) {
    return Array.from(this.leads.values()).find((l) => l.email.toLowerCase() === String(email).toLowerCase());
  }

  createOrUpdateLead(d: Parameters<CrmPort['createOrUpdateLead']>[0]): CRMLead {
    const now = new Date().toISOString();
    const existing = this.byEmail(d.email);
    if (existing) {
      existing.fullName = d.fullName || existing.fullName;
      existing.phone = d.phone || existing.phone;
      existing.updatedAt = now;
      return existing;
    }
    const lead: CRMLead = {
      id: `eval_lead_${++this.seq}`,
      fullName: d.fullName,
      email: d.email,
      phone: d.phone,
      source: d.source,
      qualificationScore: 20,
      status: 'new',
      notes: [],
      createdAt: now,
      updatedAt: now
    };
    this.leads.set(lead.id, lead);
    return lead;
  }

  qualifyLead(d: Parameters<CrmPort['qualifyLead']>[0]) {
    const lead = this.byEmail(d.email);
    if (!lead) return { lead: null, calculatedScore: 0 };
    lead.budgetRange = d.budgetRange;
    lead.coreNeed = d.coreNeed;
    lead.authority = d.authority || 'decision_maker';
    lead.timelineWeeks = d.timelineWeeks || 2;
    let score = 20;
    if (d.budgetRange === 'above_15k') score += 40;
    else if (d.budgetRange === '5k_to_15k') score += 30;
    else if (d.budgetRange === '1k_to_5k') score += 15;
    if (lead.authority === 'decision_maker') score += 20;
    if (lead.timelineWeeks && lead.timelineWeeks <= 4) score += 20;
    lead.qualificationScore = Math.min(100, score);
    lead.status = lead.qualificationScore >= 60 ? 'inbound_qualified' : 'new';
    return { lead, calculatedScore: lead.qualificationScore };
  }

  scheduleMeeting(d: Parameters<CrmPort['scheduleMeeting']>[0]) {
    const lead = this.byEmail(d.email);
    if (!lead) return { success: false, lead: null, confirmationCode: '' };
    lead.scheduledCallTime = d.preferredDatetime;
    lead.status = 'call_scheduled';
    return { success: true, lead, confirmationCode: `EVAL-${++this.seq}` };
  }

  processRetention(d: Parameters<CrmPort['processRetention']>[0]) {
    const m = this.members.get(d.memberId);
    if (!m) return null;
    m.churnReason = d.churnReason;
    m.appliedDiscountPct = d.approvedDiscountPct;
    m.bonusOffer = d.bonusOffer;
    m.requiresManagerReview = d.requiresManagerReview;
    m.status = d.requestedAction === 'confirm_cancellation' ? 'cancelled' : d.approvedDiscountPct > 0 ? 'saved' : 'retention_offered';
    return m;
  }

  snapshot(): CrmSnapshot {
    return { leads: JSON.parse(JSON.stringify(Array.from(this.leads.values()))), members: JSON.parse(JSON.stringify(Array.from(this.members.values()))) };
  }
}
