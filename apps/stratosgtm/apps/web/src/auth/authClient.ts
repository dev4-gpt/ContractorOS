export interface AuthLike {
  getSession(): Promise<{
    data: { user?: { id: string; email: string; name?: string | null; image?: string | null } | null; session?: unknown } | null;
    error: unknown;
  }>;
  signIn: { social(o: { provider: 'google'; callbackURL: string }): Promise<unknown> };
  signOut(): Promise<unknown>;
  token(): Promise<{ data: { token?: string } | null; error: unknown }>;
}

const baseUrl = (import.meta.env.VITE_NEON_AUTH_URL || '').trim();

/**
 * Hand-rolled Neon Auth (Better Auth) client, calling the auth endpoints
 * directly instead of going through `@neondatabase/neon-js`'s
 * `createAuthClient` + `BetterAuthVanillaAdapter`. That vendor wrapper does
 * not reliably work in this deployment: every method we tried —
 * `getSession()`, `token()`, `signOut()`, `signIn.social()` — silently
 * resolved as a no-op (no network request at all, not even an attempt) even
 * with a valid session cookie present, confirmed by comparing each against a
 * direct fetch of the same endpoint, which succeeds every time. `credentials:
 * 'include'` on every call lets the cross-origin auth domain's session
 * cookie ride along. Null when the URL is unset: the console then hides
 * sign-in instead of failing.
 */
async function fetchToken(): Promise<{ data: { token?: string } | null; error: unknown }> {
  try {
    const res = await fetch(`${baseUrl}/token`, { credentials: 'include' });
    if (!res.ok) return { data: null, error: { status: res.status } };
    return { data: await res.json(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

const SESSION_VERIFIER_PARAM = 'neon_auth_session_verifier';

/**
 * After the OAuth redirect back from Google, Better Auth appends a one-time
 * `neon_auth_session_verifier` query param to the page URL — it must be
 * forwarded onto this exact `get-session` request (not just present on the
 * page) to actually complete the cross-domain session handshake and set the
 * session cookie. Once used, strip it from the page URL so it isn't reused.
 */
async function fetchSession(): ReturnType<AuthLike['getSession']> {
  try {
    const url = new URL(`${baseUrl}/get-session`);
    const pageUrl = new URL(window.location.href);
    const verifier = pageUrl.searchParams.get(SESSION_VERIFIER_PARAM);
    if (verifier) url.searchParams.set(SESSION_VERIFIER_PARAM, verifier);

    const res = await fetch(url.toString(), { credentials: 'include' });
    if (!res.ok) return { data: null, error: { status: res.status } };
    const body = await res.json();

    if (verifier && body?.user) {
      pageUrl.searchParams.delete(SESSION_VERIFIER_PARAM);
      history.replaceState(history.state, '', pageUrl.href);
    }

    return { data: body && (body.user || body.session) ? body : null, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Better Auth's `/sign-out` requires `Content-Type: application/json` even with an empty body. */
async function fetchSignOut(): Promise<unknown> {
  try {
    const res = await fetch(`${baseUrl}/sign-out`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    return { data: res.ok, error: res.ok ? null : { status: res.status } };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * `/sign-in/social` responds `{ url, redirect: true }` rather than doing the
 * redirect itself — the caller is expected to navigate to `url`.
 */
async function fetchSignInSocial(opts: { provider: 'google'; callbackURL: string }): Promise<unknown> {
  try {
    const res = await fetch(`${baseUrl}/sign-in/social`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts)
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: body ?? { message: `Sign-in failed (${res.status}).` } };
    if (body?.url) {
      window.location.href = body.url;
      return { data: body };
    }
    return { error: { message: 'Sign-in did not return a redirect URL.' } };
  } catch (error) {
    return { error };
  }
}

export const authClient: AuthLike | null = baseUrl
  ? {
      getSession: fetchSession,
      signIn: { social: fetchSignInSocial },
      signOut: fetchSignOut,
      token: fetchToken
    }
  : null;
