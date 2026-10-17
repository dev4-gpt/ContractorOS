import { WorkspaceService, WorkspaceStore, Workspace, newWorkspaceSlug, isUniqueViolation } from '../services/workspaceService';

class MemoryStore implements WorkspaceStore {
  orgs: Array<{ tenantId: string; slug: string; name: string }> = [];
  members: Array<{ tenantId: string; authUserId: string; role: string }> = [];
  failNextCreateWith: unknown = null;

  async findByUser(authUserId: string): Promise<Workspace | null> {
    const m = this.members.find((x) => x.authUserId === authUserId && x.role === 'owner');
    return m ? { tenantId: m.tenantId, role: m.role } : null;
  }

  async create(input: { tenantId: string; slug: string; authUserId: string }): Promise<void> {
    if (this.failNextCreateWith) {
      const err = this.failNextCreateWith;
      this.failNextCreateWith = null;
      throw err;
    }
    if (this.members.some((x) => x.authUserId === input.authUserId && x.role === 'owner')) {
      throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    }
    this.orgs.push({ tenantId: input.tenantId, slug: input.slug, name: 'Workspace' });
    this.members.push({ tenantId: input.tenantId, authUserId: input.authUserId, role: 'owner' });
  }
}

describe('WorkspaceService', () => {
  it('creates exactly one workspace and owner membership on first sign-in', async () => {
    const store = new MemoryStore();
    const ws = await new WorkspaceService(store).ensureForUser('user-a');
    expect(ws.role).toBe('owner');
    expect(store.orgs).toHaveLength(1);
    expect(store.members).toEqual([{ tenantId: ws.tenantId, authUserId: 'user-a', role: 'owner' }]);
  });

  it('returns the same workspace on later calls without creating another', async () => {
    const store = new MemoryStore();
    const first = await new WorkspaceService(store).ensureForUser('user-a');
    const second = await new WorkspaceService(store).ensureForUser('user-a');
    expect(second.tenantId).toBe(first.tenantId);
    expect(store.orgs).toHaveLength(1);
  });

  it('gives different users different workspaces', async () => {
    const store = new MemoryStore();
    const service = new WorkspaceService(store);
    const a = await service.ensureForUser('user-a');
    const b = await service.ensureForUser('user-b');
    expect(a.tenantId).not.toBe(b.tenantId);
  });

  it('concurrent first calls for one user create one workspace', async () => {
    const store = new MemoryStore();
    const service = new WorkspaceService(store);
    const [x, y] = await Promise.all([service.ensureForUser('user-a'), service.ensureForUser('user-a')]);
    expect(x.tenantId).toBe(y.tenantId);
    expect(store.orgs).toHaveLength(1);
  });

  it('recovers when another instance created the workspace first', async () => {
    const store = new MemoryStore();
    store.members.push({ tenantId: 'existing-tenant', authUserId: 'user-a', role: 'owner' });
    store.findByUser = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ tenantId: 'existing-tenant', role: 'owner' });
    const ws = await new WorkspaceService(store).ensureForUser('user-a');
    expect(ws.tenantId).toBe('existing-tenant');
  });

  it('retries on a slug collision', async () => {
    const store = new MemoryStore();
    store.failNextCreateWith = Object.assign(new Error('duplicate key organizations_slug_idx'), { code: '23505' });
    const ws = await new WorkspaceService(store).ensureForUser('user-a');
    expect(ws.role).toBe('owner');
    expect(store.orgs).toHaveLength(1);
  });

  it('never stores the user name or email on the organization', async () => {
    const store = new MemoryStore();
    await new WorkspaceService(store).ensureForUser('user-a');
    expect(store.orgs[0].name).toBe('Workspace');
  });

  it('keeps the last error as the cause when creation keeps colliding', async () => {
    const store = new MemoryStore();
    const collision = Object.assign(new Error('duplicate key organizations_slug_idx'), { code: '23505' });
    store.create = jest.fn().mockRejectedValue(collision);
    store.findByUser = jest.fn().mockResolvedValue(null);
    await expect(new WorkspaceService(store).ensureForUser('user-a')).rejects.toMatchObject({
      message: 'Could not create a workspace after several attempts.',
      cause: collision
    });
    expect(store.create).toHaveBeenCalledTimes(3);
  });
});

describe('helpers', () => {
  it('newWorkspaceSlug is ws- plus 10 base36 chars', () => {
    for (let i = 0; i < 20; i++) expect(newWorkspaceSlug()).toMatch(/^ws-[0-9a-z]{10}$/);
  });

  it('isUniqueViolation detects Postgres 23505 directly, via cause, or by message', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint'))).toBe(true);
    expect(isUniqueViolation(new Error('connection refused'))).toBe(false);
  });
});
