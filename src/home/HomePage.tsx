import { useEffect, useState, type ReactNode } from 'react';
import { newId } from '../model/ids';
import { TRASH_RETENTION_DAYS, type MapRepository, type MapSummary } from '../storage/repository';
import { navigate } from '../router';
import { ConfirmDialog } from '../ui/Dialog';
import { NewMapDialog } from './NewMapDialog';
import { Icon } from '../ui/icons';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function groupBySite(maps: MapSummary[], sites: string[] = []): [string, MapSummary[]][] {
  const by = new Map<string, MapSummary[]>(sites.map((s) => [s, []]));
  for (const m of maps) by.set(m.site, [...(by.get(m.site) ?? []), m]);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function publishStatus(m: MapSummary): { text: string; tone: string } {
  if (!m.publishedAt) return { text: 'Draft · not published', tone: 'draft' };
  if (m.publishedRevision !== m.revision) return { text: 'Unpublished changes', tone: 'changes' };
  return { text: 'Published', tone: 'live' };
}

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="home-header">
      <button className="brand" onClick={() => navigate('/')} aria-label="Bergeron Maps home">
        <span className="logo">P</span>
        <h1>Bergeron Maps</h1>
      </button>
      <div className="header-actions">{children}</div>
    </header>
  );
}

const LOCAL_BANNER = 'Browser-only mode: maps are saved in this browser and nobody else can see them.';

/**
 * The manager's home: every site they can edit, each with its maps and their
 * publish status. `banner` and `headerExtra` let online mode add the company
 * name, team link and account menu.
 */
export function HomePage({ repo, banner = LOCAL_BANNER, headerExtra, title = 'Your sites', canAddSite = true }: {
  repo: MapRepository; banner?: ReactNode; headerExtra?: ReactNode; title?: string; canAddSite?: boolean;
}) {
  const [sites, setSites] = useState<string[]>([]);
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [trash, setTrash] = useState<MapSummary[]>([]);
  const [creating, setCreating] = useState<false | { site?: string }>(false);
  const [trashing, setTrashing] = useState<MapSummary | null>(null);
  const [purging, setPurging] = useState<MapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      await repo.purgeExpiredTrash();
      setMaps(await repo.listMaps());
      if (repo.listSites) setSites(await repo.listSites());
      setTrash(await repo.listTrash());
    } catch (e) {
      setError(`Your maps couldn’t be loaded. ${(e as Error).message ?? ''}`.trim());
      setMaps([]);
    }
  };
  useEffect(() => {
    void refresh();
    // refresh only on mount
  }, []);

  const copyMap = async (m: MapSummary) => {
    const src = await repo.getMap(m.id);
    if (!src) return;
    const now = new Date().toISOString();
    const copy = { ...structuredClone(src), id: newId('map'), name: `${src.name} (copy)`, createdAt: now, updatedAt: now, revision: 0 };
    try {
      await repo.createMap(copy, m.site);
    } catch (e) {
      setError((e as Error).message);
    }
    await refresh();
  };

  return (
    <div className="home">
      <AppHeader>
        {headerExtra}
        {canAddSite && (
          <button className="btn primary" onClick={() => setCreating({})} data-testid="new-map">
            <Icon name="plus" size={16} /> New site
          </button>
        )}
      </AppHeader>

      <main className="home-main">
        {banner && <div className="notice-banner">{banner}</div>}
        {error && <p className="error-text">{error}</p>}
        <h2>{title}</h2>
        {maps === null ? (
          <p className="muted">Loading…</p>
        ) : maps.length === 0 && sites.length === 0 ? (
          <div className="empty-state">
            <p>No maps yet. Create your first site map to get started. It takes about a minute.</p>
            <button className="btn primary" onClick={() => setCreating({})}>Create a map</button>
          </div>
        ) : (
          <div className="sites" data-testid="map-list">
            {groupBySite(maps, sites).map(([site, list]) => (
              <section key={site} className="site" data-testid={`site-${site}`}>
                <header className="site-head">
                  <h3>{site}</h3>
                  <span className="muted small">{list.length} map{list.length === 1 ? '' : 's'} · {list.reduce((n, m) => n + m.spaceCount, 0)} spaces</span>
                  <button className="btn small" onClick={() => setCreating({ site })} data-testid={`add-map-${site}`}>
                    <Icon name="plus" size={14} /> Add map
                  </button>
                </header>
                {list.length === 0 && <p className="muted small">No maps yet. Use Add map to build one in about a minute.</p>}
                <ul className="map-grid">
                  {list.map((m) => {
                    const st = publishStatus(m);
                    return (
                      <li key={m.id} className="map-card">
                        <button className="map-open" onClick={() => navigate(`/edit/${m.id}`)} data-testid={`open-${m.name}`}>
                          <span className={`pub-pill ${st.tone}`}>{st.text}</span>
                          <strong>{m.name}</strong>
                          <span className="muted">
                            {m.floorCount} floor{m.floorCount === 1 ? '' : 's'} · {m.spaceCount} space{m.spaceCount === 1 ? '' : 's'}
                          </span>
                          <span className="muted small">Edited {when(m.updatedAt)}</span>
                        </button>
                        <div className="card-actions">
                          <button className="btn small" onClick={() => navigate(m.publishedAt ? `/view/${m.id}` : `/view/${m.id}?preview=1`)}>
                            {m.publishedAt ? 'Employee view' : 'Preview'}
                          </button>
                          <button className="btn small" onClick={() => copyMap(m)} title="Use as a starting point for another map">Copy</button>
                          <button className="btn small" onClick={() => setTrashing(m)} data-testid={`delete-${m.name}`}>Delete</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {trash.length > 0 && (
          <section className="trash">
            <h2>Recently deleted</h2>
            <p className="muted">Deleted maps can be restored for {TRASH_RETENTION_DAYS} days, then they are removed permanently.</p>
            <ul className="trash-list" data-testid="trash-list">
              {trash.map((m) => (
                <li key={m.id}>
                  <span>
                    <strong>{m.name}</strong> <span className="muted small">deleted {when(m.deletedAt!)}</span>
                  </span>
                  <span className="btn-row">
                    <button className="btn small" onClick={async () => { await repo.restoreMap(m.id); await refresh(); }} data-testid={`restore-${m.name}`}>
                      <Icon name="restore" size={14} /> Restore
                    </button>
                    <button className="btn small danger-text" onClick={() => setPurging(m)}>Delete forever</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {creating && (
        <NewMapDialog
          site={creating.site}
          onClose={() => setCreating(false)}
          onCreate={async (doc, site) => {
            try {
              const stored = await repo.createMap(doc, site);
              navigate(`/edit/${stored.id}`);
            } catch (e) {
              setCreating(false);
              setError((e as Error).message);
            }
          }}
        />
      )}
      {trashing && (
        <ConfirmDialog
          title={`Delete “${trashing.name}”?`}
          confirmLabel="Move to Recently deleted"
          danger
          onCancel={() => setTrashing(null)}
          onConfirm={async () => { await repo.trashMap(trashing.id); setTrashing(null); await refresh(); }}
          message={<p>You can restore it from “Recently deleted” for {TRASH_RETENTION_DAYS} days.</p>}
        />
      )}
      {purging && (
        <ConfirmDialog
          title={`Permanently delete “${purging.name}”?`}
          confirmLabel="Delete forever"
          danger
          onCancel={() => setPurging(null)}
          onConfirm={async () => { await repo.purgeMap(purging.id); setPurging(null); await refresh(); }}
          message={<p>This removes the map and all of its versions. It can’t be undone.</p>}
        />
      )}
    </div>
  );
}
