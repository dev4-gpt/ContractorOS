import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Suppression, SuppressionType } from '@reforge/core';
import { identitiesOf, identityFromInput } from './identity.js';
import type { LedgerEntry, LedgerFile, Prospect, Status } from './types.js';

export class LedgerError extends Error {
  constructor(message: string, public readonly code: 'duplicate' | 'blocked' | 'not_found' | 'bad_transition' | 'bad_input') {
    super(message);
    this.name = 'LedgerError';
  }
}

const ALLOWED: Record<Status, Status[]> = {
  new: ['site_generated'],
  site_generated: ['ready_to_send', 'site_generated'],
  ready_to_send: ['sent', 'site_generated', 'ready_to_send'],
  sent: ['replied'],
  replied: ['lead_created'],
  lead_created: [],
  do_not_contact: []
};

const now = () => new Date().toISOString();

type Contact = Pick<Prospect, 'website' | 'email' | 'phone'>;

function toCandidate(p: Contact) {
  return {
    ...(p.email ? { email: p.email } : {}),
    ...(p.website ? { website: p.website } : {}),
    ...(p.phone ? { phone: p.phone } : {})
  };
}

/**
 * A small JSON-file ledger: one contact per business and strict status transitions.
 * The do-not-contact list is the shared Suppression list, so an opt-out recorded by any sender
 * (this tool, the email engine, the voice agent) blocks every other one. It is checked again
 * at the two steps closest to sending, so a business that opts out in the meantime cannot be messaged.
 */
export class Ledger {
  private data: LedgerFile;

  constructor(
    private readonly path: string,
    private readonly suppression: Suppression
  ) {
    this.data = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as LedgerFile)
      : { version: 1, entries: {} };
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n');
    renameSync(tmp, this.path);
  }

  private require(id: string): LedgerEntry {
    const entry = this.data.entries[id];
    if (!entry) throw new LedgerError(`No prospect with id ${id}`, 'not_found');
    return entry;
  }

  private log(entry: LedgerEntry, event: string): void {
    entry.history.push({ at: now(), event });
  }

  private move(entry: LedgerEntry, to: Status): void {
    if (entry.status === 'do_not_contact') throw new LedgerError('This business is on the do-not-contact list.', 'blocked');
    if (!ALLOWED[entry.status].includes(to)) {
      throw new LedgerError(`Cannot go from ${entry.status} to ${to}.`, 'bad_transition');
    }
    entry.status = to;
  }

  /** Re-checks the shared list; if the business has opted out meanwhile, records it and refuses. */
  private async assertNotBlocked(entry: LedgerEntry): Promise<void> {
    if (entry.status !== 'do_not_contact' && (await this.isBlocked(entry.prospect))) {
      entry.status = 'do_not_contact';
      this.log(entry, 'opted out');
      this.save();
    }
    if (entry.status === 'do_not_contact') throw new LedgerError('This business is on the do-not-contact list.', 'blocked');
  }

  async isBlocked(p: Contact): Promise<boolean> {
    const candidate = toCandidate(p);
    if (Object.keys(candidate).length === 0) return false;
    return (await this.suppression.check(candidate)).blocked;
  }

  async add(prospect: Prospect): Promise<LedgerEntry> {
    if (await this.isBlocked(prospect)) throw new LedgerError('This business is on the do-not-contact list.', 'blocked');
    const mine = new Set(identitiesOf(prospect));
    for (const existing of Object.values(this.data.entries)) {
      if (identitiesOf(existing.prospect).some((i) => mine.has(i))) {
        throw new LedgerError(`Already tracked as ${existing.prospect.id}.`, 'duplicate');
      }
    }
    const entry: LedgerEntry = { prospect, status: 'new', history: [] };
    this.log(entry, 'added');
    this.data.entries[prospect.id] = entry;
    this.save();
    return entry;
  }

  get(id: string): LedgerEntry {
    return this.require(id);
  }

  list(): LedgerEntry[] {
    return Object.values(this.data.entries);
  }

  recordSite(id: string, siteDir: string, siteAssetId?: string): LedgerEntry {
    const e = this.require(id);
    this.move(e, 'site_generated');
    e.siteDir = siteDir;
    if (siteAssetId) e.siteAssetId = siteAssetId;
    this.log(e, 'site generated');
    this.save();
    return e;
  }

  async markReady(id: string, previewUrl: string): Promise<LedgerEntry> {
    if (!/^https:\/\/[^\s]+$/.test(previewUrl)) throw new LedgerError('The preview link must be a public https URL.', 'bad_input');
    const e = this.require(id);
    await this.assertNotBlocked(e);
    this.move(e, 'ready_to_send');
    e.previewUrl = previewUrl;
    this.log(e, 'message prepared');
    this.save();
    return e;
  }

  /** Records that a person has sent the prepared message. Only ever once per business. */
  async markSent(id: string): Promise<LedgerEntry> {
    const e = this.require(id);
    if (e.status === 'sent' || e.sentAt) throw new LedgerError('A message has already been recorded for this business.', 'bad_transition');
    await this.assertNotBlocked(e);
    this.move(e, 'sent');
    e.sentAt = now();
    this.log(e, 'message sent');
    this.save();
    return e;
  }

  recordReply(id: string, replyEmail?: string): LedgerEntry {
    const e = this.require(id);
    this.move(e, 'replied');
    e.repliedAt = now();
    if (replyEmail) e.replyEmail = replyEmail;
    this.log(e, 'replied');
    this.save();
    return e;
  }

  markLeadCreated(id: string): LedgerEntry {
    const e = this.require(id);
    this.move(e, 'lead_created');
    this.log(e, 'handed to the CRM');
    this.save();
    return e;
  }

  /**
   * Puts a business (by id, domain, email or phone) on the shared do-not-contact list for good, and marks
   * every tracked business it matches. Returns the identities that were listed, for display.
   */
  async optOut(idOrIdentity: string): Promise<string[]> {
    const entry = this.data.entries[idOrIdentity];
    const identities = entry ? identitiesOf(entry.prospect) : [identityFromInput(idOrIdentity)].filter((v): v is string => Boolean(v));
    if (identities.length === 0) throw new LedgerError('Give a prospect id, a domain, an email address or a phone number.', 'bad_input');
    for (const identity of identities) {
      const split = identity.indexOf(':');
      await this.suppression.add(identity.slice(0, split) as SuppressionType, identity.slice(split + 1));
    }
    for (const e of Object.values(this.data.entries)) {
      if (e.status !== 'do_not_contact' && (await this.isBlocked(e.prospect))) {
        e.status = 'do_not_contact';
        this.log(e, 'opted out');
      }
    }
    this.save();
    return identities;
  }

  /** Moves a do-not-contact list kept by the old standalone tool into the shared list. Returns how many were new. */
  async importLegacyDoNotContact(): Promise<number> {
    const legacy = this.data.doNotContact ?? [];
    let added = 0;
    for (const identity of legacy) {
      const split = identity.indexOf(':');
      if (split < 0) continue;
      if (await this.suppression.add(identity.slice(0, split) as SuppressionType, identity.slice(split + 1), 'imported')) added += 1;
    }
    delete this.data.doNotContact;
    this.save();
    return added;
  }
}
