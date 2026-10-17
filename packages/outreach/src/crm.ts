import type { LedgerEntry } from './types.js';

export class CrmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmError';
  }
}

/** The shape StratosGTM's `create_or_update_lead` voice-agent tool accepts. */
export interface LeadPayload {
  name: 'create_or_update_lead';
  arguments: {
    fullName: string;
    email: string;
    phone?: string;
    source: 'outbound_campaign';
  };
}

/**
 * A prospect becomes a lead only after they reply. A cold business that never answered is not a lead, and
 * some CRM boards are visible to anyone, so unsolicited contacts must not be published there.
 */
export function toLeadPayload(entry: LedgerEntry): LeadPayload {
  if (entry.status !== 'replied') {
    throw new CrmError(`Only businesses that have replied can become leads (this one is ${entry.status}).`);
  }
  const email = entry.replyEmail ?? entry.prospect.email;
  if (!email) throw new CrmError('A lead needs an email address. Record one with --email when logging the reply.');
  const args: LeadPayload['arguments'] = { fullName: entry.prospect.name, email, source: 'outbound_campaign' };
  if (entry.prospect.phone) args.phone = entry.prospect.phone;
  return { name: 'create_or_update_lead', arguments: args };
}

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export interface PostResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Sends the payload to a StratosGTM server. Remote servers need an explicit opt-in. */
export async function postLead(
  payload: LeadPayload,
  baseUrl: string,
  opts: { allowRemote?: boolean; fetchImpl?: typeof fetch } = {}
): Promise<PostResult> {
  const base = baseUrl.replace(/\/+$/, '');
  const isLocal = LOCAL.test(base);
  if (!isLocal && !/^https:\/\/[^\s/]+$/.test(base)) throw new CrmError('The CRM URL must be https, or localhost for development.');
  if (!isLocal && !opts.allowRemote) {
    throw new CrmError('Refusing to post to a remote CRM without --allow-remote. Check who can read that CRM first.');
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${base}/api/crm/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}
