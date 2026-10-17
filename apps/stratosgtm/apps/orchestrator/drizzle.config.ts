import type { Config } from 'drizzle-kit';

/**
 * drizzle-kit does not load .env itself, so run it with the env supplied:
 *   npx dotenv -e ../../.env -- npx drizzle-kit push
 * or export DATABASE_URL first. Running it without one fails with a confusing
 * connection error rather than a missing-variable message.
 */
export default {
  schema: ['./src/db/schema.ts', './src/db/schemaBuyerLab.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || ''
  },
  strict: true,
  verbose: true
} satisfies Config;
