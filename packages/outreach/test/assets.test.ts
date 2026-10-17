import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { VaultMemoryStore } from '@reforge/core';
import { describe, expect, it } from 'vitest';
import { registerSite } from '../src/assets.js';
import { generateSite } from '../src/generate.js';
import { config, prospect } from './helpers.js';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'pp-'));
  const vault = join(dir, 'vault');
  return { dir, vault, store: new VaultMemoryStore(vault) };
}

describe('registerSite', () => {
  it('registers a generated site by hash and location, deduplicates, and keeps contact details out of memory', async () => {
    const { dir, vault, store } = setup();
    const p = prospect();
    const site = generateSite(p, config.sender, join(dir, 'out'));
    const a = await registerSite(store, p, site.dir);
    const b = await registerSite(store, p, site.dir);

    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ kind: 'web', tool: 'outreach', uri: `file:${path.resolve(site.dir)}` });
    expect(a.tags).toEqual([p.id, 'concept-site']);
    expect(a.source).toMatchObject({ url: 'https://www.brightelectrical.example/contact', authorized: true });

    const note = readFileSync(join(vault, a.path), 'utf8');
    expect(note).not.toContain('hello@brightelectrical.example');
    expect(note).not.toContain('555 010 1111');
  });

  it('creates a new asset when the page content changes', async () => {
    const { dir, store } = setup();
    const one = prospect();
    const two = prospect({ services: ['Rewiring', 'Lighting installation', 'EV chargers'] });
    const a = await registerSite(store, one, generateSite(one, config.sender, join(dir, 'out-a')).dir);
    const b = await registerSite(store, two, generateSite(two, config.sender, join(dir, 'out-b')).dir);
    expect(b.id).not.toBe(a.id);
  });

  it('takes the first URL from a multi-source note, and tolerates a source that is not a URL', async () => {
    const { dir, store } = setup();
    const multi = prospect({ sourceOfDetails: 'https://a.example/x ; https://b.example/y' });
    const a = await registerSite(store, multi, generateSite(multi, config.sender, join(dir, 'out-a')).dir);
    expect(a.source?.url).toBe('https://a.example/x');

    const text = prospect({ name: 'Other Electrical', website: 'https://other.example', email: undefined, phone: undefined, sourceOfDetails: 'seen on their van' });
    const b = await registerSite(store, text, generateSite(text, config.sender, join(dir, 'out-b')).dir);
    expect(b.source?.url).toBeUndefined();
    expect(b.source?.authorized).toBe(true);
  });

  it('links to a parent asset when given', async () => {
    const { dir, store } = setup();
    const brief = (await store.put({ kind: 'brief', title: 'Campaign brief', body: 'Local electricians', tool: 'user' })).asset;
    const p = prospect();
    const asset = await registerSite(store, p, generateSite(p, config.sender, join(dir, 'out')).dir, brief.id);
    expect((await store.lineage(asset.id)).map((x) => x.id)).toEqual([brief.id, asset.id]);
  });
});
