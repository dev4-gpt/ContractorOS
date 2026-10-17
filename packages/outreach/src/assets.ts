import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256Hex, type Asset, type MemoryStore } from '@reforge/core';
import type { Prospect } from './types.js';

function firstHttpUrl(text: string): string | undefined {
  for (const part of text.split(/\s*;\s*/)) {
    try {
      const url = new URL(part.trim());
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch {
      /* not a URL */
    }
  }
  return undefined;
}

/**
 * Registers a generated concept site in the shared memory so it has lineage and can be linked to
 * outreach later. Only the content hash and the folder location are stored: the page contains the
 * business's contact details, and those stay out of memory notes. Identical pages map to one asset.
 */
export async function registerSite(store: MemoryStore, prospect: Prospect, siteDir: string, parent?: string): Promise<Asset> {
  const html = await readFile(path.join(siteDir, 'index.html'), 'utf8');
  const url = firstHttpUrl(prospect.sourceOfDetails);
  const { asset } = await store.put({
    kind: 'web',
    title: `Concept site: ${prospect.name}`,
    sha256: sha256Hex(html),
    uri: `file:${path.resolve(siteDir)}`,
    tool: 'outreach',
    tags: [prospect.id, 'concept-site'],
    source: { authorized: true, license: 'details the business published publicly', ...(url ? { url } : {}) },
    ...(parent ? { parent } : {})
  });
  return asset;
}
