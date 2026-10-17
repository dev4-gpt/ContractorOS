import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Suppression, suppressionFile } from '@reforge/core';
import { describe, expect, it } from 'vitest';
import { Ledger, LedgerError } from '../src/ledger.js';
import { newLedger, prospect } from './helpers.js';

const url = 'https://concept.example';

async function toSent(l: Ledger, id: string) {
  l.recordSite(id, '/tmp/site');
  await l.markReady(id, url);
  await l.markSent(id);
}

describe('Ledger', () => {
  it('rejects the same business twice, however it is matched', async () => {
    const { ledger: l } = newLedger();
    await l.add(prospect());
    await expect(l.add(prospect({ name: 'Bright Electrical LLC' }))).rejects.toThrow(/Already tracked/);
    await expect(
      l.add(prospect({ name: 'Other', website: undefined, email: undefined, phone: '(555) 010-1111' })),
    ).rejects.toThrow(LedgerError);
  });

  it('allows a message to be recorded only once', async () => {
    const { ledger: l } = newLedger();
    const p = prospect();
    await l.add(p);
    await toSent(l, p.id);
    await expect(l.markSent(p.id)).rejects.toThrow(/already been recorded/);
  });

  it('will not mark a message sent before a preview link exists', async () => {
    const { ledger: l } = newLedger();
    const p = prospect();
    await l.add(p);
    await expect(l.markSent(p.id)).rejects.toThrow(/Cannot go from new to sent/);
    l.recordSite(p.id, '/tmp/site');
    await expect(l.markReady(p.id, 'http://insecure.example')).rejects.toThrow(/https/);
  });

  it('keeps an opted-out business blocked for good, across ids, and refuses to add it again', async () => {
    const { ledger: l } = newLedger();
    const p = prospect();
    await l.add(p);
    l.recordSite(p.id, '/tmp/site');
    await l.optOut('brightelectrical.example');
    expect(l.get(p.id).status).toBe('do_not_contact');
    await expect(l.markReady(p.id, url)).rejects.toThrow(/do-not-contact/);
    await expect(l.add(prospect({ name: 'Bright Electrical Again' }))).rejects.toThrow(/do-not-contact/);
  });

  it('opts out by email or phone too', async () => {
    const { ledger: l } = newLedger();
    await l.add(prospect());
    await l.optOut('HELLO@brightelectrical.example');
    expect(l.list()[0]?.status).toBe('do_not_contact');
  });

  it('persists to disk and reloads', async () => {
    const { dir, suppression, ledger: a } = newLedger();
    const p = prospect();
    await a.add(p);
    await a.optOut(p.id);
    const b = new Ledger(join(dir, 'ledger.json'), suppression);
    expect(b.get(p.id).status).toBe('do_not_contact');
    expect(await b.isBlocked(p)).toBe(true);
  });

  it('walks the whole happy path to a lead', async () => {
    const { ledger: l } = newLedger();
    const p = prospect();
    await l.add(p);
    await toSent(l, p.id);
    l.recordReply(p.id, 'owner@brightelectrical.example');
    l.markLeadCreated(p.id);
    expect(l.get(p.id).status).toBe('lead_created');
    expect(l.get(p.id).history.length).toBeGreaterThan(4);
  });
});

describe('Ledger with the shared do-not-contact list', () => {
  it('refuses to record a send if another sender opted the business out in the meantime', async () => {
    const { suppression, ledger: l } = newLedger();
    const p = prospect();
    await l.add(p);
    l.recordSite(p.id, '/tmp/site');
    await l.markReady(p.id, url);
    // e.g. the email engine auto-suppressed a "STOP" reply
    await suppression.addContact({ email: 'hello@brightelectrical.example' });
    await expect(l.markSent(p.id)).rejects.toThrow(/do-not-contact/);
    expect(l.get(p.id).status).toBe('do_not_contact');
    expect(l.get(p.id).sentAt).toBeUndefined();
  });

  it('matches a phone number across formats and refuses a later add', async () => {
    const { dir, ledger: l } = newLedger();
    await l.optOut('555.010.1111');
    await expect(l.add(prospect())).rejects.toThrow(/do-not-contact/);
    const text = readFileSync(suppressionFile(dir), 'utf8');
    expect(text).not.toContain('5550101111');
  });

  it('stores hashes only, never the business details', async () => {
    const { dir, ledger: l } = newLedger();
    const p = prospect();
    await l.add(p);
    await l.optOut(p.id);
    const text = readFileSync(suppressionFile(dir), 'utf8');
    expect(text).not.toContain('brightelectrical');
    expect(text).not.toContain('hello@');
    expect(text.match(/^- (domain|email|phone):[0-9a-f]{64} \|/gm)).toHaveLength(3);
  });

  it('moves a legacy do-not-contact list into the shared list once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pp-'));
    const path = join(dir, 'ledger.json');
    writeFileSync(
      path,
      JSON.stringify({ version: 1, entries: {}, doNotContact: ['domain:legacy.example', 'email:x@y.example', 'phone:5550109999'] }),
    );
    const suppression = new Suppression(suppressionFile(dir));
    const l = new Ledger(path, suppression);
    expect(await l.importLegacyDoNotContact()).toBe(3);
    expect(await l.importLegacyDoNotContact()).toBe(0);
    expect((await suppression.check({ website: 'legacy.example' })).blocked).toBe(true);
    expect((await suppression.check({ email: 'x@y.example' })).blocked).toBe(true);
    expect((await suppression.check({ phone: '(555) 010-9999' })).blocked).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')).doNotContact).toBeUndefined();
  });
});
