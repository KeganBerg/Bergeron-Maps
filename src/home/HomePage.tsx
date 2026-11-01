import { useEffect, useRef, useState } from 'react';
import { newId } from '../model/ids';
import { MAP_FILE_EXTENSION, MAX_MAP_FILE_BYTES, parseMapFile } from '../storage/mapFile';
import { TRASH_RETENTION_DAYS, type MapRepository, type MapSummary } from '../storage/repository';
import { navigate } from '../router';
import { ConfirmDialog } from '../ui/Dialog';
import { NewMapDialog } from './NewMapDialog';
import { Icon } from '../ui/icons';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function HomePage({ repo }: { repo: MapRepository }) {
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [trash, setTrash] = useState<MapSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [trashing, setTrashing] = useState<MapSummary | null>(null);
  const [purging, setPurging] = useState<MapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      await repo.purgeExpiredTrash();
      setMaps(await repo.listMaps());
      setTrash(await repo.listTrash());
    } catch {
      setError('Your maps couldn’t be loaded from this browser. If you are in private browsing mode, saving may be disabled.');
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
    await repo.createMap(copy);
    await refresh();
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      if (file.size > MAX_MAP_FILE_BYTES) throw new Error('This file is too large to be a map file.');
      const doc = parseMapFile(await file.text());
      await repo.createMap(doc);
      navigate(`/edit/${doc.id}`);
    } catch (e) {
      setError(`“${file.name}” couldn’t be imported. ${e instanceof Error ? e.message : ''}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <span className="logo">P</span>
          <h1>Bergeron Maps</h1>
        </div>
        <span className="btn-row">
          <button className="btn" onClick={() => fileInput.current?.click()} title="Open a map file downloaded from Bergeron Maps" data-testid="import-map">
            Import map file
          </button>
          <input ref={fileInput} type="file" accept={`${MAP_FILE_EXTENSION},.json,application/json`} hidden
            onChange={(e) => void importFile(e.target.files?.[0])} data-testid="import-map-input" />
          <button className="btn primary" onClick={() => setCreating(true)} data-testid="new-map">
            <Icon name="plus" size={16} /> New map
          </button>
        </span>
      </header>

      <main className="home-main">
        <div className="notice-banner">
          Maps are saved in this browser on this device for now. Sign-in, sharing with employees, and cloud backup arrive in the next phase.
        </div>
        {error && <p className="error-text">{error}</p>}
        <h2>Your maps</h2>
        {maps === null ? (
          <p className="muted">Loading…</p>
        ) : maps.length === 0 ? (
          <div className="empty-state">
            <p>No maps yet. Create your first facility map to get started.</p>
            <button className="btn primary" onClick={() => setCreating(true)}>Create a map</button>
          </div>
        ) : (
          <ul className="map-grid" data-testid="map-list">
            {maps.map((m) => (
              <li key={m.id} className="map-card">
                <button className="map-open" onClick={() => navigate(`/edit/${m.id}`)} data-testid={`open-${m.name}`}>
                  <strong>{m.name}</strong>
                  <span className="muted">
                    {m.floorCount} floor{m.floorCount === 1 ? '' : 's'} · {m.spaceCount} space{m.spaceCount === 1 ? '' : 's'}
                  </span>
                  <span className="muted small">Edited {when(m.updatedAt)}</span>
                </button>
                <div className="card-actions">
                  <button className="btn small" onClick={() => navigate(`/view/${m.id}`)}>View</button>
                  <button className="btn small" onClick={() => copyMap(m)} title="Use as a starting point for another facility">Copy</button>
                  <button className="btn small" onClick={() => setTrashing(m)} data-testid={`delete-${m.name}`}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
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
          onClose={() => setCreating(false)}
          onCreate={async (doc) => { await repo.createMap(doc); navigate(`/edit/${doc.id}`); }}
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
