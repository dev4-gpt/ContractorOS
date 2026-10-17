import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

/**
 * Database handle.
 *
 * Initialised lazily because `neon()` throws when DATABASE_URL is missing, and
 * top-level module code runs at build time — an eager call would break the build
 * before the database is even provisioned.
 *
 * Deliberately a plain function, not a Proxy-wrapped singleton. Proxies around a
 * DB client intercept the property probing that adapter libraries do, which fails
 * silently and is miserable to debug.
 */

type Db = ReturnType<typeof createDb>;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Provision Postgres (vercel integration add neon) or set it in .env.'
    );
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

let cached: Db | null = null;

export function getDb(): Db {
  if (!cached) cached = createDb();
  return cached;
}

/**
 * Whether persistence is available. Callers use this to degrade honestly rather
 * than crash: without a database the app still runs, it just cannot remember
 * anything past a restart — and it should say so instead of pretending.
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
