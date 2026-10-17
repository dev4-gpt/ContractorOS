import { authClient, AuthLike } from './authClient';
import { apiUrl } from '../config/api';

export class SignedOutError extends Error {
  constructor(message = 'Sign in required.') {
    super(message);
    this.name = 'SignedOutError';
  }
}

/** Fetch an `/api/me/*` route as the signed-in user; retries once on 401 with a fresh token. */
export async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  client: AuthLike | null = authClient
): Promise<Response> {
  if (!client) throw new SignedOutError('Sign-in is not configured.');

  const send = async () => {
    const { data } = await client.token();
    const token = data?.token;
    if (!token) throw new SignedOutError();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(apiUrl(path), { ...init, headers });
  };

  const first = await send();
  return first.status === 401 ? send() : first;
}

/**
 * Fetch a route that must always work for anonymous callers, attaching a
 * bearer token when one happens to be available. Unlike authorizedFetch,
 * never throws SignedOutError and never retries — any failure to get a
 * token (signed out, no client, or the token call itself failing) just
 * means the request goes out without an Authorization header, exactly as
 * it always has for anonymous callers.
 */
export async function bestEffortAuthFetch(
  path: string,
  init: RequestInit = {},
  client: AuthLike | null = authClient
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (client) {
    try {
      const { data } = await client.token();
      if (data?.token) headers.set('Authorization', `Bearer ${data.token}`);
    } catch {
      // No token available — proceed anonymously, same as a signed-out caller.
    }
  }
  return fetch(apiUrl(path), { ...init, headers });
}
