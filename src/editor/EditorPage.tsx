import { useCallback, useEffect, useState } from 'react';
import type { MapRepository, PublishInfo } from '../storage/repository';
import { Dialog } from '../ui/Dialog';
import { Notices } from '../ui/Notices';
import { navigate } from '../router';
import { friendly } from '../errors/friendly';
import { CanvasStage } from './CanvasStage';
import { FloorTabs } from './FloorTabs';
import { RowDialog } from './RowDialog';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { VersionsDialog } from './VersionsDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { SignDialog } from './SignDialog';
import { useEditor } from './store';
import { useAutosave } from './useAutosave';
import { clearBackup, readBackup, sameMapContent, type UnsavedBackup } from '../storage/unsavedBackup';
import { setImageUploader } from './imageStore';
import { useKeyboard } from './useKeyboard';

export function EditorPage({ mapId, repo }: { mapId: string; repo: MapRepository }) {
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  useEffect(() => {
    const open = () => setShowShortcuts(true);
    window.addEventListener('bm:shortcuts', open);
    return () => window.removeEventListener('bm:shortcuts', open);
  }, []);
  // "You are here" QR sign for one object, asked for from its panel or the right-click menu.
  const [signFor, setSignFor] = useState<string | null>(null);
  useEffect(() => {
    const open = (e: Event) => setSignFor((e as CustomEvent<string>).detail);
    window.addEventListener('bm:qr-sign', open);
    return () => window.removeEventListener('bm:qr-sign', open);
  }, []);
  /** Unsaved changes this browser kept from an earlier visit (a crash, a closed tab, a dropped connection). */
  const [backup, setBackup] = useState<(UnsavedBackup & { savedSince: boolean }) | null>(null);
  const doc = useEditor((s) => s.doc);
  const rowDialog = useEditor((s) => s.rowDialog);
  const conflict = useEditor((s) => s.conflict);
  const { saveNow, keepMine, useTheirs } = useAutosave(repo);
  const [published, setPublished] = useState<PublishInfo | null>(null);
  const [publishing, setPublishing] = useState(false);
  const revision = useEditor((s) => s.revision);
  const dirty = useEditor((s) => s.editSeq !== s.savedSeq);
  // Online, pictures added while editing go straight to file storage.
  useEffect(() => {
    setImageUploader(repo.storeImage ? (src) => repo.storeImage!(src) : null);
    return () => setImageUploader(null);
  }, [repo]);
  useEffect(() => {
    repo.getPublishInfo(mapId).then(setPublished, () => setPublished(null));
  }, [mapId, repo]);

  useEffect(() => {
    let alive = true;
    useEditor.setState({ doc: null });
    repo.getMap(mapId).then(
      (d) => {
        if (!alive) return;
        if (!d) {
          setError('This map could not be found. It may have been deleted. Check “Recently deleted” on the maps page.');
          return;
        }
        useEditor.getState().load(d);
        void readBackup(mapId).then((b) => {
          if (!alive || !b) return;
          // The copy matches what's stored (its save landed after all): nothing to recover.
          if (sameMapContent(b.doc, d)) return clearBackup(mapId);
          // Copies made before they recorded their revision: offered only when newer than the stored map, as before.
          if (b.baseRevision === undefined && !(b.savedAt > d.updatedAt)) return;
          setBackup({ ...b, savedSince: b.baseRevision !== undefined && b.baseRevision < d.revision });
        });
        // The canvas fits the floor to the screen when it mounts and measures itself.
      },
      (e: unknown) => alive && setError(friendly(e, 'This map could not be opened.')),
    );
    return () => {
      alive = false;
    };
  }, [mapId, repo]);

  const recover = async () => {
    const b = backup;
    const s = useEditor.getState();
    if (!b || !s.doc) return;
    try {
      await repo.saveVersion({ ...s.doc, revision: s.revision }, 'before-restore', 'Before recovering unsaved changes');
    } catch {
      // Without that copy, someone else's newer save would be overwritten for good.
      if (b.savedSince) {
        s.notify({ tone: 'error', message: 'Couldn’t reach the server to keep the newer saved version first, so nothing was recovered yet. Check your connection and try again.' });
        return;
      }
    }
    setBackup(null);
    const now = useEditor.getState();
    now.replaceDoc({ ...b.doc, revision: now.revision }, { keepHistory: true });
  };
  const keepBackupInHistory = async () => {
    const b = backup;
    setBackup(null);
    if (!b) return;
    try {
      const when = new Date(b.savedAt).toLocaleString();
      await repo.saveVersion({ ...b.doc, revision: b.baseRevision ?? useEditor.getState().revision }, 'manual', `Unsaved changes from ${when} (not recovered)`);
      clearBackup(mapId);
    } catch {
      /* Still kept in this browser until the next save. */
    }
  };

  const manualSave = useCallback(async () => {
    const ok = await saveNow({ version: 'manual' });
    if (ok) useEditor.getState().notify({ tone: 'success', message: 'Saved. A version was added to history.' });
  }, [saveNow]);
  useKeyboard(manualSave);

  const publish = async () => {
    setPublishing(true);
    try {
      await saveNow();
      const s = useEditor.getState();
      if (s.editSeq !== s.savedSeq) throw new Error('Your latest changes couldn’t be saved, so nothing was published. Try again.');
      const info = await repo.publishMap(mapId);
      setPublished(info);
      // Publishing sends what's stored. If someone else saved in the moment between our save and the
      // publish, their newer version is what went live: say so rather than imply it was ours.
      if (info.publishedRevision !== useEditor.getState().revision) {
        s.notify({ tone: 'warning', message: 'Published. Someone else saved this map moments before, so employees see the latest saved version, which includes their changes.' });
        return;
      }
      const link = `${window.location.origin}${window.location.pathname}#/view/${mapId}`;
      s.notify({
        tone: 'success',
        message: 'Published. Employees now see this version.',
        action: { label: 'Copy employee link', run: () => void navigator.clipboard?.writeText(link) },
      });
    } catch (e) {
      useEditor.getState().notify({ tone: 'error', message: friendly(e, 'Publishing failed. Try again.') });
    } finally {
      setPublishing(false);
    }
  };
  const publishState = !published ? 'never' : dirty || revision !== published.publishedRevision ? 'changes' : 'current';

  const leave = async (to: string) => {
    const s = useEditor.getState();
    if (s.editSeq !== s.savedSeq && s.saveStatus !== 'conflict') await saveNow();
    const after = useEditor.getState();
    if (
      after.editSeq !== after.savedSeq &&
      !window.confirm('Some changes aren’t saved yet. A copy is kept in this browser, and opening this map here again offers to recover it. Leave anyway?')
    )
      return;
    navigate(to);
  };

  if (error)
    return (
      <div className="page-message">
        <p>{error}</p>
        <button className="btn" onClick={() => navigate('/')}>Back to maps</button>
      </div>
    );
  if (!doc) return <div className="page-message"><p>Opening map…</p></div>;

  return (
    <div className="editor">
      <TopBar
        onSave={manualSave}
        onHistory={() => setShowHistory(true)}
        onPreview={() => leave(`/view/${doc.id}?preview=1`)}
        onHome={() => leave('/')}
        onPublish={publish}
        publishing={publishing}
        publishState={publishState}
        publishedAt={published?.publishedAt}
      />
      <main className="editor-main">
        <Sidebar />
        <CanvasStage />
      </main>
      <FloorTabs />
      <Notices />
      {rowDialog && <RowDialog />}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {signFor && <SignDialog repo={repo} mapId={mapId} objectId={signFor} onClose={() => setSignFor(null)} />}
      {showHistory && (
        <VersionsDialog
          repo={repo}
          onClose={() => setShowHistory(false)}
          onSaveVersion={(label) => saveNow({ version: 'manual', label })}
        />
      )}
      {conflict && (
        <Dialog title="This map was changed somewhere else" onClose={() => undefined}
          footer={
            <>
              <button className="btn" onClick={useTheirs} data-testid="conflict-theirs">Use the other version</button>
              <button className="btn primary" onClick={keepMine} data-testid="conflict-mine">Keep my version</button>
            </>
          }>
          <p>
            While you were editing, another window or person saved a different version of “{conflict.name}”. Autosave is paused so nothing is
            overwritten.
          </p>
          <p>Whichever you choose, the other version is kept in Version history so it can be recovered.</p>
        </Dialog>
      )}
      {backup && (
        <Dialog title="Recover unsaved changes?" onClose={keepBackupInHistory}
          footer={
            <>
              <button className="btn" onClick={keepBackupInHistory} data-testid="recover-later">Not now</button>
              <button className="btn primary" onClick={recover} data-testid="recover-changes">Recover changes</button>
            </>
          }>
          <p>
            This browser kept a copy of changes from {new Date(backup.savedAt).toLocaleString()} that weren’t saved. Recover them? (You can undo
            this.)
          </p>
          {backup.savedSince && (
            <p data-testid="recover-saved-since">
              This map was also saved after that, maybe in another window or by another manager. If you recover, the version saved now is kept in
              Version history.
            </p>
          )}
          <p className="muted">If you choose Not now, the copy is added to Version history so it isn’t lost.</p>
        </Dialog>
      )}
    </div>
  );
}
