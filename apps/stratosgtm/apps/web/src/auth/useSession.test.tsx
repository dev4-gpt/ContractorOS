import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSession } from './useSession';
import type { AuthLike } from './authClient';

function client(user: { id: string; email: string; name?: string | null; image?: string | null } | null) {
  return {
    getSession: vi.fn(async () => ({ data: user ? { user, session: {} } : null, error: null })),
    signIn: { social: vi.fn(async (): Promise<unknown> => undefined) },
    signOut: vi.fn(async () => undefined),
    token: vi.fn()
  };
}

describe('useSession', () => {
  it('reports unconfigured without a client', () => {
    const { result } = renderHook(() => useSession(null));
    expect(result.current.state).toEqual({ status: 'unconfigured' });
  });

  it('resolves a signed-in user from the session', async () => {
    const c = client({ id: 'u1', email: 'a@example.com', name: 'A', image: null });
    const { result } = renderHook(() => useSession(c as unknown as AuthLike));
    await waitFor(() => expect(result.current.state.status).toBe('signed-in'));
    expect(result.current.state).toEqual({ status: 'signed-in', user: { id: 'u1', email: 'a@example.com', name: 'A', image: null } });
  });

  it('resolves signed-out when there is no session', async () => {
    const c = client(null);
    const { result } = renderHook(() => useSession(c as unknown as AuthLike));
    await waitFor(() => expect(result.current.state.status).toBe('signed-out'));
  });

  it('starts Google sign-in back to the current page', async () => {
    const c = client(null);
    const { result } = renderHook(() => useSession(c as unknown as AuthLike));
    await act(() => result.current.signInWithGoogle());
    expect(c.signIn.social).toHaveBeenCalledWith({ provider: 'google', callbackURL: window.location.href });
  });

  it('sets an error message when sign-in resolves with an error', async () => {
    const c = client(null);
    c.signIn.social.mockResolvedValue({ data: null, error: { message: 'Access blocked' } });
    const { result } = renderHook(() => useSession(c as unknown as AuthLike));
    expect(result.current.error).toBeNull();
    await act(() => result.current.signInWithGoogle());
    expect(result.current.error).toBe('Access blocked');
  });

  it('sets a generic error message when sign-in throws', async () => {
    const c = client(null);
    c.signIn.social.mockRejectedValue(new Error());
    const { result } = renderHook(() => useSession(c as unknown as AuthLike));
    await act(() => result.current.signInWithGoogle());
    expect(result.current.error).toBe('Sign-in failed.');
  });

  it('clears a previous error at the start of a new sign-in attempt', async () => {
    const c = client(null);
    c.signIn.social.mockResolvedValueOnce({ data: null, error: { message: 'Access blocked' } });
    const { result } = renderHook(() => useSession(c as unknown as AuthLike));
    await act(() => result.current.signInWithGoogle());
    expect(result.current.error).toBe('Access blocked');
    c.signIn.social.mockResolvedValueOnce(undefined);
    await act(() => result.current.signInWithGoogle());
    expect(result.current.error).toBeNull();
  });

  it('signs out and returns to signed-out', async () => {
    const c = client({ id: 'u1', email: 'a@example.com' });
    const { result } = renderHook(() => useSession(c as unknown as AuthLike));
    await waitFor(() => expect(result.current.state.status).toBe('signed-in'));
    c.getSession.mockResolvedValue({ data: null, error: null });
    await act(() => result.current.signOut());
    expect(c.signOut).toHaveBeenCalled();
    expect(result.current.state.status).toBe('signed-out');
  });
});
