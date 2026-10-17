/** Who is writing to the business. Every field the law or basic courtesy needs is required. */
export interface Sender {
  name: string;
  business?: string;
  email: string;
  phone?: string;
  /** A real postal address (a PO box is fine). Included in every message. */
  postalAddress: string;
  /** Where "no thanks" replies go. Defaults to `email`. */
  optOutEmail?: string;
}

export interface Offer {
  /** Stated plainly in the message, e.g. "$25 a month". Never left vague. */
  hostingPrice: string;
}

export interface Config {
  sender: Sender;
  offer: Offer;
}

/** Public facts about a business. Nothing here may be invented. */
export interface Prospect {
  id: string;
  name: string;
  website?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  region?: string;
  zip?: string;
  industry?: string;
  /** Only services the business itself lists. Never guessed. */
  services?: string[];
  /** Where these details were found (URL or description). Required, so every fact is traceable. */
  sourceOfDetails: string;
  accentColor?: string;
}

export type Status =
  | 'new'
  | 'site_generated'
  | 'ready_to_send'
  | 'sent'
  | 'replied'
  | 'lead_created'
  | 'do_not_contact';

export interface LedgerEvent {
  at: string;
  event: string;
}

export interface LedgerEntry {
  prospect: Prospect;
  status: Status;
  siteDir?: string;
  /** Memory asset id of the generated concept site, for lineage and attribution. */
  siteAssetId?: string;
  previewUrl?: string;
  sentAt?: string;
  repliedAt?: string;
  replyEmail?: string;
  history: LedgerEvent[];
}

export interface LedgerFile {
  version: 1;
  entries: Record<string, LedgerEntry>;
  /**
   * Legacy field from the standalone prospect-previews tool. The do-not-contact list now lives in the
   * shared Suppression list; `Ledger.importLegacyDoNotContact()` moves any old entries across.
   */
  doNotContact?: string[];
}
