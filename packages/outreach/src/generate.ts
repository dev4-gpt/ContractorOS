import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderSite, robotsTxt, vercelJson } from './template.js';
import type { Prospect, Sender } from './types.js';

export interface GeneratedSite {
  dir: string;
  files: string[];
}

/**
 * Writes a deployable static site into `<outRoot>/<prospect.id>/`. Also writes a manifest that records where
 * every fact came from, so a reviewer can trace the page back to public sources.
 */
export function generateSite(prospect: Prospect, sender: Sender, outRoot: string): GeneratedSite {
  const root = resolve(outRoot);
  const dir = resolve(root, prospect.id);
  if (!dir.startsWith(root + '/') && dir !== root) throw new Error('Refusing to write outside the output folder.');
  mkdirSync(dir, { recursive: true });

  const files: Record<string, string> = {
    'index.html': renderSite(prospect, sender),
    'robots.txt': robotsTxt(),
    'vercel.json': vercelJson(),
    'manifest.json':
      JSON.stringify(
        {
          prospectId: prospect.id,
          generatedAt: new Date().toISOString(),
          sourceOfDetails: prospect.sourceOfDetails,
          factsUsed: Object.keys(prospect).filter((k) => k !== 'id' && k !== 'sourceOfDetails')
        },
        null,
        2
      ) + '\n'
  };
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return { dir, files: Object.keys(files) };
}
