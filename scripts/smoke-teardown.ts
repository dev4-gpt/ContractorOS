/**
 * Real competitor teardown of one public page.
 *
 *   npx tsx scripts/smoke-teardown.ts <https-url> ["basis"]
 *
 * Fetches the page politely (robots.txt honored, private addresses refused), audits it, and prints the research
 * note that would be written to shared memory. It writes only to a temp folder that is deleted at the end.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VaultMemoryStore } from "../packages/core/src/index.ts";
import { PoliteFetcher, teardownSite } from "../packages/research/src/index.ts";

async function main() {
  const [url, basis = "public marketing page, robots.txt respected, analysis only"] = process.argv.slice(2);
  if (!url) {
    console.error('usage: npx tsx scripts/smoke-teardown.ts <https-url> ["basis"]');
    process.exit(2);
  }
  const scratch = await mkdtemp(path.join(os.tmpdir(), "reforge-smoke-teardown-"));
  let failed = false;
  try {
    const store = new VaultMemoryStore(path.join(scratch, "vault"));
    const started = Date.now();
    const result = await teardownSite(store, new PoliteFetcher(), { url, basis });
    const note = (await store.read(result.asset.id))!;
    console.log(`fetched and analysed in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
    console.log(note.body.trim());
    console.log(`\nasset: ${result.asset.id}  source.authorized=${result.asset.source?.authorized}  license(basis)="${result.asset.source?.license}"`);
    console.log(`score ${result.audit.score}/100, ${result.ctas.length} call(s) to action, ${result.pricing.length} pricing mention(s)`);
  } catch (error) {
    console.error("FAIL ", error instanceof Error ? `${error.name}: ${error.message}` : error);
    failed = true;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

main();
