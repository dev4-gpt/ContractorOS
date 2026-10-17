import * as fs from 'fs';
import * as path from 'path';
import { resolveTenantId, insertConsent } from '../db/repository';

/**
 * US disclosure and recording-consent policy for the voice agent.
 *
 * This is a good-faith engineering implementation of published statutes, not
 * legal advice, and it is deliberately conservative. Two separate obligations
 * are modelled, because they are separate laws:
 *
 *  1. AI disclosure — the visitor must be told they are speaking with an AI.
 *     CA AB 2905 requires it before any substantive exchange; TX SB 140 within
 *     the first 30 seconds; CO and UT require it for consumer-facing AI.
 *
 *  2. Recording / transcription consent — a live transcript can be treated as
 *     interception. In all-party-consent states every participant must agree
 *     before capture begins, so those states get an explicit opt-in gate rather
 *     than a notice.
 *
 * A visitor's state is not reliably knowable from a browser, so callers that
 * cannot determine one get the strictest policy. Under-disclosing is a statutory
 * penalty; over-disclosing costs one sentence.
 */

export type ConsentRequirement = 'disclosure_only' | 'explicit_opt_in';

export interface CompliancePolicy {
  region: string;
  regionName: string;
  aiDisclosureRequired: boolean;
  consentRequirement: ConsentRequirement;
  /** Spoken before any substantive exchange. */
  disclosureText: string;
  /** Null means "before any substantive exchange" rather than a clock. */
  mustDiscloseWithinSeconds: number | null;
  citations: string[];
}

export interface ConsentRecord {
  id: string;
  sessionId: string;
  companyName: string;
  region: string;
  consentRequirement: ConsentRequirement;
  consentMethod: 'explicit_opt_in' | 'disclosure_acknowledged' | 'not_required';
  disclosureText: string;
  disclosedAt: string;
  consentGrantedAt: string | null;
  userAgent: string;
  createdAt: string;
}

/**
 * States requiring all-party consent to record or intercept a communication.
 * Michigan is included deliberately: its statute is unsettled, so it is treated
 * as all-party.
 */
const ALL_PARTY_CONSENT_STATES: Record<string, string> = {
  CA: 'California',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  IL: 'Illinois',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MT: 'Montana',
  NV: 'Nevada',
  NH: 'New Hampshire',
  PA: 'Pennsylvania',
  WA: 'Washington'
};

/** States with an explicit statutory deadline for disclosing synthetic voice. */
const DISCLOSURE_DEADLINE_SECONDS: Record<string, number> = {
  TX: 30
};

const STATE_CITATIONS: Record<string, string[]> = {
  CA: [
    'Cal. AB 2905 (AI voice disclosure)',
    'Cal. B&P Code 17941 / SB 1001 (bot disclosure)',
    'Cal. Penal Code 632 / 637.2 (all-party consent)'
  ],
  TX: ['Tex. SB 140 (AI voice disclosure within 30 seconds)', 'Tex. HB 149 / TRAIGA (AI interaction disclosure)'],
  CO: ['Colo. SB 24-205 (consumer-facing AI disclosure)'],
  UT: ['Utah AI Policy Act (disclosure on request; proactive for regulated occupations)'],
  IL: ['740 ILCS 14 (BIPA — voiceprint)', '720 ILCS 5/14-2 (all-party consent)'],
  FL: ['Fla. Stat. 934.03 (all-party consent)'],
  WA: ['Wash. Rev. Code 9.73.030 (all-party consent)'],
  PA: ['18 Pa. C.S. 5703 (all-party consent)'],
  MA: ['Mass. Gen. Laws ch. 272 s.99 (all-party consent)']
};

const BASE_AI_DISCLOSURE = "Before we start — I'm an AI assistant, not a human.";

const TRANSCRIPTION_NOTICE = 'This call is transcribed so your request can be handled accurately.';

const OPT_IN_REQUEST = 'Please confirm you agree to continue on a recorded and transcribed call.';

export class ComplianceService {
  private vaultBasePath: string;
  private consentLog: ConsentRecord[] = [];
  private pendingWrites = new Set<Promise<void>>();

  constructor() {
    this.vaultBasePath = path.resolve(process.cwd(), 'vault');
  }

  /**
   * Resolves policy for a US state code. Anything unrecognised — including an
   * unknown location, which is the common case in a browser — gets all-party
   * treatment.
   */
  public getPolicy(stateCode?: string | null): CompliancePolicy {
    const code = (stateCode || '').trim().toUpperCase().replace(/^US-/, '');
    const isKnownState = /^[A-Z]{2}$/.test(code);
    const isAllParty = !isKnownState || code in ALL_PARTY_CONSENT_STATES;

    const regionName = isKnownState ? ALL_PARTY_CONSENT_STATES[code] || code : 'Unknown location';

    const consentRequirement: ConsentRequirement = isAllParty ? 'explicit_opt_in' : 'disclosure_only';

    const disclosureText =
      consentRequirement === 'explicit_opt_in'
        ? `${BASE_AI_DISCLOSURE} ${TRANSCRIPTION_NOTICE} ${OPT_IN_REQUEST}`
        : `${BASE_AI_DISCLOSURE} ${TRANSCRIPTION_NOTICE}`;

    return {
      region: isKnownState ? `US-${code}` : 'US-UNKNOWN',
      regionName,
      aiDisclosureRequired: true,
      consentRequirement,
      disclosureText,
      mustDiscloseWithinSeconds: DISCLOSURE_DEADLINE_SECONDS[code] ?? null,
      citations: STATE_CITATIONS[code] || [
        'Applied the strictest US posture because the visitor location is unknown or unmapped.'
      ]
    };
  }

  /**
   * Prepends the disclosure to an agent greeting so it is spoken first. Returns
   * the greeting unchanged if it already opens with the disclosure, so repeated
   * calls cannot stack it.
   */
  public applyDisclosureToGreeting(greeting: string, policy: CompliancePolicy): string {
    const trimmed = (greeting || '').trim();
    if (trimmed.startsWith(policy.disclosureText)) return trimmed;
    return `${policy.disclosureText} ${trimmed}`.trim();
  }

  /** True when the session may capture audio given what consent has been given. */
  public mayCapture(policy: CompliancePolicy, consentGranted: boolean): boolean {
    if (policy.consentRequirement === 'explicit_opt_in') return consentGranted;
    return true;
  }

  public recordConsent(params: {
    sessionId: string;
    companyName: string;
    stateCode?: string | null;
    consentGranted: boolean;
    userAgent?: string;
  }): ConsentRecord {
    const policy = this.getPolicy(params.stateCode);
    const now = new Date().toISOString();

    const method: ConsentRecord['consentMethod'] =
      policy.consentRequirement === 'explicit_opt_in'
        ? 'explicit_opt_in'
        : params.consentGranted
        ? 'disclosure_acknowledged'
        : 'not_required';

    const record: ConsentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: params.sessionId,
      companyName: params.companyName,
      region: policy.region,
      consentRequirement: policy.consentRequirement,
      consentMethod: method,
      disclosureText: policy.disclosureText,
      disclosedAt: now,
      consentGrantedAt: params.consentGranted ? now : null,
      userAgent: (params.userAgent || '').slice(0, 300),
      createdAt: now
    };

    this.consentLog.push(record);
    this.appendToVault(record);

    // Persist to Postgres. This record is the evidence produced if a regulator
    // or plaintiff asks whether the visitor was told and agreed; in-memory and a
    // local markdown file are not an audit trail for a deployed service.
    //
    // Tracked, and the route awaits flush() before responding. An earlier version
    // fired this and forgot it to avoid delaying call start — but on a serverless
    // host the function can be frozen the moment the response is sent, so an
    // unawaited insert may simply never happen. A few milliseconds of latency is
    // the right price for evidence that actually exists.
    const write = this.persistConsent(record).catch((err) =>
      console.error('[Compliance] Failed to persist consent record', record.id, err?.message || err)
    );
    this.pendingWrites.add(write);
    void write.finally(() => this.pendingWrites.delete(write));

    return record;
  }

  /** Waits for every in-flight consent write to settle. */
  public async flush(): Promise<void> {
    await Promise.allSettled(Array.from(this.pendingWrites));
  }

  private async persistConsent(record: ConsentRecord): Promise<void> {
    const tenantId = await resolveTenantId(record.companyName);
    if (!tenantId) {
      console.warn(
        `[Compliance] No database configured — consent ${record.id} exists only in memory and the vault file.`
      );
      return;
    }
    await insertConsent(tenantId, {
      id: record.id,
      sessionId: record.sessionId,
      companyName: record.companyName,
      region: record.region,
      consentRequirement: record.consentRequirement,
      consentMethod: record.consentMethod,
      disclosureText: record.disclosureText,
      disclosedAt: new Date(record.disclosedAt),
      consentGrantedAt: record.consentGrantedAt ? new Date(record.consentGrantedAt) : null,
      userAgent: record.userAgent
    });
  }

  public getConsentLog(companyName?: string): ConsentRecord[] {
    const all = [...this.consentLog].reverse();
    if (!companyName) return all;
    return all.filter((r) => r.companyName === companyName);
  }

  /**
   * Append-only vault mirror. Consent evidence is what you produce if a regulator
   * or plaintiff asks, so entries are appended and never rewritten.
   */
  private appendToVault(record: ConsentRecord): void {
    try {
      const dir = path.join(this.vaultBasePath, 'Compliance');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'ConsentLog.md');

      const entry = [
        '',
        `### ${record.id}`,
        `* **Session:** \`${record.sessionId}\``,
        `* **Company:** ${record.companyName}`,
        `* **Region:** ${record.region} (${record.consentRequirement})`,
        `* **Method:** ${record.consentMethod}`,
        `* **Disclosed at:** ${record.disclosedAt}`,
        `* **Consent granted at:** ${record.consentGrantedAt || 'not granted'}`,
        `* **Disclosure spoken:** "${record.disclosureText}"`,
        ''
      ].join('\n');

      if (!fs.existsSync(file)) {
        fs.writeFileSync(
          file,
          '# Consent & AI Disclosure Log\n\nAppend-only record of AI disclosure and recording consent for voice sessions.\n' +
            entry,
          'utf-8'
        );
      } else {
        fs.appendFileSync(file, entry, 'utf-8');
      }
    } catch (err: any) {
      // Never fail a call because the audit mirror could not be written; the
      // in-memory record still exists and the error is surfaced in logs.
      console.error('[Compliance Vault Write Error]', err.message);
    }
  }
}

export const complianceService = new ComplianceService();
