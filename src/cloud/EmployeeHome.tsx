import { useEffect, useState, type ReactNode } from 'react';
import { AppHeader } from '../home/HomePage';
import { navigate } from '../router';
import type { MapSummary } from '../storage/repository';
import type { SupabaseRepository } from './supabaseRepository';

/** Employees see only published maps for the sites they belong to. */
export function EmployeeHome({ repo, account }: { repo: SupabaseRepository; account: ReactNode }) {
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    repo.listPublishedMaps().then(setMaps, (e: Error) => { setError(e.message); setMaps([]); });
  }, [repo]);
  const sites = [...new Set((maps ?? []).map((m) => m.site))].sort();
  return (
    <div className="home">
      <AppHeader>{account}</AppHeader>
      <main className="home-main">
        <div className="page-head"><h2>Your maps</h2></div>
        {error && <p className="error-text">{error}</p>}
        {maps === null ? <p className="muted">Loading…</p> : maps.length === 0 ? (
          <div className="empty-state"><p>No maps are published for your site yet. Your manager will publish them here.</p></div>
        ) : (
          <div className="sites">
            {sites.map((site) => (
              <section key={site} className="site">
                <header className="site-head"><h3>{site}</h3></header>
                <ul className="map-grid">
                  {maps.filter((m) => m.site === site).map((m) => (
                    <li key={m.id} className="map-card">
                      <button className="map-open" onClick={() => navigate(`/view/${m.id}`)} data-testid={`view-${m.name}`}>
                        <strong>{m.name}</strong>
                        <span className="muted">{m.floorCount} floor{m.floorCount === 1 ? '' : 's'} · {m.spaceCount} spaces</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
