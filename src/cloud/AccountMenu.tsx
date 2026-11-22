import { useState } from 'react';
import { navigate } from '../router';
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

/**
 * Signed-in email, company switcher (for people in several companies) and sign out.
 * The button is labeled "Company" so its name isn't mistaken for a site name
 * (people often name both alike, such as "Test Company 1" and "Test Site 1").
 */
export function AccountMenu({ email, memberships = [], current, onSwitch }: {
  email: string; memberships?: Membership[]; current?: Membership; onSwitch?: (companyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="account">
      <button className="btn account-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" data-testid="account-menu">
        <span className="account-text">
          {current && <span className="account-kind">Company</span>}
          <span className="account-name">{current ? current.companyName : email}</span>
        </span>
        <svg className="account-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      {open && (
        <div className="menu account-menu" role="menu">
          <p className="muted small">Signed in as<br /><strong>{email}</strong></p>
          {memberships.length > 1 ? (
            <div className="menu-group">
              <p className="menu-kind"><span className="kind-tag">Company</span> Switch company</p>
              {memberships.map((m) => (
                <button key={m.companyId} role="menuitem" className={m.companyId === current?.companyId ? 'on' : ''}
                  aria-current={m.companyId === current?.companyId ? 'true' : undefined}
                  onClick={() => { onSwitch?.(m.companyId); setOpen(false); }}>
                  {m.companyName}
                </button>
              ))}
            </div>
          ) : current && (
            <div className="menu-group" data-testid="menu-company">
              <p className="menu-kind"><span className="kind-tag">Company</span> <strong>{current.companyName}</strong></p>
              <p className="muted small">The business account that owns your sites.</p>
            </div>
          )}
          <button role="menuitem" className="menu-item-2" onClick={() => { setOpen(false); navigate('/locations'); }} data-testid="menu-locations">
            <strong>My Locations</strong>
            <span className="muted small">Every site you belong to. Join another site with its code.</span>
          </button>
          <button role="menuitem" onClick={() => void signOutHere()} data-testid="sign-out">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
