import { BrandMark, BrandWordmark } from '../ui/Brand';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { newId } from '../model/ids';
import { MAP_FILE_EXTENSION, MAX_MAP_FILE_BYTES, parseMapFile } from '../storage/mapFile';
import { SITE_LIVE_MAPS, SITE_MAP_SLOTS, TRASH_RETENTION_DAYS, type MapRepository, type MapSummary } from '../storage/repository';
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A site's maps laid out in its numbered slots. Maps without a slot (only
 * possible for sites that had more than the limit before slots existed) come
 * after the slots.
 */
function slotLayout(list: MapSummary[]): { slots: (MapSummary | null)[]; extra: MapSummary[] } {
  const slots: (MapSummary | null)[] = Array.from({ length: SITE_MAP_SLOTS }, () => null);
  const extra: MapSummary[] = [];
  for (const m of list) {
    if (m.slot && m.slot <= SITE_MAP_SLOTS && !slots[m.slot - 1]) slots[m.slot - 1] = m;
    else extra.push(m);
  }
  return { slots, extra };
}

const SLOTS_FULL = `All ${SITE_MAP_SLOTS} slots are in use. Delete a map to free a slot.`;

function publishStatus(m: MapSummary): { text: string; tone: string } {
  if (!m.publishedAt) return { text: 'Draft', tone: 'draft' };
  if (m.publishedRevision !== m.revision) return { text: 'Unpublished changes', tone: 'changes' };
  return { text: 'Published', tone: 'live' };
}

/** Top bar: section links on the left, logo in the middle, account on the right. */
export function AppHeader({ nav, children }: { nav?: ReactNode; children?: ReactNode }) {
  return (
    <header className={`home-header${nav ? ' has-nav' : ''}`}>
      {nav && <nav className="header-nav" aria-label="Sections">{nav}</nav>}
      <button className="brand" onClick={() => navigate('/')} aria-label="Bergeron Maps home">
        <BrandMark size={36} />
        <BrandWordmark height={15} />
        <h1 className="sr-only">Bergeron Maps</h1>
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
export function HomePage({ repo, banner = LOCAL_BANNER, headerExtra, nav, title = 'Your sites', canAddSite = true }: {
  repo: MapRepository; banner?: ReactNode; headerExtra?: ReactNode; nav?: ReactNode; title?: string; canAddSite?: boolean;
}) {
  const [sites, setSites] = useState<string[]>([]);
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [trash, setTrash] = useState<MapSummary[]>([]);
  const [creating, setCreating] = useState<false | { site?: string; slot?: number }>(false);
  const [trashing, setTrashing] = useState<MapSummary | null>(null);
  const [unpublishing, setUnpublishing] = useState<MapSummary | null>(null);
  const [purging, setPurging] = useState<MapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Runs a change, shows what went wrong if it failed, and reloads the list either way. */
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || 'That didn’t go through. Try again.');
    }
    await refresh();
  };

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

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      if (file.size > MAX_MAP_FILE_BYTES) throw new Error('This file is too large to be a map file.');
      const doc = parseMapFile(await file.text());
      const stored = await repo.createMap(doc);
      navigate(`/edit/${stored.id}`);
    } catch (e) {
      setError(`“${file.name}” couldn’t be imported. ${e instanceof Error ? e.message : ''}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="home">
      <AppHeader nav={nav}>{headerExtra}</AppHeader>

      <main className="home-main">
        {banner && <div className="notice-banner">{banner}</div>}
        {error && <p className="error-text">{error}</p>}
        <div className="page-head">
          <h2>{title}</h2>
          {canAddSite && (
            <div className="page-actions">
              <button className="btn" onClick={() => fileInput.current?.click()} title="Open a map file downloaded from Bergeron Maps" data-testid="import-map">
                Import map file
              </button>
              <input ref={fileInput} type="file" accept={`${MAP_FILE_EXTENSION},.json,application/json`} hidden
                onChange={(e) => void importFile(e.target.files?.[0])} data-testid="import-map-input" />
              <button className="btn primary" onClick={() => setCreating({})} data-testid="new-map">
                <Icon name="plus" size={16} /> New site
              </button>
            </div>
          )}
        </div>
        {maps === null ? (
          <p className="muted">Loading…</p>
        ) : maps.length === 0 && sites.length === 0 ? (
          <div className="empty-state">
            <p>No maps yet. Create your first site map to get started. It takes about a minute.</p>
            <button className="btn primary" onClick={() => setCreating({})}>Create a map</button>
          </div>
        ) : (
          <div className="sites" data-testid="map-list">
            {groupBySite(maps, sites).map(([site, list]) => {
              const { slots, extra } = slotLayout(list);
              const full = list.length >= SITE_MAP_SLOTS;
              const live = list.filter((m) => m.publishedAt).length;
              const spaces = list.reduce((n, m) => n + m.spaceCount, 0);
              const card = (m: MapSummary, label: string) => {
                const st = publishStatus(m);
                return (
                  <li key={m.id} className="map-card map-card-filled" data-testid={`slot-${site}-${m.slot ?? 'extra'}`}>
                    <button className="map-open" onClick={() => navigate(`/edit/${m.id}`)} data-testid={`open-${m.name}`}>
                      <span className="card-top">
                        <span className="slot-num">{label}</span>
                        <span className={`pub-pill ${st.tone}`}>{st.text}</span>
                      </span>
                      <strong>{m.name}</strong>
                      <span className="map-meta">
                        {plural(m.floorCount, 'floor')} · {plural(m.spaceCount, 'space')}
                      </span>
                      <span className="map-edited">Edited {when(m.updatedAt)}</span>
                    </button>
                    <div className="card-actions">
                      <button className="btn small" onClick={() => navigate(m.publishedAt ? `/view/${m.id}` : `/view/${m.id}?preview=1`)}>
                        {m.publishedAt ? 'Employee view' : 'Preview'}
                      </button>
                      <button className="btn small" onClick={() => copyMap(m)} disabled={full}
                        title={full ? SLOTS_FULL : 'Use as a starting point for another map at this site'}>Copy</button>
                      {m.publishedAt && (
                        <button className="btn small" onClick={() => setUnpublishing(m)} data-testid={`unpublish-${m.name}`}
                          title="Stop showing this map to employees. The map itself is kept.">Unpublish</button>
                      )}
                      <button className="btn small card-delete" onClick={() => setTrashing(m)} data-testid={`delete-${m.name}`}>Delete</button>
                    </div>
                  </li>
                );
              };
              return (
                <section key={site} className="site" data-testid={`site-${site}`}>
                  <header className="site-head">
                    <h3>{site}</h3>
                    <span className="site-meta" data-testid={`site-meta-${site}`}>
                      {list.length} of {SITE_MAP_SLOTS} slots used · {live} of {SITE_LIVE_MAPS} published · {plural(spaces, 'space')}
                    </span>
                    <button className="btn small" onClick={() => setCreating({ site })} disabled={full} title={full ? SLOTS_FULL : undefined}
                      data-testid={`add-map-${site}`}>
                      <Icon name="plus" size={14} /> Add map
                    </button>
                  </header>
                  {full && <p className="site-note" data-testid={`slots-full-${site}`}>{SLOTS_FULL}</p>}
                  <ul className="map-grid slot-grid">
                    {slots.map((m, i) =>
                      m ? card(m, `Slot ${i + 1}`) : (
                        <li key={`empty-${i}`} className="map-card map-card-empty" data-testid={`slot-${site}-${i + 1}`}>
                          <button className="map-add" onClick={() => setCreating({ site, slot: i + 1 })} disabled={full}
                            aria-label={`Add a map in slot ${i + 1} of ${site}`}>
                            <span className="slot-num">Slot {i + 1}</span>
                            {list.length === 0 && i === 0 ? (
                              <><Icon name="plus" size={18} /><strong>Add the first map</strong><span>Build one from a few numbers in about a minute.</span></>
                            ) : (
                              <><strong>Empty</strong><span>Add a map here</span></>
                            )}
                          </button>
                        </li>
                      ),
                    )}
                    {extra.map((m) => card(m, 'No slot'))}
                  </ul>
                </section>
              );
            })}
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
                    <button className="btn small" onClick={() => void act(() => repo.restoreMap(m.id))} data-testid={`restore-${m.name}`}>
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
              const stored = await repo.createMap(doc, site, creating.slot);
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
          onConfirm={async () => { setTrashing(null); await act(() => repo.trashMap(trashing.id)); }}
          message={<p>You can restore it from “Recently deleted” for {TRASH_RETENTION_DAYS} days.</p>}
        />
      )}
      {unpublishing && (
        <ConfirmDialog
          title={`Unpublish “${unpublishing.name}”?`}
          confirmLabel="Unpublish"
          onCancel={() => setUnpublishing(null)}
          onConfirm={async () => { setUnpublishing(null); await act(() => repo.unpublishMap(unpublishing.id)); }}
          message={<p>Employees will stop seeing this map. It stays in its slot, and you can publish it again any time. Each site can have {SITE_LIVE_MAPS} published maps at once.</p>}
        />
      )}
      {purging && (
        <ConfirmDialog
          title={`Permanently delete “${purging.name}”?`}
          confirmLabel="Delete forever"
          danger
          onCancel={() => setPurging(null)}
          onConfirm={async () => { setPurging(null); await act(() => repo.purgeMap(purging.id)); }}
          message={<p>This removes the map and all of its versions. It can’t be undone.</p>}
        />
      )}
    </div>
  );
}
