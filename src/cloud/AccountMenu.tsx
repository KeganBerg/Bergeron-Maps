import { useState } from 'react';
import { supabase } from './client';
import type { Membership } from './session';

/**
 * Signs out of this device only (supabase-js signs out everywhere by default,
 * which would also end the sign-in on the person's phone or office computer),
 * and forgets which company and page this device last used, so the next
 * person on a shared computer starts fresh.
 */
export async function signOutHere() {
  await supabase?.auth.signOut({ scope: 'local' });
  try {
    localStorage.removeItem('bm.company');
    localStorage.removeItem('bm.returnTo');
  } catch {
    /* nothing stored */
  }
  window.location.replace(window.location.pathname);
}

/** Signed-in email, company switcher (for people in several companies) and sign out. */
export function AccountMenu({ email, memberships = [], current, onSwitch }: {
  email: string; memberships?: Membership[]; current?: Membership; onSwitch?: (companyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="account">
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="account-menu">
        {current ? current.companyName : email}
      </button>
      {open && (
        <div className="menu account-menu" role="menu">
          <p className="muted small">Signed in as<br /><strong>{email}</strong></p>
          {memberships.length > 1 && (
            <>
              <p className="muted small">Switch company</p>
              {memberships.map((m) => (
                <button key={m.companyId} role="menuitem" className={m.companyId === current?.companyId ? 'on' : ''}
                  onClick={() => { onSwitch?.(m.companyId); setOpen(false); }}>
                  {m.companyName}
                </button>
              ))}
            </>
          )}
          <button role="menuitem" onClick={() => void signOutHere()} data-testid="sign-out">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
