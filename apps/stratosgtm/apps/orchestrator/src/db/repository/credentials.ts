import { eq, and } from 'drizzle-orm';
import type { PlatformCredentials } from '../../services/clientCredentialsService';
import { encryptJson, decryptJson, isEncryptionConfigured } from '../../services/cryptoService';
import { getDb, isDatabaseConfigured } from '../client';
import { organizations, platformCredentials } from '../schema';
import type { KeyStore, StoredKey } from '../../services/workspaceKeysService';
import { resolveTenantId, isNotSignedInWorkspace } from './tenant';

/**
 * Encrypts a credentials entry and builds the row shape shared by every write
 * path below (`upsertPlatformCredential`, `drizzleKeyStore.upsert`,
 * `drizzleKeyStore.replaceIfUnchanged`). Previously duplicated three times.
 */
function sealCredentials(entry: PlatformCredentials) {
  const sealed = encryptJson(entry);
  return {
    accountHandle: entry.accountHandle || null,
    autoPublishEnabled: Boolean(entry.autoPublishEnabled),
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    authTag: sealed.authTag,
    wrappedDek: sealed.wrappedDek,
    keyVersion: sealed.keyVersion,
    updatedAt: new Date()
  };
}

function assertEncryptionConfigured() {
  if (!isEncryptionConfigured()) {
    throw new Error('MASTER_KEY is not set; refusing to store credentials unencrypted.');
  }
}

// ---------------------------------------------------------------------------
// Legacy company-name-based credential storage
// ---------------------------------------------------------------------------

export async function upsertPlatformCredential(
  companyName: string,
  platform: string,
  entry: PlatformCredentials
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  assertEncryptionConfigured();

  const tenantId = await resolveTenantId(companyName);
  if (!tenantId) return;

  const row = sealCredentials(entry);
  await getDb()
    .insert(platformCredentials)
    .values({ tenantId, platform, ...row })
    .onConflictDoUpdate({
      target: [platformCredentials.tenantId, platformCredentials.platform],
      set: row
    });
}

export async function deletePlatformCredential(companyName: string, platform: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const tenantId = await resolveTenantId(companyName);
  if (!tenantId) return;
  await getDb()
    .delete(platformCredentials)
    .where(and(eq(platformCredentials.tenantId, tenantId), eq(platformCredentials.platform, platform)));
}

/**
 * Every stored credential, decrypted, with the owning company's name. A row that
 * fails to decrypt (wrong MASTER_KEY, tampered ciphertext) is skipped and logged
 * rather than crashing boot or being returned as garbage.
 *
 * Excludes signed-in workspaces (any tenant with an organization_members row).
 * The legacy in-memory store this feeds (clientCredentialsService.hydrate) keys
 * records by organizations.name, and every signed-in workspace org is named
 * literally 'Workspace' — without this filter, every workspace's BYOK keys
 * would be decrypted and merged into one shared record keyed 'workspace'.
 * Signed-in workspaces read their own keys exclusively through drizzleKeyStore
 * below, which is scoped by the tenant id resolved from a verified session.
 */
export async function listAllPlatformCredentials(): Promise<
  Array<{ tenantId: string; companyName: string; platform: string; entry: PlatformCredentials }>
> {
  if (!isDatabaseConfigured() || !isEncryptionConfigured()) return [];

  const rows = await getDb()
    .select({
      tenantId: platformCredentials.tenantId,
      platform: platformCredentials.platform,
      ciphertext: platformCredentials.ciphertext,
      iv: platformCredentials.iv,
      authTag: platformCredentials.authTag,
      wrappedDek: platformCredentials.wrappedDek,
      keyVersion: platformCredentials.keyVersion,
      companyName: organizations.name
    })
    .from(platformCredentials)
    .innerJoin(organizations, eq(platformCredentials.tenantId, organizations.id))
    .where(isNotSignedInWorkspace());

  const out: Array<{ tenantId: string; companyName: string; platform: string; entry: PlatformCredentials }> = [];
  for (const r of rows) {
    try {
      const entry = decryptJson<PlatformCredentials>(r);
      out.push({ tenantId: r.tenantId, companyName: r.companyName, platform: r.platform, entry });
    } catch (err: any) {
      console.error(`[Credentials] Could not decrypt ${r.platform} for tenant ${r.tenantId}; skipping.`, err?.name, err?.cause?.code ?? '');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tenant-scoped key storage for signed-in workspaces
// ---------------------------------------------------------------------------

/**
 * Tenant-scoped key storage for signed-in workspaces. Unlike the legacy
 * company-name functions above, every call takes the tenant id resolved from
 * the verified session, and nothing is loaded for other tenants.
 */
export const drizzleKeyStore: KeyStore = {
  async list(tenantId: string): Promise<StoredKey[]> {
    const rows = await getDb()
      .select({
        platform: platformCredentials.platform,
        ciphertext: platformCredentials.ciphertext,
        iv: platformCredentials.iv,
        authTag: platformCredentials.authTag,
        wrappedDek: platformCredentials.wrappedDek,
        keyVersion: platformCredentials.keyVersion,
        updatedAt: platformCredentials.updatedAt
      })
      .from(platformCredentials)
      .where(eq(platformCredentials.tenantId, tenantId));
    const out: StoredKey[] = [];
    for (const r of rows) {
      try {
        out.push({ platform: r.platform, entry: decryptJson<PlatformCredentials>(r), updatedAt: r.updatedAt });
      } catch (err: any) {
        console.error(`[Keys] Could not decrypt ${r.platform} for a workspace; skipping.`, err?.name, err?.cause?.code ?? '');
      }
    }
    return out;
  },

  async get(tenantId: string, platform: string): Promise<PlatformCredentials | null> {
    const rows = await getDb()
      .select({
        ciphertext: platformCredentials.ciphertext,
        iv: platformCredentials.iv,
        authTag: platformCredentials.authTag,
        wrappedDek: platformCredentials.wrappedDek,
        keyVersion: platformCredentials.keyVersion
      })
      .from(platformCredentials)
      .where(and(eq(platformCredentials.tenantId, tenantId), eq(platformCredentials.platform, platform)))
      .limit(1);
    if (!rows.length) return null;
    return decryptJson<PlatformCredentials>(rows[0]);
  },

  async upsert(tenantId: string, platform: string, entry: PlatformCredentials): Promise<void> {
    assertEncryptionConfigured();
    const row = sealCredentials(entry);
    await getDb()
      .insert(platformCredentials)
      .values({ tenantId, platform, ...row })
      .onConflictDoUpdate({ target: [platformCredentials.tenantId, platformCredentials.platform], set: row });
  },

  async remove(tenantId: string, platform: string): Promise<boolean> {
    const deleted = await getDb()
      .delete(platformCredentials)
      .where(and(eq(platformCredentials.tenantId, tenantId), eq(platformCredentials.platform, platform)))
      .returning({ id: platformCredentials.id });
    return deleted.length > 0;
  },

  /**
   * Compare-and-set write: only applies when the row's stored `updatedAt`
   * still equals `expectedUpdatedAt` (i.e. nothing has written to it since
   * the caller last read it). Returns false, without writing, when the row
   * changed or is gone.
   *
   * `updated_at` is `timestamptz` (schema.ts), which Postgres stores with
   * microsecond precision. The equality check below only ever holds because
   * every write to this table sets `updatedAt` explicitly from a JS `Date`
   * (millisecond precision, via `sealCredentials`) rather than letting the
   * column's `defaultNow()` fill it in. If a row's timestamp were ever set by
   * the DB default instead, it could carry sub-millisecond precision that a
   * JS `Date` can never equal, and this compare-and-set would always fail.
   */
  async replaceIfUnchanged(
    tenantId: string,
    platform: string,
    entry: PlatformCredentials,
    expectedUpdatedAt: Date
  ): Promise<boolean> {
    assertEncryptionConfigured();
    const row = sealCredentials(entry);
    const updated = await getDb()
      .update(platformCredentials)
      .set(row)
      .where(
        and(
          eq(platformCredentials.tenantId, tenantId),
          eq(platformCredentials.platform, platform),
          eq(platformCredentials.updatedAt, expectedUpdatedAt)
        )
      )
      .returning({ id: platformCredentials.id });
    return updated.length > 0;
  }
};
