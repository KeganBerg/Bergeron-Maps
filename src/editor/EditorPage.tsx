import { useCallback, useEffect, useState } from 'react';
import { floorBounds, fitViewport } from '../render/viewport';
import type { MapRepository } from '../storage/repository';
import { Dialog } from '../ui/Dialog';
import { Notices } from '../ui/Notices';
import { navigate } from '../router';
import { CanvasStage } from './CanvasStage';
import { FloorTabs } from './FloorTabs';
import { RowDialog } from './RowDialog';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { VersionsDialog } from './VersionsDialog';
import { currentFloor, useEditor } from './store';
import { readBackup, useAutosave } from './useAutosave';
import { useKeyboard } from './useKeyboard';

export function EditorPage({ mapId, repo }: { mapId: string; repo: MapRepository }) {
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [backup, setBackup] = useState<ReturnType<typeof readBackup>>(null);
  const doc = useEditor((s) => s.doc);
  const rowDialog = useEditor((s) => s.rowDialog);
  const conflict = useEditor((s) => s.conflict);
  const { saveNow, keepMine, useTheirs } = useAutosave(repo);

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
        const b = readBackup(mapId);
        if (b && b.savedAt > d.updatedAt) setBackup(b);
        requestAnimationFrame(() => {
          const s = useEditor.getState();
          const f = currentFloor(s);
          if (f) s.setViewport(fitViewport(floorBounds(f), s.viewSize));
        });
      },
      (e: Error) => alive && setError(e.message || 'This map could not be opened.'),
    );
    return () => {
      alive = false;
    };
  }, [mapId, repo]);

  const manualSave = useCallback(async () => {
    const ok = await saveNow({ version: 'manual' });
    if (ok) useEditor.getState().notify({ tone: 'success', message: 'Saved. A version was added to history.' });
  }, [saveNow]);
  useKeyboard(manualSave);

  const leave = async (to: string) => {
    const s = useEditor.getState();
    if (s.editSeq !== s.savedSeq && s.saveStatus !== 'conflict') await saveNow();
    const after = useEditor.getState();
    if (after.editSeq !== after.savedSeq && !window.confirm('Some changes are not saved yet. Leave anyway?')) return;
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
      />
      <div className="editor-main">
        <Sidebar />
        <CanvasStage />
      </div>
      <FloorTabs />
      <Notices />
      {rowDialog && <RowDialog />}
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
        <Dialog title="Recover unsaved changes?" onClose={() => setBackup(null)}
          footer={
            <>
              <button className="btn" onClick={() => setBackup(null)}>Not now</button>
              <button className="btn primary" onClick={() => {
                useEditor.getState().replaceDoc({ ...backup.doc, revision: useEditor.getState().revision }, { keepHistory: true });
                setBackup(null);
              }}>Recover changes</button>
            </>
          }>
          <p>
            This browser kept a copy of changes from {new Date(backup.savedAt).toLocaleString()} that weren’t saved. Recover them? (You can undo
            this.)
          </p>
        </Dialog>
      )}
    </div>
  );
}
