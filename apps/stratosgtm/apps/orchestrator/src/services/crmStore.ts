import type { CRMLead, ChurnRiskMember, TurnTelemetry } from '@voice-os/shared';
import * as fs from 'fs';
import * as path from 'path';
import { graphDatabaseService } from './graphDatabaseService';
import { brandVoiceService, ToneArchetype } from './brandVoiceService';
import { isDatabaseConfigured } from '../db/client';
import { upsertLead, listAllLeads, upsertMember, listAllMembers } from '../db/repository';

/** Below this gap, a repeat tool call with no new fields is treated as a no-op, not a fresh update. */
const REDUNDANT_UPDATE_WINDOW_SECONDS = 30;

/** Demo records created in memory at boot. Never allowed to overwrite stored data. */
const SEED_LEAD_IDS = new Set(['lead_ak_901']);
const SEED_MEMBER_IDS = new Set(['mem_101', 'mem_102']);

/**
 * Lead and churn-member store.
 *
 * Write-through cache over Postgres. Reads stay synchronous against memory, so
 * the 19 existing call sites are untouched; every mutation is also written to the
 * database, and the store rehydrates from it on boot.
 *
 * Writes are tracked, not fire-and-forget. On a serverless host the function can
 * be frozen the instant a response is sent, so an unawaited write may never land.
 * Anything that mutates the store must `await crmStore.flush()` before responding.
 */
class CRMStore {
  private leads: Map<string, CRMLead> = new Map();
  private members: Map<string, ChurnRiskMember> = new Map();
  private telemetryLogs: TurnTelemetry[] = [];
  private onLeadUpdateCallback?: (lead: CRMLead) => void;
  private pendingWrites = new Set<Promise<void>>();

  /** Resolves once stored data has been loaded. Await before the first read or write. */
  public readonly ready: Promise<void>;

  constructor() {
    this.seedInitialData();
    this.ready = this.hydrate();
  }

  /** Waits for every in-flight database write to settle. */
  public async flush(): Promise<void> {
    await Promise.allSettled(Array.from(this.pendingWrites));
  }

  private track(write: Promise<void>, what: string): void {
    const tracked = write.catch((err) => {
      console.error(`[CRM] Failed to persist ${what}:`, err?.message || err);
    });
    this.pendingWrites.add(tracked);
    void tracked.finally(() => this.pendingWrites.delete(tracked));
  }

  private saveLead(lead: CRMLead): void {
    this.leads.set(lead.id, lead);
    this.track(upsertLead(lead), `lead ${lead.id}`);
  }

  /**
   * Persists a lead that a caller mutated in place, and refreshes its vault
   * export. Callers used to push notes onto a lead and then call syncLeadToVault
   * as if that saved it — but that only writes the Obsidian export, so the change
   * never reached the database. This is the explicit save.
   */
  public commitLead(lead: CRMLead, toneOverride?: ToneArchetype): void {
    this.saveLead(lead);
    this.syncLeadToVault(lead, toneOverride);
  }

  private saveMember(member: ChurnRiskMember): void {
    this.members.set(member.memberId, member);
    this.track(upsertMember(member), `member ${member.memberId}`);
  }

  /**
   * Loads stored leads and members.
   *
   * Against an empty database the in-memory seed is persisted once, so a fresh
   * deploy still has demo data. Otherwise the database is authoritative: seed
   * records are discarded in favour of what is stored, and anything created in
   * memory during hydration that is not yet stored is kept rather than lost.
   */
  private async hydrate(): Promise<void> {
    if (!isDatabaseConfigured()) return;

    try {
      const [storedLeads, storedMembers] = await Promise.all([listAllLeads(), listAllMembers()]);

      if (storedLeads.length === 0 && storedMembers.length === 0) {
        for (const lead of this.leads.values()) this.track(upsertLead(lead), `seed lead ${lead.id}`);
        for (const m of this.members.values()) this.track(upsertMember(m), `seed member ${m.memberId}`);
        await this.flush();
        return;
      }

      const mergedLeads = new Map(storedLeads.map((l) => [l.id, l] as [string, CRMLead]));
      for (const [id, lead] of this.leads) {
        if (!mergedLeads.has(id) && !SEED_LEAD_IDS.has(id)) mergedLeads.set(id, lead);
      }

      const mergedMembers = new Map(storedMembers.map((m) => [m.memberId, m] as [string, ChurnRiskMember]));
      for (const [id, member] of this.members) {
        if (!mergedMembers.has(id) && !SEED_MEMBER_IDS.has(id)) mergedMembers.set(id, member);
      }

      this.leads = mergedLeads;
      this.members = mergedMembers;
    } catch (err: any) {
      // Serve from memory rather than failing to boot, but say so: this instance
      // will not see stored data and anything it writes may conflict.
      console.error('[CRM] Hydration from Postgres failed; serving in-memory data only:', err?.message || err);
    }
  }

  public setUpdateListener(callback: (lead: CRMLead) => void) {
    this.onLeadUpdateCallback = callback;
  }

  private notifyLeadUpdate(lead: CRMLead) {
    if (this.onLeadUpdateCallback) {
      this.onLeadUpdateCallback(lead);
    }
  }

  private seedInitialData() {
    // Seed test churn-risk members
    const testMembers: ChurnRiskMember[] = [
      {
        memberId: 'mem_101',
        fullName: 'Sarah Jenkins',
        email: 'sarah.j@example.com',
        tier: 'vip_mastermind',
        monthlyFee: 997,
        status: 'active',
        requiresManagerReview: false
      },
      {
        memberId: 'mem_102',
        fullName: 'David Vance',
        email: 'david.v@example.com',
        tier: 'pro',
        monthlyFee: 297,
        status: 'active',
        requiresManagerReview: false
      }
    ];

    testMembers.forEach((m) => this.members.set(m.memberId, m));

    // Seed realistic archetype lead with social links and bio
    const now = new Date().toISOString();
    const demoLead: CRMLead = {
      id: 'lead_ak_901',
      fullName: 'Alex Kim',
      email: 'alex.kim@acmecoaching.example',
      phone: '+1 (555) 438-9201',
      website: 'https://acmecoaching.example',
      linkedIn: 'https://linkedin.com/in/alexkim-coaching',
      socialLinks: {
        twitter: 'https://x.com/alexkim_coaching',
        linkedin: 'https://linkedin.com/in/alexkim-coaching',
        youtube: 'https://youtube.com/@acmecoaching',
        instagram: 'https://instagram.com/acmecoaching',
        substack: 'https://alexkim.substack.com'
      },
      socialBioText:
        'Founder of Acme Coaching Co. (15k UI/UX designer community, 120k newsletter readers). Transitioning from $47 ebook sales into high-ticket $2,997 Pro Career Sprints and $10k/mo agency retainers. Needs 24/7 after-hours voice qualification to handle European and Asian inbound leads.',
      companyName: 'Acme Coaching Co.',
      businessSummary: '15k community members, $47-$2,997 product suite, expanding into enterprise design sprints',
      source: 'after_hours_inbound',
      budgetRange: '5k_to_15k',
      coreNeed: 'Automate 24/7 after-hours inbound qualification & reduce lead dropoff',
      authority: 'decision_maker',
      timelineWeeks: 3,
      qualificationScore: 85,
      status: 'inbound_qualified',
      scheduledCallTime: 'Tomorrow at 2:00 PM EST',
      notes: [
        'Voice Agent (Anna) qualified lead via 24/7 inbound channel.',
        'Budget confirmed: $5,000 - $15,000. Core need: after-hours qualification for international timezones.',
        'Social Footprint Analyzed: 120k Substack + 15k Community. High-intent founder archetype.'
      ],
      createdAt: now,
      updatedAt: now
    };
    this.leads.set(demoLead.id, demoLead);
    this.syncLeadToVault(demoLead);
  }

  public getLeads(): CRMLead[] {
    return Array.from(this.leads.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getMembers(): ChurnRiskMember[] {
    return Array.from(this.members.values());
  }

  public getTelemetry(): TurnTelemetry[] {
    return [...this.telemetryLogs];
  }

  public logTurn(telemetry: TurnTelemetry) {
    this.telemetryLogs.push(telemetry);
  }

  public updateLeadStatus(leadId: string, status: CRMLead['status']): CRMLead | null {
    const lead = this.leads.get(leadId);
    if (!lead) return null;

    const previousStatus = lead.status;
    if (previousStatus === status) return lead;

    lead.status = status;
    lead.updatedAt = new Date().toISOString();
    lead.notes.push(`Pipeline stage moved from "${previousStatus}" to "${status}" (manual Kanban drag).`);

    this.saveLead(lead);
    this.syncLeadToVault(lead);
    this.notifyLeadUpdate(lead);
    return lead;
  }

  public createOrUpdateLead(data: {
    fullName: string;
    email: string;
    phone?: string;
    website?: string;
    linkedIn?: string;
    socialLinks?: {
      twitter?: string;
      linkedin?: string;
      youtube?: string;
      instagram?: string;
      substack?: string;
      tiktok?: string;
      podcast?: string;
      other?: string;
    };
    socialBioText?: string;
    companyName?: string;
    businessSummary?: string;
    toneArchetype?: ToneArchetype;
    source: 'after_hours_inbound' | 'outbound_campaign' | 'web_callback';
  }): CRMLead {
    const existing = Array.from(this.leads.values()).find((l) => l.email.toLowerCase() === data.email.toLowerCase());
    const now = new Date().toISOString();

    if (existing) {
      // The model sometimes re-issues this exact tool call seconds later with no new
      // information (observed in a real measured eval run: two calls a moment apart,
      // same lead, same fields). A no-op repeat like that shouldn't write another row or
      // clutter the notes with a duplicate "Updated" entry; a genuine change, or the same
      // call resurfacing after a real gap, still records normally.
      const changed =
        (!!data.fullName && data.fullName !== existing.fullName) ||
        (!!data.phone && data.phone !== existing.phone) ||
        (!!data.website && data.website !== existing.website) ||
        (!!data.linkedIn && data.linkedIn !== existing.linkedIn) ||
        (!!data.socialLinks && Object.entries(data.socialLinks).some(([k, v]) => !!v && (existing.socialLinks as any)?.[k] !== v)) ||
        (!!data.socialBioText && data.socialBioText !== existing.socialBioText) ||
        (!!data.companyName && data.companyName !== existing.companyName) ||
        (!!data.businessSummary && data.businessSummary !== existing.businessSummary) ||
        (!!data.source && data.source !== existing.source);
      const secondsSincePreviousUpdate = (Date.parse(now) - Date.parse(existing.updatedAt)) / 1000;
      if (!changed && secondsSincePreviousUpdate <= REDUNDANT_UPDATE_WINDOW_SECONDS) {
        return existing;
      }

      existing.fullName = data.fullName || existing.fullName;
      existing.phone = data.phone || existing.phone;
      existing.website = data.website || existing.website;
      existing.linkedIn = data.linkedIn || existing.linkedIn;
      if (data.socialLinks) existing.socialLinks = { ...existing.socialLinks, ...data.socialLinks };
      if (data.socialBioText) existing.socialBioText = data.socialBioText;
      existing.companyName = data.companyName || existing.companyName;
      existing.businessSummary = data.businessSummary || existing.businessSummary;
      existing.source = data.source || existing.source;
      existing.updatedAt = now;
      existing.notes.push(`Updated via voice inbound on ${now}`);
      this.saveLead(existing);
      this.syncLeadToVault(existing, data.toneArchetype);
      return existing;
    }

    const newLead: CRMLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      website: data.website,
      linkedIn: data.linkedIn,
      socialLinks: data.socialLinks,
      socialBioText: data.socialBioText,
      companyName: data.companyName,
      businessSummary: data.businessSummary,
      source: data.source,
      qualificationScore: 20,
      status: 'new',
      notes: [`Created via voice agent on ${now}`],
      createdAt: now,
      updatedAt: now
    };

    this.saveLead(newLead);
    this.syncLeadToVault(newLead, data.toneArchetype);
    return newLead;
  }

  public qualifyLead(data: {
    email: string;
    budgetRange: string;
    coreNeed: string;
    authority?: string;
    timelineWeeks?: number;
  }): { lead: CRMLead | null; calculatedScore: number } {
    const lead = Array.from(this.leads.values()).find((l) => l.email.toLowerCase() === data.email.toLowerCase());
    if (!lead) return { lead: null, calculatedScore: 0 };

    // Same reasoning as createOrUpdateLead: a repeat call moments later with an identical
    // budget/authority/timeline produces the identical score and note text, so skip writing
    // it again rather than stacking duplicate "BANT Qualified" notes.
    const unchanged =
      lead.budgetRange === data.budgetRange &&
      (lead.authority || 'decision_maker') === (data.authority || 'decision_maker') &&
      (lead.timelineWeeks || 2) === (data.timelineWeeks || 2);
    const secondsSincePreviousQualifyLeadUpdate = (Date.now() - Date.parse(lead.updatedAt)) / 1000;
    if (unchanged && secondsSincePreviousQualifyLeadUpdate <= REDUNDANT_UPDATE_WINDOW_SECONDS) {
      return { lead, calculatedScore: lead.qualificationScore };
    }

    lead.budgetRange = data.budgetRange;
    lead.coreNeed = data.coreNeed;
    lead.authority = data.authority || 'decision_maker';
    lead.timelineWeeks = data.timelineWeeks || 2;

    // Calculate BANT Score
    let score = 20; // base contact score
    if (data.budgetRange === 'above_15k') score += 40;
    else if (data.budgetRange === '5k_to_15k') score += 30;
    else if (data.budgetRange === '1k_to_5k') score += 15;

    if (lead.authority === 'decision_maker') score += 20;
    if (lead.timelineWeeks && lead.timelineWeeks <= 4) score += 20;

    lead.qualificationScore = Math.min(100, score);
    lead.status = lead.qualificationScore >= 60 ? 'inbound_qualified' : 'new';
    lead.updatedAt = new Date().toISOString();
    lead.notes.push(`BANT Qualified: score ${lead.qualificationScore}/100. Budget: ${data.budgetRange}`);

    this.saveLead(lead);
    this.syncLeadToVault(lead);
    return { lead, calculatedScore: lead.qualificationScore };
  }

  public scheduleMeeting(data: {
    email: string;
    preferredDatetime: string;
    topic?: string;
  }): { success: boolean; lead: CRMLead | null; confirmationCode: string } {
    const lead = Array.from(this.leads.values()).find((l) => l.email.toLowerCase() === data.email.toLowerCase());
    if (!lead) return { success: false, lead: null, confirmationCode: '' };

    const confirmationCode = `GROWTH-${Math.floor(100000 + Math.random() * 900000)}`;
    lead.scheduledCallTime = data.preferredDatetime;
    lead.status = 'call_scheduled';
    lead.updatedAt = new Date().toISOString();
    lead.notes.push(`Consultation booked: ${data.preferredDatetime}. Code: ${confirmationCode}`);

    this.saveLead(lead);
    this.syncLeadToVault(lead);
    return { success: true, lead, confirmationCode };
  }

  public processRetention(data: {
    memberId: string;
    churnReason: string;
    requestedAction: string;
    approvedDiscountPct: number;
    requiresManagerReview: boolean;
    bonusOffer?: string;
  }): ChurnRiskMember | null {
    const member = this.members.get(data.memberId);
    if (!member) return null;

    member.churnReason = data.churnReason;
    member.appliedDiscountPct = data.approvedDiscountPct;
    member.bonusOffer = data.bonusOffer;
    member.requiresManagerReview = data.requiresManagerReview;

    if (data.requestedAction === 'confirm_cancellation') {
      member.status = 'cancelled';
    } else {
      member.status = data.approvedDiscountPct > 0 ? 'saved' : 'retention_offered';
    }

    this.saveMember(member);
    return member;
  }

  public syncLeadToVault(lead: CRMLead, toneOverride?: ToneArchetype) {
    try {
      // Synthesize Brand Voice Matrix
      const bv = brandVoiceService.analyzeAndSynthesizeBrandVoice(lead, toneOverride);
      lead.brandVoice = bv;
    } catch (e: any) {
      console.error('[CRM Store Brand Voice Error]', e.message);
    }
    try {
      const vaultBase = path.resolve(process.cwd(), 'vault');
      const safeFolder = (lead.companyName || lead.fullName || 'Client')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      const clientDir = path.join(vaultBase, 'Clients', safeFolder);
      const dossiersDir = path.join(vaultBase, 'Dossiers');
      const leadsDir = path.join(vaultBase, 'Leads');

      if (!fs.existsSync(clientDir)) fs.mkdirSync(clientDir, { recursive: true });
      if (!fs.existsSync(dossiersDir)) fs.mkdirSync(dossiersDir, { recursive: true });
      if (!fs.existsSync(leadsDir)) fs.mkdirSync(leadsDir, { recursive: true });

      const nowStr = new Date().toISOString();
      const socialLinksList = lead.socialLinks
        ? Object.entries(lead.socialLinks)
            .filter(([_, url]) => Boolean(url))
            .map(([platform, url]) => `* **${platform.toUpperCase()}:** [${url}](${url})`)
            .join('\n')
        : '* *No direct social links configured.*';

      const notesList = lead.notes && lead.notes.length > 0
        ? lead.notes.map((n) => `* ${n}`).join('\n')
        : '* *Initial dossier created via Voice AI Operator.*';

      const dossierContent = `---
id: "${lead.id}"
title: "${lead.fullName} — ${lead.companyName || 'Client Dossier'}"
type: "ClientDossier"
clientName: "${lead.fullName}"
companyName: "${lead.companyName || 'Independent'}"
email: "${lead.email}"
phone: "${lead.phone || 'N/A'}"
website: "${lead.website || 'N/A'}"
linkedIn: "${lead.linkedIn || 'N/A'}"
budgetRange: "${lead.budgetRange || 'unspecified'}"
qualificationScore: ${lead.qualificationScore}
status: "${lead.status}"
updatedAt: "${nowStr}"
tags:
  - client-dossier
  - revenue-os
  - voice-ai
  - assemblyai
---

# 👤 Client & Business Dossier: ${lead.fullName}
**Organization / Community:** ${lead.companyName || 'Independent Creator'}  
**Primary Contact:** [${lead.email}](mailto:${lead.email}) • ${lead.phone || 'Phone Pending'}  
**Official Website:** [${lead.website || 'N/A'}](${lead.website || '#'})  
**LinkedIn:** [${lead.linkedIn || 'N/A'}](${lead.linkedIn || '#'})  

> [!info] Autonomous Dossier Synchronization
> This file is automatically maintained by **StratosGTM** and synced into active RAG memory for the **AssemblyAI Voice Agent (Anna)**.

---

## 🌐 Multi-Platform Social Footprint
${socialLinksList}

---

## 📝 Audience Context & Strategic Bio Analysis
${lead.socialBioText || lead.businessSummary || '*No bio context provided yet.*'}

---

## 🎯 High-Ticket Growth Objectives & Core Needs
* **Core Problem / Objective:** ${lead.coreNeed || 'Scale high-ticket inbound funnel and automate 24/7 after-hours qualification.'}
* **Business Summary:** ${lead.businessSummary || 'Scaling educational or coaching community into high-ticket cohorts.'}
* **Purchasing Authority:** \`${lead.authority || 'Decision Maker'}\`
* **Target Budget Range:** \`${lead.budgetRange || '$5,000 - $15,000'}\`
* **Implementation Timeline:** \`${lead.timelineWeeks || 2} Weeks\`
* **Scheduled Strategy Consultation:** \`${lead.scheduledCallTime || 'Pending Call Booking'}\`

---

## 📊 BANT Qualification Status
* **Qualification Fit Score:** **${lead.qualificationScore} / 100**
* **Pipeline Stage:** \`${lead.status.toUpperCase()}\`
* **Recommendation:** ${
        lead.qualificationScore >= 75
          ? 'Fast-track to Elite Mastermind / Dedicated Growth Operator.'
          : lead.qualificationScore >= 60
          ? 'Qualifies for Pro Mentorship Sprint ($2,997).'
          : 'Recommend Self-Paced Growth Sprint ($997).'
      }

---

## 💬 Real-Time Activity Log & Voice Transcripts
${notesList}

---

## 🔗 Bidirectional Vault Links
- [[BrandVoice|🎙️ Brand Voice & Persona Matrix]]
- [[../../Index|← Return to Vault Map of Content]]
- [[../../Content-Packs/pack_cf_101|Associated Content Marketing Pack]]
`;

      const dossierPath = path.join(clientDir, 'Dossier.md');
      fs.writeFileSync(dossierPath, dossierContent, 'utf-8');

      // Also write convenience link in vault/Dossiers/
      const topLevelDossierPath = path.join(dossiersDir, `${safeFolder}.md`);
      fs.writeFileSync(topLevelDossierPath, dossierContent, 'utf-8');

      // Also write in vault/Leads/ for backwards compatibility
      const leadPath = path.join(leadsDir, `${lead.id}.md`);
      fs.writeFileSync(leadPath, dossierContent, 'utf-8');

      // Update Node in Graph Database
      graphDatabaseService.addNode({
        id: lead.id,
        type: 'Lead',
        label: `${lead.fullName} (${lead.companyName || 'Independent'})`,
        properties: {
          email: lead.email,
          phone: lead.phone || 'N/A',
          website: lead.website || 'N/A',
          companyName: lead.companyName || 'N/A',
          budgetRange: lead.budgetRange || 'unspecified',
          qualificationScore: lead.qualificationScore,
          status: lead.status,
          vaultPath: `vault/Clients/${safeFolder}/Dossier.md`
        }
      });

      // Update vault/Index.md to list new client
      this.updateVaultIndex(safeFolder, lead);

      console.log(`[CRM Store] Successfully synced ${lead.fullName} to vault/Clients/${safeFolder}/Dossier.md`);
    } catch (err: any) {
      console.error('[CRM Store Vault Sync Error]', err.message);
    }
  }

  private updateVaultIndex(safeFolder: string, lead: CRMLead) {
    try {
      const indexPath = path.resolve(process.cwd(), 'vault', 'Index.md');
      if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf-8');
        const linkEntry = `- [[Clients/${safeFolder}/Dossier|Client Dossier: ${lead.fullName} (${lead.companyName || 'Independent'})]] — Score ${lead.qualificationScore}/100.`;
        if (!content.includes(linkEntry)) {
          content = content.replace(
            '## 🗂️ Knowledge Vault Sections',
            `## 🗂️ Knowledge Vault Sections\n\n${linkEntry}`
          );
          fs.writeFileSync(indexPath, content, 'utf-8');
        }
      }
    } catch (e: any) {
      console.error('[Update Vault Index]', e.message);
    }
  }

}

export const crmStore = new CRMStore();
