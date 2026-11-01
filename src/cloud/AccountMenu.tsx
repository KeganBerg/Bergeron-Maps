import { useState } from 'react';
import { supabase } from './client';
import type { Membership } from './session';

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
          <button role="menuitem" onClick={() => void supabase?.auth.signOut().then(() => window.location.replace(window.location.pathname))} data-testid="sign-out">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
