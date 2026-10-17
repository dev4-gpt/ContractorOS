import React from 'react';
import { Key, LogIn, LogOut } from 'lucide-react';
import type { useSession } from '../auth/useSession';

interface AccountMenuProps {
  session: ReturnType<typeof useSession>;
  onOpenKeys: () => void;
  isGlass: boolean;
}

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1';

/** Shows only the signed-in person's own account. Nothing about other users. */
export const AccountMenu: React.FC<AccountMenuProps> = ({ session, onOpenKeys, isGlass }) => {
  const { state } = session;
  const chip = `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-colors duration-200 cursor-pointer ${focus} ${
    isGlass ? 'bg-white/80 border-[#e2ded5] text-slate-700 hover:text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
  }`;

  if (state.status === 'unconfigured') return null;

  if (state.status === 'loading') {
    return (
      <span className={`${chip} cursor-default opacity-60`} aria-live="polite">
        Checking sign-in…
      </span>
    );
  }

  if (state.status === 'signed-out') {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className={chip} onClick={() => void session.signInWithGoogle()}>
          <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{session.error ? 'Try again' : 'Sign in with Google'}</span>
        </button>
        {session.error ? (
          <span role="alert" className={`text-xs ${isGlass ? 'text-rose-600' : 'text-rose-400'}`}>
            {session.error}
          </span>
        ) : null}
      </div>
    );
  }

  const label = state.user.name || state.user.email;
  return (
    <div className="flex items-center gap-2">
      <span className={`${chip} cursor-default`}>
        {state.user.image ? <img src={state.user.image} alt="" className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" /> : null}
        <span className="max-w-[10rem] truncate">{label}</span>
      </span>
      <button type="button" className={chip} onClick={onOpenKeys} aria-label="Your keys">
        <Key className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Keys</span>
      </button>
      <button type="button" className={chip} onClick={() => void session.signOut()} aria-label="Sign out">
        <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
