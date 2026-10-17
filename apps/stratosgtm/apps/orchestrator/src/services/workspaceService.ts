import { randomBytes, randomUUID } from 'crypto';
import { drizzleWorkspaceStore } from '../db/repository';

export interface Workspace {
  tenantId: string;
  role: string;
}

export interface WorkspaceStore {
  findByUser(authUserId: string): Promise<Workspace | null>;
  create(input: { tenantId: string; slug: string; authUserId: string }): Promise<void>;
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Opaque slug: never derived from the user's name or email. */
export function newWorkspaceSlug(): string {
  return 'ws-' + Array.from(randomBytes(10), (b) => BASE36[b % 36]).join('');
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string } | null;
  if (!e) return false;
  return e.code === '23505' || e.cause?.code === '23505' || /duplicate key/i.test(e.message || '');
}

const MAX_CREATE_ATTEMPTS = 3;

/**
 * Resolves the caller's private workspace, creating it on first sign-in.
 * Cached per process; concurrent first calls for the same user share one promise.
 */
export class WorkspaceService {
  private cache = new Map<string, Workspace>();
  private inflight = new Map<string, Promise<Workspace>>();

  constructor(private readonly store: WorkspaceStore) {}

  public async ensureForUser(authUserId: string): Promise<Workspace> {
    const cached = this.cache.get(authUserId);
    if (cached) return cached;
    const pending = this.inflight.get(authUserId);
    if (pending) return pending;

    const work = this.resolve(authUserId).finally(() => this.inflight.delete(authUserId));
    this.inflight.set(authUserId, work);
    return work;
  }

  private async resolve(authUserId: string): Promise<Workspace> {
    const existing = await this.store.findByUser(authUserId);
    if (existing) return this.remember(authUserId, existing);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
      const tenantId = randomUUID();
      try {
        await this.store.create({ tenantId, slug: newWorkspaceSlug(), authUserId });
        return this.remember(authUserId, { tenantId, role: 'owner' });
      } catch (err) {
        lastError = err;
        if (!isUniqueViolation(err)) throw err;
        // Either another instance created this user's workspace first, or the
        // random slug collided. Prefer the existing workspace; otherwise retry.
        const raced = await this.store.findByUser(authUserId);
        if (raced) return this.remember(authUserId, raced);
      }
    }
    throw new Error('Could not create a workspace after several attempts.', { cause: lastError });
  }

  private remember(authUserId: string, ws: Workspace): Workspace {
    this.cache.set(authUserId, ws);
    return ws;
  }
}

export const workspaceService = new WorkspaceService(drizzleWorkspaceStore);
