import { workspaceKeysService } from '../services/workspaceKeysService';
import { hasServerKeyAccess } from '../services/usageService';

/** Neither the workspace's own DeepSeek key nor an owner grant of the server's keys. Maps to 402 KEY_REQUIRED. */
export class KeyRequiredError extends Error {
  constructor() {
    super('Add your own DeepSeek key in Keys to run Buyer Lab.');
    this.name = 'KeyRequiredError';
  }
}

export interface BuyerAccess {
  /** The caller's own key, or undefined to use the server key (only when granted). */
  apiKey?: string;
  fundedBy: 'byok' | 'server_grant';
}

export interface AccessDeps {
  getOwnKey(tenantId: string): Promise<string | null>;
  hasServerGrant(tenantId: string): Promise<boolean>;
}

export const defaultAccessDeps: AccessDeps = {
  async getOwnKey(tenantId) {
    try {
      const secrets = await workspaceKeysService.getSecrets(tenantId, 'deepseek');
      return secrets?.apiKey ?? null;
    } catch (err) {
      console.warn('[BuyerLab] Could not read the workspace key:', (err as { name?: string })?.name);
      return null;
    }
  },
  hasServerGrant: hasServerKeyAccess // fails closed
};

/** No free credits: own key, or an owner-granted server key, or refuse. */
export async function resolveBuyerAccess(tenantId: string, deps: AccessDeps = defaultAccessDeps): Promise<BuyerAccess> {
  let own: string | null = null;
  try {
    own = await deps.getOwnKey(tenantId);
  } catch {
    own = null;
  }
  if (own) return { apiKey: own, fundedBy: 'byok' };
  if (await deps.hasServerGrant(tenantId)) return { apiKey: undefined, fundedBy: 'server_grant' };
  throw new KeyRequiredError();
}
