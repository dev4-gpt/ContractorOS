import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountMenu } from './AccountMenu';

const base = {
  signInWithGoogle: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  error: null
};

describe('AccountMenu', () => {
  it('renders nothing when sign-in is unconfigured', () => {
    const { container } = render(<AccountMenu session={{ ...base, state: { status: 'unconfigured' } }} onOpenKeys={vi.fn()} isGlass={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Google sign-in when signed out', () => {
    const signInWithGoogle = vi.fn(async () => undefined);
    render(<AccountMenu session={{ ...base, signInWithGoogle, state: { status: 'signed-out' } }} onOpenKeys={vi.fn()} isGlass={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(signInWithGoogle).toHaveBeenCalled();
  });

  it('shows the error and a Try again button when sign-in failed', () => {
    render(
      <AccountMenu
        session={{ ...base, state: { status: 'signed-out' }, error: 'Access blocked' }}
        onOpenKeys={vi.fn()}
        isGlass={false}
      />
    );
    expect(screen.getByRole('alert').textContent).toBe('Access blocked');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it("shows only the signed-in user's own name, Keys and Sign out", () => {
    const signOut = vi.fn(async () => undefined);
    const onOpenKeys = vi.fn();
    render(
      <AccountMenu
        session={{ ...base, signOut, state: { status: 'signed-in', user: { id: 'u1', email: 'a@example.com', name: 'Ana', image: null } } }}
        onOpenKeys={onOpenKeys}
        isGlass={false}
      />
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Your keys' }));
    expect(onOpenKeys).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
  });
});
