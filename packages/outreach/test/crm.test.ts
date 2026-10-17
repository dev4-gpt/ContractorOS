import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CrmError, postLead, toLeadPayload, type LeadPayload } from '../src/crm.js';
import { newLedger, prospect } from './helpers.js';

async function repliedEntry(over: Record<string, unknown> = {}, replyEmail?: string) {
  const { ledger: l } = newLedger();
  const p = prospect(over);
  await l.add(p);
  l.recordSite(p.id, '/x');
  await l.markReady(p.id, 'https://c.example');
  await l.markSent(p.id);
  return l.recordReply(p.id, replyEmail);
}

describe('toLeadPayload', () => {
  it('matches the StratosGTM create_or_update_lead tool', async () => {
    expect(toLeadPayload(await repliedEntry())).toEqual({
      name: 'create_or_update_lead',
      arguments: { fullName: 'Bright Electrical', email: 'hello@brightelectrical.example', phone: '+1 555 010 1111', source: 'outbound_campaign' }
    });
  });

  it('prefers the address the business replied from', async () => {
    expect(toLeadPayload(await repliedEntry({}, 'owner@x.example')).arguments.email).toBe('owner@x.example');
  });

  it('refuses a business that has not replied', async () => {
    const { ledger: l } = newLedger();
    const p = prospect();
    expect(toLeadPayload.bind(null, await l.add(p))).toThrow(/replied/);
  });

  it('needs an email address', async () => {
    const entry = await repliedEntry({ email: undefined });
    expect(() => toLeadPayload(entry)).toThrow(/email address/);
  });
});

describe('postLead', () => {
  let payload: LeadPayload;
  beforeAll(async () => {
    payload = toLeadPayload(await repliedEntry());
  });
  const ok = () => vi.fn(async () => new Response(JSON.stringify({ name: 'x' }), { status: 200 }));

  it('posts to a local server without any extra flag', async () => {
    const fetchImpl = ok();
    const res = await postLead(payload, 'http://localhost:4000/', { fetchImpl });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:4000/api/crm/tools/execute', expect.objectContaining({ method: 'POST' }));
  });

  it('refuses a remote server unless explicitly allowed', async () => {
    await expect(postLead(payload, 'https://crm.example', { fetchImpl: ok() })).rejects.toThrow(CrmError);
    await expect(postLead(payload, 'https://crm.example', { fetchImpl: ok(), allowRemote: true })).resolves.toMatchObject({ ok: true });
  });

  it('refuses plain http to a remote host', async () => {
    await expect(postLead(payload, 'http://crm.example', { fetchImpl: ok(), allowRemote: true })).rejects.toThrow(/https/);
  });
});
