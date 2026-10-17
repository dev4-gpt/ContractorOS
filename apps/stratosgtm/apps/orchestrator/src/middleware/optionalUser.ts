import { Request, Response, NextFunction, RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import type { Workspace } from '../services/workspaceService';
import type { AuthedUser } from './requireUser';

export interface OptionalAuthedRequest extends Request {
  user?: AuthedUser;
  workspace?: Workspace;
}

export interface OptionalUserDeps {
  authBaseUrl: string | undefined;
  workspaces: { ensureForUser(authUserId: string): Promise<Workspace> };
  /** Injected in tests; defaults to Neon Auth's remote JWKS. */
  getKey?: JWTVerifyGetKey;
  /** When provided and it returns false, this middleware proceeds unauthenticated rather than resolving a workspace against unavailable storage. */
  storageReady?: () => boolean;
}

/**
 * Best-effort sibling to requireUser: resolves req.user/req.workspace from a
 * valid session JWT when one is present, and proceeds unauthenticated on any
 * failure — missing header, invalid/expired token, unreachable JWKS, or a
 * workspace lookup that throws. Used on routes that must keep working for
 * anonymous callers (voice token minting, console chat) but personalize
 * behavior when the caller happens to be signed in. Never rejects a request;
 * callers that need a hard auth gate should use requireUser instead.
 */
export function createOptionalUser(deps: OptionalUserDeps): RequestHandler {
  let remoteKeySet: JWTVerifyGetKey | null = null;

  let base: string | null = null;
  let origin: string | null = null;
  if (deps.authBaseUrl) {
    try {
      const trimmed = deps.authBaseUrl.replace(/\/+$/, '');
      origin = new URL(trimmed).origin;
      base = trimmed;
    } catch {
      base = null;
      origin = null;
    }
  }

  return async function optionalUser(req: Request, res: Response, next: NextFunction) {
    if (!base || !origin) return next();
    if (deps.storageReady && !deps.storageReady()) return next();

    const header = req.header('authorization') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) return next();

    const getKey = deps.getKey ?? (remoteKeySet ??= createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`)));

    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, getKey, { issuer: origin, audience: origin }));
    } catch {
      return next();
    }

    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!userId || !email) return next();

    try {
      const workspace = await deps.workspaces.ensureForUser(userId);
      const authed = req as OptionalAuthedRequest;
      authed.user = {
        userId,
        email,
        name: typeof payload.name === 'string' ? payload.name : null,
        image: typeof payload.image === 'string' ? payload.image : null
      };
      authed.workspace = workspace;
    } catch (err: any) {
      console.error('[optionalUser] Workspace resolution failed:', err?.name, err?.cause?.code ?? '');
    }
    next();
  };
}
