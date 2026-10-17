import { resolveBuyerAccess, KeyRequiredError, AccessDeps } from '../../buyerlab/access';

const deps = (own: string | null, grant: boolean): AccessDeps & { grant: jest.Mock } => {
  const grantFn = jest.fn().mockResolvedValue(grant);
  return { getOwnKey: async () => own, hasServerGrant: grantFn, grant: grantFn };
};

describe('resolveBuyerAccess (no free credits)', () => {
  it('uses the workspace\'s own key and never asks about the server grant', async () => {
    const d = deps('own-key', true);
    expect(await resolveBuyerAccess('t', d)).toEqual({ apiKey: 'own-key', fundedBy: 'byok' });
    expect(d.grant).not.toHaveBeenCalled();
  });

  it('uses the server key only for a granted workspace with no key of its own', async () => {
    expect(await resolveBuyerAccess('t', deps(null, true))).toEqual({ apiKey: undefined, fundedBy: 'server_grant' });
  });

  it('refuses with KEY_REQUIRED when there is neither a key nor a grant', async () => {
    await expect(resolveBuyerAccess('t', deps(null, false))).rejects.toBeInstanceOf(KeyRequiredError);
  });

  it('treats a failing key lookup as "no own key", then falls to the grant check', async () => {
    const d: AccessDeps = { getOwnKey: async () => { throw new Error('storage down'); }, hasServerGrant: async () => false };
    await expect(resolveBuyerAccess('t', d)).rejects.toBeInstanceOf(KeyRequiredError);
  });
});
