import { eq, desc } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../client';
import { consentRecords } from '../schema';

export interface ConsentRow {
  id: string;
  sessionId: string;
  companyName: string;
  region: string;
  consentRequirement: string;
  consentMethod: string;
  disclosureText: string;
  disclosedAt: Date;
  consentGrantedAt: Date | null;
  userAgent: string;
}

/** Consent evidence is insert-only; there is no update path by design. */
export async function insertConsent(tenantId: string, row: ConsentRow): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const db = getDb();
  await db.insert(consentRecords).values({ tenantId, ...row }).onConflictDoNothing();
}

export async function listConsent(tenantId: string, limit = 200) {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  return db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.tenantId, tenantId))
    .orderBy(desc(consentRecords.createdAt))
    .limit(limit);
}
