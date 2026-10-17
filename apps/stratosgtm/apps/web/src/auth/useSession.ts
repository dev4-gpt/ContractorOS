import { useCallback, useEffect, useState } from 'react';
import { authClient, AuthLike } from './authClient';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export type SessionState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: SessionUser };

function resolveErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  if (typeof error === 'string' && error) return error;
  return 'Sign-in failed.';
}

export function useSession(client: AuthLike | null = authClient) {
  const [state, setState] = useState<SessionState>(client ? { status: 'loading' } : { status: 'unconfigured' });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const { data } = await client.getSession();
      const u = data?.user;
      setState(
        u
          ? { status: 'signed-in', user: { id: u.id, email: u.email, name: u.name ?? null, image: u.image ?? null } }
          : { status: 'signed-out' }
      );
    } catch {
      setState({ status: 'signed-out' });
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signInWithGoogle = useCallback(async () => {
    if (!client) return;
    setError(null);
    try {
      const result = await client.signIn.social({ provider: 'google', callbackURL: window.location.href });
      const resultError =
        result && typeof result === 'object' && 'error' in result ? (result as { error?: unknown }).error : undefined;
      if (resultError) setError(resolveErrorMessage(resultError));
    } catch (err) {
      setError(resolveErrorMessage(err));
    }
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.signOut();
    await refresh();
  }, [client, refresh]);

  return { state, signInWithGoogle, signOut, refresh, error };
}
