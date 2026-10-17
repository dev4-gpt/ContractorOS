import { eq, and, sql, notExists } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '../client';
import { organizations, organizationMembers } from '../schema';
import type { Workspace, WorkspaceStore } from '../../services/workspaceService';

/**
 * Whether the owner has granted this workspace use of the server's API keys.
 * False for a missing row, so an unknown tenant never gets server-funded usage.
 */
export async function getServerKeyAccess(tenantId: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const rows = await getDb()
    .select({ access: organizations.serverKeyAccess })
    .from(organizations)
    .where(eq(organizations.id, tenantId))
    .limit(1);
  return rows[0]?.access === true;
}

/** Stable slug so the same company name always maps to the same tenant row. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100);
}

const tenantCache = new Map<string, string>();

/**
 * True when the given organizations.id has no row in organization_members —
 * i.e. it is not a signed-in workspace. Signed-in workspaces are private:
 * the legacy, unauthenticated company-name path (below) must never read,
 * resolve to, or write into one, no matter what name or slug a caller sends.
 */
export function isNotSignedInWorkspace() {
  return notExists(
    getDb()
      .select({ one: sql`1` })
      .from(organizationMembers)
      .where(eq(organizationMembers.tenantId, organizations.id))
  );
}

/**
 * Resolves a company name to a tenant id, creating the organization on first
 * sight. Real multi-tenant auth is deferred; until it lands this is how a
 * caller-supplied name becomes a row. Cached because it sits on the hot path of
 * every write.
 */
export async function resolveTenantId(companyName: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;

  const slug = slugify(companyName || 'default');
  const cached = tenantCache.get(slug);
  if (cached) return cached;

  const db = getDb();
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNotSignedInWorkspace()))
    .limit(1);

  if (existing.length) {
    tenantCache.set(slug, existing[0].id);
    return existing[0].id;
  }

  const inserted = await db
    .insert(organizations)
    .values({ name: companyName || 'Default', slug })
    .onConflictDoUpdate({
      target: organizations.slug,
      set: { updatedAt: new Date() },
      setWhere: isNotSignedInWorkspace()
    })
    .returning({ id: organizations.id });

  if (!inserted.length) {
    throw new Error(`resolveTenantId: slug "${slug}" collides with a signed-in workspace; refusing to use it.`);
  }

  tenantCache.set(slug, inserted[0].id);
  return inserted[0].id;
}

/**
 * Workspace membership over Postgres. Creation writes the organization and the
 * owner membership in one atomic batch (the Neon HTTP driver has no interactive
 * transactions). The organization never stores the user's name or email.
 */
export const drizzleWorkspaceStore: WorkspaceStore = {
  async findByUser(authUserId: string): Promise<Workspace | null> {
    const rows = await getDb()
      .select({ tenantId: organizationMembers.tenantId, role: organizationMembers.role })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.authUserId, authUserId), eq(organizationMembers.role, 'owner')))
      .limit(1);
    return rows[0] ?? null;
  },

  async create({ tenantId, slug, authUserId }): Promise<void> {
    const db = getDb();
    await db.batch([
      db.insert(organizations).values({ id: tenantId, name: 'Workspace', slug }),
      db.insert(organizationMembers).values({ tenantId, authUserId, role: 'owner' })
    ]);
  }
};
