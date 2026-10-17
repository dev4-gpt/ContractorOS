import { desc } from 'drizzle-orm';
import type { CRMLead, ChurnRiskMember } from '@voice-os/shared';
import { getDb, isDatabaseConfigured } from '../client';
import { leads, churnMembers } from '../schema';
import { resolveTenantId } from './tenant';

/**
 * Tenant that owns records with no company of their own (churn members, leads
 * captured without a company name). Multi-tenant auth will replace this with the
 * authenticated organization; until then it is the operator's own org.
 */
const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME || 'Acme Coaching Co.';

/**
 * Parses to a Date only when the value genuinely is one. The app stores
 * scheduledCallTime as free text ("Tomorrow at 2:00 PM EST"); writing that into a
 * timestamptz column throws. The original string is preserved in `payload`.
 */
function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Upserts a lead. Queryable fields get columns; the complete record goes into
 * `payload` so every field round-trips, including ones without a column.
 */
export async function upsertLead(lead: CRMLead): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const tenantId = await resolveTenantId(lead.companyName || DEFAULT_TENANT_NAME);
  if (!tenantId) return;

  const row = {
    tenantId,
    fullName: lead.fullName,
    email: lead.email || null,
    phone: lead.phone || null,
    companyName: lead.companyName || null,
    source: lead.source || null,
    status: lead.status,
    qualificationScore: lead.qualificationScore ?? 0,
    scheduledCallTime: toDateOrNull(lead.scheduledCallTime),
    notes: lead.notes || [],
    payload: lead as unknown as Record<string, unknown>,
    createdAt: toDateOrNull(lead.createdAt) || new Date(),
    updatedAt: toDateOrNull(lead.updatedAt) || new Date()
  };

  await getDb()
    .insert(leads)
    .values({ id: lead.id, ...row })
    .onConflictDoUpdate({ target: leads.id, set: row });
}

/** Every lead, newest first, reconstructed from the lossless payload. */
export async function listAllLeads(): Promise<CRMLead[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDb().select().from(leads).orderBy(desc(leads.updatedAt));
  return rows
    .map((r) => r.payload as unknown as CRMLead | null)
    .filter((l): l is CRMLead => Boolean(l && l.id));
}

export async function upsertMember(member: ChurnRiskMember): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const tenantId = await resolveTenantId(DEFAULT_TENANT_NAME);
  if (!tenantId) return;

  const row = {
    tenantId,
    fullName: member.fullName,
    email: member.email || null,
    tier: member.tier || null,
    monthlyValueCents: Math.round((member.monthlyFee || 0) * 100),
    riskLevel: member.requiresManagerReview ? 'high' : 'low',
    status: member.status,
    payload: member as unknown as Record<string, unknown>,
    updatedAt: new Date()
  };

  await getDb()
    .insert(churnMembers)
    .values({ id: member.memberId, ...row })
    .onConflictDoUpdate({ target: churnMembers.id, set: row });
}

export async function listAllMembers(): Promise<ChurnRiskMember[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDb().select().from(churnMembers);
  return rows
    .map((r) => r.payload as unknown as ChurnRiskMember | null)
    .filter((m): m is ChurnRiskMember => Boolean(m && m.memberId));
}
