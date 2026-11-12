import { useEffect, useState, type ReactNode } from 'react';
import { AppHeader } from '../home/HomePage';
import { navigate } from '../router';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { friendly, supabase } from './client';
import type { Role } from './session';

interface Location {
  company_id: string; company_name: string; site_id: string; site_name: string; slug: string; address: string | null;
  role: Role; live_maps: number; request_status: 'pending' | 'approved' | 'denied' | null;
}
interface LiveMap { map_id: string; name: string; facility_id: string; published_at: string; floors: number }

/** Codes are 6 letters and digits; people often type them with a space or dash (K7M-2QX). */
const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

const NO_MATCH = 'That code didn’t match a site. Check it with your manager and try again.';

/**
 * My Locations: every site this person joined, in any company, with its
 * published maps. Employees add a site with its 6-character code. There is no
 * way to pick a role here: someone who should be a manager asks for it, and an
 * owner or regional manager approves it.
 */
export function MyLocationsPage({ email, account, onChanged }: { email: string; account: ReactNode; onChanged: () => void }) {
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [maps, setMaps] = useState<LiveMap[]>([]);
  const [code, setCode] = useState('');
  const [askManager, setAskManager] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<Location | null>(null);
  const [requestNote, setRequestNote] = useState('');
  const [leaving, setLeaving] = useState<Location | null>(null);

  const load = async () => {
    const db = supabase!;
    const [l, p] = await Promise.all([
      db.rpc('my_locations'),
      db.from('published_maps').select('map_id, name, facility_id, published_at, doc->floors').order('name'),
    ]);
    if (l.error) {
      setError(friendly(l.error));
      setLocations([]);
      return;
    }
    setLocations(l.data as Location[]);
    const rows = (p.data ?? []) as { map_id: string; name: string; facility_id: string; published_at: string; floors: unknown[] | null }[];
    setMaps(rows.map((r) => ({ ...r, floors: Array.isArray(r.floors) ? r.floors.length : 1 })));
  };
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const msg = await fn();
      if (msg) setNote(msg);
    } catch (e) {
      setError(friendly(e));
    }
    setBusy(false);
    await load();
  };

  const join = () => run(async () => {
    const r = await supabase!.rpc('join_site', { p_code: code });
    if (r.error) throw r.error;
    // No match comes back as null, so the database can count wrong tries.
    if (!r.data) throw new Error(NO_MATCH);
    setCode('');
    let msg = 'Site added. Its published maps are below.';
    if (askManager) {
      const q = await supabase!.rpc('request_manager_access', { p_facility: r.data, p_note: null });
      msg = q.error ? `Site added, but the manager request didn’t go through: ${friendly(q.error)}` : 'Site added. Your manager request was sent for approval.';
      setAskManager(false);
    }
    onChanged();
    return msg;
  });

  const request = (l: Location) => run(async () => {
    setRequesting(null);
    const r = await supabase!.rpc('request_manager_access', { p_facility: l.site_id, p_note: requestNote.trim() || null });
    if (r.error) throw r.error;
    setRequestNote('');
    return `Request sent. You’ll get manager access to ${l.site_name} as soon as it’s approved.`;
  });

  const leave = (l: Location) => run(async () => {
    setLeaving(null);
    const r = await supabase!.rpc('leave_site', { p_facility: l.site_id });
    if (r.error) throw r.error;
    onChanged();
    return `You left ${l.site_name}.`;
  });

  const companies = [...new Set((locations ?? []).map((l) => l.company_id))];

  return (
    <div className="home">
      <AppHeader>{account}</AppHeader>
      <main className="home-main locations">
        <div className="page-head"><h2>My Locations</h2></div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {note && <p className="ok-text" role="status">{note}</p>}

        {locations === null ? <p className="muted">Loading…</p> : locations.length === 0 ? (
          <div className="empty-state" data-testid="no-locations">
            <p>You haven’t joined a site yet. Enter the 6-character site code from your manager below.</p>
            <p className="muted small">Signed in as <strong>{email}</strong>. If you’re a manager, ask your admin to add this email to your site.</p>
          </div>
        ) : companies.map((cid) => {
          const list = locations.filter((l) => l.company_id === cid);
          return (
            <section key={cid} className="loc-company">
              {companies.length > 1 && <h3 className="loc-company-name">{list[0].company_name}</h3>}
              {list.map((l) => {
                const siteMaps = maps.filter((m) => m.facility_id === l.site_id);
                return (
                  <article key={l.site_id} className="panel-card loc-site" data-testid={`location-${l.site_name}`}>
                    <header className="loc-head">
                      <span>
                        <strong className="loc-name">{l.site_name}</strong>
                        {l.address && <span className="muted small loc-address">{l.address}</span>}
                      </span>
                      {l.role !== 'employee' && <span className="muted small">{l.role === 'owner' ? 'Account lead' : 'Manager'}</span>}
                    </header>
                    {siteMaps.length === 0 ? (
                      <p className="muted small">No maps are published here yet.</p>
                    ) : (
                      <ul className="loc-maps">
                        {siteMaps.map((m) => (
                          <li key={m.map_id}>
                            <button className="loc-map" onClick={() => navigate(`/view/${m.map_id}`)} data-testid={`view-${m.name}`}>
                              <strong>{m.name}</strong>
                              <span className="muted small">{m.floors} {m.floors === 1 ? 'level' : 'levels'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {l.role === 'employee' && (
                      <footer className="loc-foot">
                        {l.request_status === 'pending' ? (
                          <span className="muted small" data-testid={`request-pending-${l.site_name}`}>Manager request sent. Waiting for approval.</span>
                        ) : (
                          <span className="muted small">
                            Need Site Manager access for this location?{' '}
                            <button className="link" onClick={() => setRequesting(l)} data-testid={`request-manager-${l.site_name}`}>Request Manager Status</button>
                            {l.request_status === 'denied' && ' Your last request wasn’t approved.'}
                          </span>
                        )}
                        <button className="link small muted-link" onClick={() => setLeaving(l)}>Leave this site</button>
                      </footer>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}

        <form className="panel-card loc-join" onSubmit={(e) => { e.preventDefault(); void join(); }}>
          <h3>{locations?.length ? 'Add another site' : 'Join a site'}</h3>
          <label className="stack">
            Site code
            <input value={code} onChange={(e) => setCode(cleanCode(e.target.value))} autoCapitalize="characters" autoComplete="off"
              placeholder="K7M2QX" className="code-input" data-testid="join-code" />
          </label>
          <label className="check">
            <input type="checkbox" checked={askManager} onChange={(e) => setAskManager(e.target.checked)} data-testid="join-ask-manager" />
            <span>I’m the site manager here. Ask for manager access too.</span>
          </label>
          <button className="btn primary" disabled={busy || code.trim().length < 6}>Join site</button>
        </form>
      </main>

      {requesting && (
        <Dialog title={`Request manager access to ${requesting.site_name}?`} onClose={() => setRequesting(null)}
          footer={<>
            <button className="btn" onClick={() => setRequesting(null)}>Cancel</button>
            <button className="btn primary" onClick={() => void request(requesting)} data-testid="send-request">Send request</button>
          </>}>
          <p>Your regional manager or Bergeron Maps will approve or deny it. Until then you keep view-only access.</p>
          <label className="stack">Note (optional)
            <input value={requestNote} onChange={(e) => setRequestNote(e.target.value)} maxLength={300} placeholder="e.g. I started as site manager this week" />
          </label>
        </Dialog>
      )}
      {leaving && (
        <ConfirmDialog title={`Leave ${leaving.site_name}?`} confirmLabel="Leave site" danger onCancel={() => setLeaving(null)} onConfirm={() => void leave(leaving)}
          message={<p>Its maps disappear from My Locations. You can join again with the site code.</p>} />
      )}
    </div>
  );
}
