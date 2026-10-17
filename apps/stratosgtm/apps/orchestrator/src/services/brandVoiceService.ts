import * as fs from 'fs';
import * as path from 'path';
import type { CRMLead } from '@voice-os/shared';
import { graphDatabaseService } from './graphDatabaseService';

export type ToneArchetype =
  | 'tactical_operator'
  | 'empathetic_mentor'
  | 'visionary_founder'
  | 'enterprise_advisor';

export interface BrandVoiceProfile {
  id: string;
  clientId: string;
  clientName: string;
  companyName: string;
  toneArchetype: ToneArchetype;
  toneLabel: string;
  toneDescription: string;
  voiceAttributes: {
    formality: number; // 1 to 5
    energy: number; // 1 to 5
    directness: number; // 1 to 5
    pacing: string;
  };
  signatureLexicon: string[];
  bannedTerms: string[];
  coreValueProposition: string;
  targetAudience: string;
  customGreeting: string;
  systemPromptModifier: string;
  objectionHandlingStrategy: string;
  vaultPath: string;
  updatedAt: string;
}

export class BrandVoiceService {
  private profiles: Map<string, BrandVoiceProfile> = new Map();

  constructor() {
    this.initPreloadedProfiles();
  }

  private initPreloadedProfiles() {
    // Default profile for Alex's Growth Accelerator / Acme Coaching Co.
    const designProfile: BrandVoiceProfile = {
      id: 'bv_design_academy',
      clientId: 'lead_ak_901',
      clientName: 'Alex Kim',
      companyName: 'Acme Coaching Co.',
      toneArchetype: 'tactical_operator',
      toneLabel: 'Tactical Operator',
      toneDescription: 'Direct, metrics-driven, no-fluff practitioner who values speed of implementation and concrete proof.',
      voiceAttributes: {
        formality: 2,
        energy: 4,
        directness: 5,
        pacing: 'punchy and concise'
      },
      signatureLexicon: ['growth sprint', 'funnel velocity', 'milestone refund', 'high-ticket', 'cohort', 'after-hours pipeline'],
      bannedTerms: ['cheap', 'guru', 'synergy', 'passive income', 'magic bullet', 'hard sell'],
      coreValueProposition: 'Transform digital courses and designer communities into high-ticket $3k-$10k monthly recurring sprints with 24/7 autonomous intake.',
      targetAudience: 'High-earning designers, studio heads, and course creators with existing audiences looking to scale.',
      customGreeting: "Welcome to GrowthOS Advisory for Acme Coaching Co.. I'm Anna, Senior Growth Operating Architect. What is the primary revenue or acquisition bottleneck you are looking to solve today?",
      systemPromptModifier: 'Speak with decisive, practitioner confidence. Emphasize operational leverage and concrete numbers. Never offer unauthorized discounts.',
      objectionHandlingStrategy: 'Acknowledge hesitation immediately. Deploy the 14-day action-based refund guarantee to eliminate perceived risk without eroding margin.',
      vaultPath: 'vault/Clients/Acme_Coaching_Co/BrandVoice.md',
      updatedAt: new Date().toISOString()
    };
    this.profiles.set('acmecoaching', designProfile);
  }

  public analyzeAndSynthesizeBrandVoice(lead: CRMLead, toneOverride?: ToneArchetype): BrandVoiceProfile {
    const safeFolder = (lead.companyName || lead.fullName || 'Client')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const lookupKey = safeFolder.toLowerCase();

    // Determine Tone Archetype
    let archetype: ToneArchetype = toneOverride || 'tactical_operator';
    const combinedBio = `${lead.businessSummary || ''} ${lead.socialBioText || ''}`.toLowerCase();

    if (!toneOverride) {
      if (combinedBio.includes('enterprise') || combinedBio.includes('b2b') || combinedBio.includes('agency')) {
        archetype = 'enterprise_advisor';
      } else if (combinedBio.includes('community') || combinedBio.includes('educat') || combinedBio.includes('mentor')) {
        archetype = 'empathetic_mentor';
      } else if (combinedBio.includes('ai') || combinedBio.includes('future') || combinedBio.includes('innovat') || combinedBio.includes('film')) {
        archetype = 'visionary_founder';
      } else {
        archetype = 'tactical_operator';
      }
    }

    const config = this.getArchetypeConfig(archetype, lead);
    const id = `bv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const vaultPath = `vault/Clients/${safeFolder}/BrandVoice.md`;
    const nowStr = new Date().toISOString();

    const profile: BrandVoiceProfile = {
      id,
      clientId: lead.id,
      clientName: lead.fullName,
      companyName: lead.companyName || `${lead.fullName}'s Studio`,
      toneArchetype: archetype,
      toneLabel: config.label,
      toneDescription: config.description,
      voiceAttributes: config.attributes,
      signatureLexicon: config.signatureLexicon,
      bannedTerms: config.bannedTerms,
      coreValueProposition: lead.businessSummary || config.defaultProposition,
      targetAudience: config.targetAudience,
      customGreeting: `Welcome to GrowthOS Advisory for ${lead.companyName || lead.fullName}. I'm Anna, Senior Growth Operating Architect. What is the primary bottleneck in your revenue architecture today?`,
      systemPromptModifier: config.systemPromptModifier,
      objectionHandlingStrategy: config.objectionHandlingStrategy,
      vaultPath,
      updatedAt: nowStr
    };

    this.profiles.set(lookupKey, profile);

    // Save BrandVoice.md into Vault
    this.writeBrandVoiceToVault(safeFolder, profile, lead);

    // Register node & edge in Graph Database
    this.registerBrandVoiceInGraph(profile, lead);

    return profile;
  }

  private getArchetypeConfig(archetype: ToneArchetype, lead: CRMLead) {
    const comp = lead.companyName || lead.fullName;
    switch (archetype) {
      case 'empathetic_mentor':
        return {
          label: 'Empathetic Mentor',
          description: 'Warm, encouraging, deeply student-focused. Builds psychological safety while maintaining high standards.',
          attributes: { formality: 2, energy: 3, directness: 3, pacing: 'measured and warm' },
          signatureLexicon: ['transformation', 'community cohort', 'breakthrough', 'creative mastery', 'guided mentorship', 'action-oriented'],
          bannedTerms: ['grind', 'hustle', 'synergy', 'guru', 'cheap', 'hard sell', 'pressure'],
          defaultProposition: `Empower creators and founders to master high-value skills through high-touch community mentorship.`,
          targetAudience: 'Self-motivated learners and founders seeking structured accountability and peer community.',
          systemPromptModifier: `You represent ${comp}. Speak with genuine empathy and patience. Emphasize personalized guidance and student success over aggressive closing.`,
          objectionHandlingStrategy: 'Listen deeply to their personal situation. Offer our 14-day action guarantee as a zero-risk safety net.'
        };
      case 'visionary_founder':
        return {
          label: 'Visionary Founder',
          description: 'Inspiring, cutting-edge, forward-thinking. Speaks with high conviction about the paradigm shift in AI and media.',
          attributes: { formality: 3, energy: 5, directness: 4, pacing: 'fast-paced and energetic' },
          signatureLexicon: ['paradigm shift', 'exponential leverage', 'production-grade AI', 'next frontier', 'creative workflow', 'next-gen'],
          bannedTerms: ['legacy', 'slow', 'theory', 'basic', 'cheap', 'traditional agency'],
          defaultProposition: `Build and deploy world-class AI-powered creative engines that redefine digital media and education.`,
          targetAudience: 'Forward-leaning innovators, creators, and builders who want to lead the AI wave.',
          systemPromptModifier: `You represent ${comp}. Project visionary authority and infectious optimism about AI breakthroughs. Keep responses focused on exponential leverage.`,
          objectionHandlingStrategy: 'Position our framework as the definitive competitive moat against being left behind by legacy methods.'
        };
      case 'enterprise_advisor':
        return {
          label: 'Enterprise Advisor',
          description: 'Polished, strategic, consultative. Focuses on ROI, risk mitigation, institutional quality, and executive alignment.',
          attributes: { formality: 4, energy: 3, directness: 4, pacing: 'structured and authoritative' },
          signatureLexicon: ['revenue architecture', 'pipeline velocity', 'retention yield', 'SLA', 'governance', 'deterministic guardrails'],
          bannedTerms: ['hacks', 'tricks', 'viral loop', 'get rich', 'cheap', 'untested'],
          defaultProposition: `Deploy enterprise-grade autonomous revenue operations with deterministic margin protection and 24/7 SLA.`,
          targetAudience: 'B2B leaders, agency founders, and educational institutions scaling multi-seat operations.',
          systemPromptModifier: `You represent ${comp}. Maintain a consultative, executive tone. Anchor every recommendation in ROI, margin protection, and risk mitigation.`,
          objectionHandlingStrategy: 'Frame pricing against the cost of inaction and lost pipeline revenue. Provide structured milestone deliverables.'
        };
      case 'tactical_operator':
      default:
        return {
          label: 'Tactical Operator',
          description: 'Direct, metrics-driven, no-fluff practitioner who values speed of implementation and concrete proof.',
          attributes: { formality: 2, energy: 4, directness: 5, pacing: 'punchy and concise' },
          signatureLexicon: ['growth sprint', 'funnel velocity', 'milestone refund', 'high-ticket', 'cohort', 'after-hours pipeline'],
          bannedTerms: ['cheap', 'guru', 'synergy', 'passive income', 'magic bullet', 'hard sell'],
          defaultProposition: `Automate 24/7 inbound discovery, qualification, and high-ticket enrollment with zero manual sales bottlenecks.`,
          targetAudience: 'Founders and operators who care about speed to revenue and actionable execution.',
          systemPromptModifier: `You represent ${comp}. Be direct, tactical, and relentlessly focused on execution. Value their time and get straight to the point.`,
          objectionHandlingStrategy: 'Reframe price into ROI. Deploy the action-based guarantee to make saying yes a mathematical no-brainer.'
        };
    }
  }

  private writeBrandVoiceToVault(safeFolder: string, profile: BrandVoiceProfile, lead: CRMLead) {
    try {
      const vaultBase = path.resolve(process.cwd(), 'vault');
      const clientDir = path.join(vaultBase, 'Clients', safeFolder);
      if (!fs.existsSync(clientDir)) fs.mkdirSync(clientDir, { recursive: true });

      const content = `---
id: "${profile.id}"
title: "${profile.companyName} — Brand Voice & Persona Matrix"
type: "BrandVoice"
clientId: "${lead.id}"
clientName: "${profile.clientName}"
companyName: "${profile.companyName}"
toneArchetype: "${profile.toneArchetype}"
toneLabel: "${profile.toneLabel}"
formality: ${profile.voiceAttributes.formality}
energy: ${profile.voiceAttributes.energy}
directness: ${profile.voiceAttributes.directness}
updatedAt: "${profile.updatedAt}"
tags:
  - brand-voice
  - revenue-os
  - voice-persona
  - assemblyai
---

# 🎙️ Brand Voice Matrix: ${profile.companyName}
**Client / Founder:** [[Dossier|${profile.clientName}]]  
**Tone Archetype:** **${profile.toneLabel}**  
**Pacing & Cadence:** ${profile.voiceAttributes.pacing}  
**Directness Score:** ${profile.voiceAttributes.directness} / 5 • **Energy:** ${profile.voiceAttributes.energy} / 5 • **Formality:** ${profile.voiceAttributes.formality} / 5  

> [!info] Autonomous Voice Persona Injection
> This Brand Voice specification is dynamically loaded into **AssemblyAI Voice Agent (Anna)** and the **Hermes Content Factory**. Every spoken conversation and synthesized marketing asset strictly obeys these tone parameters.

---

## 🎭 Tone Archetype & Personality DNA
${profile.toneDescription}

* **Core Persona Mandate:** ${profile.systemPromptModifier}
* **Active Brand Greeting:** \`${profile.customGreeting}\`

---

## 📚 Signature Lexicon vs. Banned Terms

| ✅ Signature Vocabulary (Mandatory) | ❌ Forbidden Terms (Banned) |
| :--- | :--- |
${profile.signatureLexicon.map((term, i) => `| **${term}** | ~${profile.bannedTerms[i] || 'N/A'}~ |`).join('\n')}

---

## 🎯 Value Proposition & Core Promise
> "${profile.coreValueProposition}"

* **Ideal Target Profile:** ${profile.targetAudience}
* **Strategic Objection Cadence:** ${profile.objectionHandlingStrategy}

---

## 🤖 Dynamic System Prompt Injection for Anna
\`\`\`markdown
You are Anna, Senior Growth Operating Architect at GrowthOS, advising ${profile.companyName}.
You represent GrowthOS as a strategic revenue consultancy. Never claim to have built ${profile.companyName} internally or say "we did this".
Your tone is ${profile.toneLabel}: ${profile.toneDescription}
Follow these executive consultation guidelines:
1. Greet callers warmly and authoritatively: "${profile.customGreeting}"
2. Use signature brand terms: ${profile.signatureLexicon.join(', ')}
3. NEVER use banned words or generic hype: ${profile.bannedTerms.join(', ')}
4. Core strategic offering: ${profile.coreValueProposition}
5. Objection handling: ${profile.objectionHandlingStrategy}
\`\`\`

---

## 🔗 Bidirectional Vault Links
- [[Dossier|← Client Business Dossier]]
- [[../../Index|← Return to Vault Map of Content]]
`;

      const filePath = path.join(clientDir, 'BrandVoice.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      // Update Index.md
      const indexPath = path.join(vaultBase, 'Index.md');
      if (fs.existsSync(indexPath)) {
        let indexContent = fs.readFileSync(indexPath, 'utf-8');
        const bvLink = `- [[Clients/${safeFolder}/BrandVoice|Brand Voice: ${profile.companyName} (${profile.toneLabel})]]`;
        if (!indexContent.includes(bvLink)) {
          indexContent = indexContent.replace(
            '## 🗂️ Knowledge Vault Sections',
            `## 🗂️ Knowledge Vault Sections\n\n${bvLink}`
          );
          fs.writeFileSync(indexPath, indexContent, 'utf-8');
        }
      }

      console.log(`[BrandVoiceService] Synced BrandVoice.md for ${profile.companyName} at ${filePath}`);
    } catch (err: any) {
      console.error('[BrandVoiceService Vault Sync Error]', err.message);
    }
  }

  private registerBrandVoiceInGraph(profile: BrandVoiceProfile, lead: CRMLead) {
    try {
      graphDatabaseService.addNode({
        id: profile.id,
        type: 'BrandVoice',
        label: `Brand Voice: ${profile.companyName} (${profile.toneLabel})`,
        properties: {
          clientId: lead.id,
          companyName: profile.companyName,
          toneArchetype: profile.toneArchetype,
          toneLabel: profile.toneLabel,
          signatureLexicon: profile.signatureLexicon,
          bannedTerms: profile.bannedTerms,
          vaultPath: profile.vaultPath
        }
      });

      graphDatabaseService.addEdge({
        id: `edge_${lead.id}_has_bv`,
        source: lead.id,
        target: profile.id,
        type: 'HAS_BRAND_VOICE',
        label: 'CONFIGURED_WITH'
      });
    } catch (err: any) {
      console.error('[BrandVoiceService Graph Error]', err.message);
    }
  }

  public getProfileByCompany(companyOrName: string): BrandVoiceProfile | undefined {
    const safe = companyOrName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase();
    return this.profiles.get(safe) || Array.from(this.profiles.values())[0];
  }

  public getAllProfiles(): BrandVoiceProfile[] {
    return Array.from(this.profiles.values());
  }
}

export const brandVoiceService = new BrandVoiceService();
