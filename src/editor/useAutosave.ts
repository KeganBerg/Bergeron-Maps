import { useCallback, useEffect, useRef } from 'react';
import type { MapDocument } from '../model/types';
import { ConflictError, type MapRepository } from '../storage/repository';
import { useEditor } from './store';

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;
const AUTO_VERSION_EVERY_MS = 10 * 60 * 1000;

export const backupKey = (id: string) => `bm.unsaved.${id}`;

function writeBackup(doc: MapDocument) {
  try {
    localStorage.setItem(backupKey(doc.id), JSON.stringify({ savedAt: new Date().toISOString(), doc }));
  } catch {
    /* storage full (e.g. large background image) — the editor still shows "Save failed" */
  }
}

function clearBackup(id: string) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    /* ignore */
  }
}

export function readBackup(id: string): { savedAt: string; doc: MapDocument } | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Saves the map shortly after every change, keeps periodic recovery points,
 * and never drops work: failed saves are retried and mirrored to a local
 * backup, and conflicting saves from elsewhere stop autosave until resolved.
 */
export function useAutosave(repo: MapRepository) {
  const editSeq = useEditor((s) => s.editSeq);
  const saving = useRef(false);
  const lastVersionAt = useRef(0);
  const timer = useRef<number>();

  const saveNow = useCallback(
    async (opts?: { version?: 'manual'; label?: string }) => {
      const s = useEditor.getState();
      if (!s.doc || saving.current || s.saveStatus === 'conflict') return false;
      const seq = s.editSeq;
      const doc = s.doc;
      const needsSave = seq !== s.savedSeq;
      saving.current = true;
      if (needsSave) s.setSaveState({ status: 'saving' });
      try {
        let stored = doc;
        if (needsSave) {
          stored = await repo.saveMap(doc, s.revision);
          clearBackup(doc.id);
        }
        const now = Date.now();
        if (opts?.version) {
          await repo.saveVersion({ ...stored, revision: stored.revision }, opts.version, opts.label);
        } else if (needsSave && now - lastVersionAt.current > AUTO_VERSION_EVERY_MS) {
          await repo.saveVersion(stored, 'auto');
          lastVersionAt.current = now;
        }
        const after = useEditor.getState();
        after.setSaveState({
          status: after.editSeq === seq ? 'saved' : 'unsaved',
          savedSeq: seq,
          revision: needsSave ? stored.revision : after.revision,
          error: null,
        });
        return true;
      } catch (e) {
        if (e instanceof ConflictError) {
          writeBackup(doc);
          useEditor.getState().setSaveState({ status: 'conflict', conflict: e.current, error: e.message });
        } else {
          writeBackup(doc);
          useEditor.getState().setSaveState({
            status: 'failed',
            error: 'Your latest changes couldn’t be saved. We’ll keep trying, and a backup copy is kept in this browser.',
          });
        }
        return false;
      } finally {
        saving.current = false;
      }
    },
    [repo],
  );

  // Debounced autosave after each change (and retry after failures).
  useEffect(() => {
    const s = useEditor.getState();
    if (!s.doc || s.editSeq === s.savedSeq || s.saveStatus === 'conflict') return;
    window.clearTimeout(timer.current);
    const delay = s.saveStatus === 'failed' ? RETRY_MS : DEBOUNCE_MS;
    timer.current = window.setTimeout(async () => {
      await saveNow();
      const after = useEditor.getState();
      // Changes made while saving: schedule another pass.
      if (after.editSeq !== after.savedSeq && after.saveStatus !== 'conflict') {
        timer.current = window.setTimeout(() => void saveNow(), after.saveStatus === 'failed' ? RETRY_MS : DEBOUNCE_MS);
      }
    }, delay);
    return () => window.clearTimeout(timer.current);
  }, [editSeq, saveNow]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.doc && (s.editSeq !== s.savedSeq || s.saveStatus === 'conflict')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  /** Resolve a conflict by keeping this editor's version; the other version goes to history. */
  const keepMine = useCallback(async () => {
    const s = useEditor.getState();
    if (!s.doc || !s.conflict) return;
    await repo.saveVersion(s.conflict, 'conflict', 'Other changes (replaced by yours)');
    s.setSaveState({ status: 'unsaved', revision: s.conflict.revision, conflict: null, error: null });
    await saveNow();
  }, [repo, saveNow]);

  /** Resolve a conflict by loading the other version; this editor's version goes to history. */
  const useTheirs = useCallback(async () => {
    const s = useEditor.getState();
    if (!s.doc || !s.conflict) return;
    await repo.saveVersion({ ...s.doc, revision: s.revision }, 'conflict', 'Your changes (replaced during a conflict)');
    const theirs = s.conflict;
    s.setSaveState({ status: 'saved', revision: theirs.revision, conflict: null, error: null });
    s.replaceDoc(theirs, { markSaved: true });
    clearBackup(theirs.id);
  }, [repo]);

  return { saveNow, keepMine, useTheirs };
}
