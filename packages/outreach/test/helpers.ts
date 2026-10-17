import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Suppression, suppressionFile } from '@reforge/core';
import { Ledger } from '../src/ledger.js';
import type { Config, Prospect } from '../src/types.js';
import { validateProspect } from '../src/validate.js';

/** A ledger in a fresh temp folder, wired to a shared do-not-contact list in the same folder. */
export function newLedger(dir = mkdtempSync(join(tmpdir(), 'pp-'))) {
  const suppression = new Suppression(suppressionFile(dir));
  return { dir, suppression, ledger: new Ledger(join(dir, 'ledger.json'), suppression) };
}

export const config: Config = {
  sender: {
    name: 'Sam Example',
    business: 'Example Web Studio',
    email: 'sam@example.com',
    phone: '+1 555 010 0000',
    postalAddress: 'PO Box 1, Springfield, ST 00000, United States'
  },
  offer: { hostingPrice: '$25 a month' }
};

export function prospect(overrides: Record<string, unknown> = {}): Prospect {
  return validateProspect({
    name: 'Bright Electrical',
    website: 'https://www.brightelectrical.example',
    email: 'hello@brightelectrical.example',
    phone: '+1 555 010 1111',
    city: 'Springfield',
    region: 'ST',
    industry: 'Electrician',
    services: ['Rewiring', 'Lighting installation'],
    sourceOfDetails: 'https://www.brightelectrical.example/contact',
    ...overrides
  });
}
