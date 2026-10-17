#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Suppression, VaultMemoryStore, suppressionFile } from '@reforge/core';
import { registerSite } from './assets.js';
import { CrmError, postLead, toLeadPayload } from './crm.js';
import { FetchError, RobotsDisallowedError, fetchPublicDetails } from './fetchDetails.js';
import { UnsafeHostError } from './netguard.js';
import { generateSite } from './generate.js';
import { Ledger, LedgerError } from './ledger.js';
import { composeOutreach, MessageError } from './message.js';
import { ValidationError, validateProspect } from './validate.js';
import type { Config } from './types.js';

const HELP = `outreach (assisted mode: nothing is ever sent for you)

  fetch <website> [--out FILE]        read a business's own public pages (robots.txt honored) into a DRAFT prospect to review
  add <prospect.json>                 add a business (rejects duplicates and do-not-contact matches)
  generate <id> [--out DIR]           build the labeled concept site in DIR/<id> (default ./out)
  message <id> --url HTTPS_URL        write the outreach message for the hosted preview (default folder ./runs)
  sent <id>                           record that YOU sent the message (once per business)
  reply <id> [--email ADDRESS]        record that the business replied
  optout <id|domain|email|phone>      never contact this business again (shared list, every sender honors it)
  lead <id> [--send --base-url URL]   turn a business that replied into a StratosGTM lead (dry run unless --send)
  import-legacy                       move an old prospect-previews do-not-contact list into the shared list
  list                                show every business and its status

Options: --config FILE (default ./config.json)  --ledger FILE (default ./data/ledger.json)  --allow-remote
         --vault DIR   shared memory folder (or set REFORGE_VAULT): uses the shared do-not-contact list and
                       registers generated sites in memory. Without it the list is ./data/Suppression.md.
The message is written to a file for you to review and send yourself.`;

function flags(argv: string[]): { positional: string[]; opts: Record<string, string | true> } {
  const positional: string[] = [];
  const opts: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    } else positional.push(a);
  }
  return { positional, opts };
}

function str(v: string | true | undefined, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function loadConfig(path: string): Config {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Config;
  } catch {
    throw new Error(`Could not read ${path}. Copy config.example.json to config.json and fill it in.`);
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help') {
    console.log(HELP);
    return 0;
  }
  const { positional, opts } = flags(rest);
  const vault = typeof opts.vault === 'string' ? opts.vault : process.env.REFORGE_VAULT;
  const suppression = new Suppression(vault ? suppressionFile(vault) : './data/Suppression.md');
  const store = vault ? new VaultMemoryStore(vault) : null;
  const ledger = new Ledger(str(opts.ledger, './data/ledger.json'), suppression);
  const arg = positional[0];
  const need = (): string => {
    if (!arg) throw new Error(`"${command}" needs an argument. Run with --help.`);
    return arg;
  };

  switch (command) {
    case 'fetch': {
      const details = await fetchPublicDetails(need());
      const json = JSON.stringify(details.draft, null, 2) + '\n';
      if (typeof opts.out === 'string') {
        writeFileSync(opts.out, json);
        console.log(`Draft written to ${opts.out}`);
      } else {
        process.stdout.write(json);
      }
      console.error(`\nPages read: ${details.pagesUsed.join(', ') || 'none'}\n- ${details.notes.join('\n- ')}\n\nThis is only a draft. Fix anything wrong, then run: add <file>`);
      return 0;
    }
    case 'add': {
      const prospect = validateProspect(JSON.parse(readFileSync(need(), 'utf8')));
      await ledger.add(prospect);
      console.log(`Added ${prospect.id}`);
      return 0;
    }
    case 'generate': {
      const config = loadConfig(str(opts.config, './config.json'));
      const entry = ledger.get(need());
      const site = generateSite(entry.prospect, config.sender, str(opts.out, './out'));
      const asset = store ? await registerSite(store, entry.prospect, site.dir) : undefined;
      ledger.recordSite(entry.prospect.id, site.dir, asset?.id);
      console.log(`Site written to ${site.dir}${asset ? ` (memory asset ${asset.id})` : ''}\nHost it publicly, then run: message ${entry.prospect.id} --url <https link>`);
      return 0;
    }
    case 'message': {
      const config = loadConfig(str(opts.config, './config.json'));
      const url = opts.url;
      if (typeof url !== 'string') throw new Error('Give the hosted preview address with --url https://...');
      const entry = ledger.get(need());
      if (await ledger.isBlocked(entry.prospect)) throw new LedgerError('This business is on the do-not-contact list.', 'blocked');
      const out = composeOutreach({ prospect: entry.prospect, sender: config.sender, offer: config.offer, previewUrl: url });
      await ledger.markReady(entry.prospect.id, url);
      const dir = join('./runs', entry.prospect.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'outreach.txt'), `Subject: ${out.subject}\n\n${out.body}\n`);
      console.log(`Subject: ${out.subject}\n\n${out.body}\n\nSaved to ${join(dir, 'outreach.txt')}. Review it, send it yourself, then run: sent ${entry.prospect.id}`);
      return 0;
    }
    case 'sent': {
      await ledger.markSent(need());
      console.log('Recorded. No follow-up message will be prepared for this business.');
      return 0;
    }
    case 'reply': {
      const email = typeof opts.email === 'string' ? opts.email : undefined;
      ledger.recordReply(need(), email);
      console.log('Recorded the reply.');
      return 0;
    }
    case 'optout': {
      const ids = await ledger.optOut(need());
      console.log(`Will never contact: ${ids.join(', ')}`);
      return 0;
    }
    case 'import-legacy': {
      const added = await ledger.importLegacyDoNotContact();
      console.log(`Moved ${added} entr${added === 1 ? 'y' : 'ies'} into the shared do-not-contact list.`);
      return 0;
    }
    case 'lead': {
      const entry = ledger.get(need());
      const payload = toLeadPayload(entry);
      if (opts.send !== true) {
        console.log('Dry run. This is what would be sent to StratosGTM:\n' + JSON.stringify(payload, null, 2));
        return 0;
      }
      const baseUrl = str(opts['base-url'], process.env.STRATOS_URL ?? 'http://localhost:4000');
      const result = await postLead(payload, baseUrl, { allowRemote: opts['allow-remote'] === true });
      if (!result.ok) throw new CrmError(`The CRM answered ${result.status}: ${JSON.stringify(result.body)}`);
      ledger.markLeadCreated(entry.prospect.id);
      console.log('Lead created in StratosGTM.');
      return 0;
    }
    case 'list': {
      for (const e of ledger.list()) console.log(`${e.prospect.id}\t${e.status}\t${e.prospect.name}`);
      return 0;
    }
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    const known =
      err instanceof ValidationError || err instanceof LedgerError || err instanceof MessageError || err instanceof CrmError ||
      err instanceof FetchError || err instanceof RobotsDisallowedError || err instanceof UnsafeHostError;
    console.error(known || err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
);
