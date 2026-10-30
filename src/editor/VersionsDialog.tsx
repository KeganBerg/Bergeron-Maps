import { useEffect, useState } from 'react';
import type { MapRepository, VersionMeta } from '../storage/repository';
import { Dialog } from '../ui/Dialog';
import { useEditor } from './store';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function VersionsDialog({ repo, onClose, onSaveVersion }: {
  repo: MapRepository;
  onClose: () => void;
  onSaveVersion: (label: string) => Promise<boolean>;
}) {
  const doc = useEditor((s) => s.doc)!;
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState<VersionMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    repo.listVersions(doc.id).then(setVersions, () => setError('Version history couldn’t be loaded. Please try again.'));
  useEffect(() => {
    void refresh();
  }, [doc.id]);

  const restore = async (v: VersionMeta) => {
    const s = useEditor.getState();
    try {
      const old = await repo.getVersion(v.id);
      if (!old) throw new Error();
      // Keep the current state first, so restoring never destroys newer work.
      await repo.saveVersion({ ...s.doc!, revision: s.revision }, 'before-restore');
      s.replaceDoc({ ...old, id: s.doc!.id, revision: s.revision }, { keepHistory: true });
      s.notify({ tone: 'success', message: `Restored the version from ${fmt(v.createdAt)}. Your previous version was kept in history.` });
      onClose();
    } catch {
      setError('That version couldn’t be restored. Nothing was changed.');
    }
  };

  return (
    <Dialog title="Version history" onClose={onClose} wide>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onSaveVersion(label.trim() || 'Saved version')) {
            setLabel('');
            void refresh();
          }
        }}
      >
        <input placeholder="Name this version (optional), e.g. “Before restriping”" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
        <button className="btn primary" type="submit">Save version now</button>
      </form>
      {error && <p className="error-text">{error}</p>}
      {!versions ? (
        <p className="muted">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="muted">No saved versions yet. A recovery point is created automatically while you edit.</p>
      ) : (
        <ul className="version-list" data-testid="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <div>
                <strong>{v.label}</strong>
                <span className="muted">{fmt(v.createdAt)} · on this device</span>
              </div>
              {confirming?.id === v.id ? (
                <span className="btn-row">
                  <button className="btn small" onClick={() => setConfirming(null)}>Cancel</button>
                  <button className="btn small primary" onClick={() => restore(v)} data-testid="confirm-restore">Restore this version</button>
                </span>
              ) : (
                <button className="btn small" onClick={() => setConfirming(v)}>Restore…</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Restoring replaces what’s on screen; your current version is saved to this list first, and Ctrl+Z also undoes a restore. Automatic recovery
        points keep the latest 50; named versions are kept until the map is permanently deleted. Who-made-which-change appears once accounts arrive.
      </p>
    </Dialog>
  );
}
