import { Router, Request, Response, RequestHandler } from 'express';
import type { AuthedRequest } from '../middleware/requireUser';
import {
  WorkspaceKeysService,
  BYOK_PLATFORMS,
  isByokPlatform,
  KeyValidationError,
  KeyStorageUnconfiguredError,
  ByokPlatform
} from '../services/workspaceKeysService';
import { testKey as defaultTestKey, PerUserRateLimiter } from '../services/keyTesters';
import * as defaultTryPost from '../services/tryPostService';
import { tryPostBaseUrl } from '../services/tryPostService';
import { publishViaTryPost, TryPostClient } from '../services/tryPostPublishing';

interface MeRouterDeps {
  requireUser: RequestHandler;
  keys: WorkspaceKeysService;
  testKey: typeof defaultTestKey;
  limiter: PerUserRateLimiter;
  /** Separate budget for publishing; defaults to 10/min per user. */
  publishLimiter?: PerUserRateLimiter;
  tryPost?: TryPostClient;
}

const MAX_POST_LENGTH = 10000;
const MAX_ACCOUNTS = 5;

const ALLOWED_PLATFORMS = Object.keys(BYOK_PLATFORMS);

/** Every route acts only on the workspace requireUser resolved from the token. */
export function createMeRouter(deps: MeRouterDeps): Router {
  const router = Router();
  router.use(deps.requireUser);
  const tryPost: TryPostClient = deps.tryPost ?? defaultTryPost;
  const publishLimiter = deps.publishLimiter ?? new PerUserRateLimiter();

  /** The caller's own TryPost token, or a response already sent (null). */
  const tryPostTokenOr4xx = async (req: Request, res: Response): Promise<string | null> => {
    if (!tryPostBaseUrl()) {
      res.status(503).json({ error: 'TryPost is not configured on this server.', code: 'TRYPOST_UNCONFIGURED' });
      return null;
    }
    const secrets = await deps.keys.getSecrets((req as AuthedRequest).workspace.tenantId, 'trypost');
    if (!secrets?.apiToken) {
      res.status(409).json({ error: 'Save your TryPost API token in Keys first.', code: 'TRYPOST_NOT_CONNECTED' });
      return null;
    }
    return secrets.apiToken;
  };

  const handleError = (res: Response, err: unknown) => {
    if (err instanceof KeyValidationError) {
      return res.status(400).json({ error: err.message, allowedFields: err.allowedFields });
    }
    if (err instanceof KeyStorageUnconfiguredError) {
      return res.status(503).json({ error: err.message, code: 'KEY_STORAGE_UNCONFIGURED' });
    }
    // Log only a safe summary — never err.message. Drizzle's DrizzleQueryError
    // message includes query params (the Google user id; ciphertext/wrappedDek
    // on writes), which must never reach logs.
    const e = err as { name?: string; cause?: { code?: string } };
    console.error('[/api/me] Unexpected error:', e?.name, e?.cause?.code ?? '');
    return res.status(500).json({ error: 'Something went wrong.' });
  };

  const platformOr400 = (req: Request, res: Response): ByokPlatform | null => {
    const { platform } = req.params;
    if (!isByokPlatform(platform)) {
      res.status(400).json({ error: 'Unsupported platform.', allowedPlatforms: ALLOWED_PLATFORMS });
      return null;
    }
    return platform;
  };

  router.get('/', (req: Request, res: Response) => {
    const { user, workspace } = req as AuthedRequest;
    res.json({ user: { email: user.email, name: user.name, image: user.image }, workspace: { role: workspace.role } });
  });

  router.get('/credentials', async (req: Request, res: Response) => {
    try {
      res.json({ credentials: await deps.keys.list((req as AuthedRequest).workspace.tenantId) });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.put('/credentials/:platform', async (req: Request, res: Response) => {
    const platform = platformOr400(req, res);
    if (!platform) return;
    try {
      res.json(await deps.keys.save((req as AuthedRequest).workspace.tenantId, platform, req.body));
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/credentials/:platform/test', async (req: Request, res: Response) => {
    const platform = platformOr400(req, res);
    if (!platform) return;
    const { user, workspace } = req as AuthedRequest;
    if (!deps.limiter.allow(user.userId)) {
      return res.status(429).json({ error: 'Too many key tests. Wait a minute and try again.' });
    }
    try {
      const secrets = await deps.keys.getSecrets(workspace.tenantId, platform);
      if (!secrets) return res.status(404).json({ error: 'No key saved for this platform.' });
      const result = await deps.testKey(platform, secrets);
      if (platform === 'twitter') {
        return res.json({ ...result, testedAt: new Date().toISOString() });
      }
      const recorded = await deps.keys.recordTest(workspace.tenantId, platform, result.ok);
      res.json({ ok: result.ok, message: result.message, testedAt: recorded.testedAt });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.delete('/credentials/:platform', async (req: Request, res: Response) => {
    const platform = platformOr400(req, res);
    if (!platform) return;
    try {
      const removed = await deps.keys.remove((req as AuthedRequest).workspace.tenantId, platform);
      if (!removed) return res.status(404).json({ error: 'No key saved for this platform.' });
      res.json({ status: 'deleted' });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/trypost/accounts', async (req: Request, res: Response) => {
    try {
      const token = await tryPostTokenOr4xx(req, res);
      if (!token) return;
      const out = await tryPost.listAccounts(token);
      if (!out.ok) {
        return res.status(502).json({ error: 'Could not load accounts from TryPost.', code: 'TRYPOST_UPSTREAM', reason: out.reason });
      }
      res.json({ accounts: out.accounts });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/publish', async (req: Request, res: Response) => {
    const { text, accountIds } = (req.body ?? {}) as { text?: unknown; accountIds?: unknown };
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText || cleanText.length > MAX_POST_LENGTH) {
      return res.status(400).json({ error: `"text" must be 1-${MAX_POST_LENGTH} characters.` });
    }
    if (
      !Array.isArray(accountIds) ||
      accountIds.length < 1 ||
      accountIds.length > MAX_ACCOUNTS ||
      !accountIds.every((a) => typeof a === 'string' && a.length > 0 && a.length <= 100)
    ) {
      return res.status(400).json({ error: `"accountIds" must be 1-${MAX_ACCOUNTS} account ids.` });
    }
    try {
      const token = await tryPostTokenOr4xx(req, res);
      if (!token) return;
      // Spend the rate-limit slot only once config/token checks pass.
      if (!publishLimiter.allow((req as AuthedRequest).user.userId)) {
        return res.status(429).json({ error: 'Too many publish requests. Wait a minute and try again.' });
      }
      const accounts = await tryPost.listAccounts(token);
      if (!accounts.ok) {
        return res.status(502).json({ error: 'Could not load accounts from TryPost.', code: 'TRYPOST_UPSTREAM', reason: accounts.reason });
      }
      const receipts = await publishViaTryPost(
        tryPost,
        token,
        cleanText,
        [...new Set(accountIds as string[])],
        process.env.ENABLE_REAL_PUBLISHING === 'true',
        accounts.accounts
      );
      res.json({ receipts });
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}
