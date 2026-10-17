// apps/orchestrator/src/buyerlab/defaultRouter.ts
import { createRequireUser } from '../middleware/requireUser';
import { isDatabaseConfigured } from '../db/client';
import { drizzleBuyerLabStore } from '../db/repository/buyerlab';
import { PerUserRateLimiter } from '../services/keyTesters';
import { hasServerKeyAccess } from '../services/usageService';
import { workspaceService } from '../services/workspaceService';
import { createBuyerLabRouter } from '../routes/buyerlab';
import { resolveBuyerAccess } from './access';
import { crawl } from './crawler';
import { createBuyerLlm } from './llm';
import { NativeProvider } from './nativeProvider';

/**
 * The production Buyer Lab router, mounted at /api/buyerlab. A factory rather than a constant:
 * building it reads NEON_AUTH_BASE_URL, which must happen after index.ts has loaded .env.
 */
export function createDefaultBuyerLabRouter() {
  return createBuyerLabRouter({
    requireUser: createRequireUser({
      authBaseUrl: process.env.NEON_AUTH_BASE_URL,
      workspaces: workspaceService,
      storageReady: isDatabaseConfigured
    }),
    store: drizzleBuyerLabStore,
    access: (tenantId) => resolveBuyerAccess(tenantId),
    makeLlm: (apiKey) => createBuyerLlm(apiKey),
    // MiroFish arrives in sub-project 3; until then only Native exists and runs return 501 for it.
    makeProvider: (id, ctx) => (id === 'native' ? new NativeProvider({ store: drizzleBuyerLabStore, llm: ctx.llm, apiKey: ctx.apiKey }) : null),
    crawl,
    writeLimiter: new PerUserRateLimiter(10),
    pollLimiter: new PerUserRateLimiter(120),
    hasServerKeyAccess
  });
}
