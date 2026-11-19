import { useCallback, useEffect, useRef } from 'react';
import type { MapDocument } from '../model/types';
import { ConflictError, MapGoneError, type MapRepository } from '../storage/repository';
import { clearBackup, sameMapContent, writeBackup } from '../storage/unsavedBackup';
import { useEditor } from './store';

export { backupKey, readBackup } from '../storage/unsavedBackup';

const DEBOUNCE_MS = 800;
/** Waits between retries after a failed save; the last one repeats. Coming back online retries at once. */
const RETRY_MS = [5000, 10000, 20000, 30000];
const AUTO_VERSION_EVERY_MS = 10 * 60 * 1000;

export interface AutosaveOptions {
  /** A save that hasn't answered by then counts as failed, so it can't hold up every later save. */
  saveTimeoutMs?: number;
  /** A save still running after this long gets a copy kept in this browser, in case the tab closes or crashes. */
  slowSaveMs?: number;
  /** How often an open editor with nothing unsaved checks whether someone else saved the map. */
  checkElsewhereMs?: number;
}

class SaveTimeout extends Error {}

const OFFLINE = 'You’re offline. Your changes are kept in this browser and will save as soon as you’re back online.';
const FAILED = 'Your latest changes couldn’t be saved. We’ll keep trying, and a backup copy is kept in this browser.';
const SLOW = 'The connection is too slow to save right now. We’ll keep trying, and a backup copy is kept in this browser.';

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: number | undefined;
  return Promise.race([p, new Promise<never>((_, reject) => (t = window.setTimeout(() => reject(new SaveTimeout()), ms)))]).finally(() =>
    window.clearTimeout(t),
  );
}

/** Someone is typing in a field or a dialog is open: not the moment to swap the map under them. */
function busyEditing() {
  const s = useEditor.getState();
  const el = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  return typing || !!s.gestureBase || !!s.rowDialog;
}

/**
 * Saves the map shortly after every change, keeps periodic recovery points,
 * and never drops work: failed saves are retried and mirrored to a local
 * backup, and conflicting saves from elsewhere stop autosave until resolved.
 *
 * Built to hold up under a bad connection (2026-11-19 stress audit):
 * - a save that never answers times out instead of blocking every later save;
 * - a save that reached the server but whose answer was lost is recognized as
 *   this editor's own when the next save meets it, instead of being shown as
 *   "changed somewhere else";
 * - slow or failing saves keep a copy in this browser, so a tab crash mid-save
 *   loses nothing;
 * - offline is said plainly, and coming back online saves at once.
 * And for two people on one map: while this editor has nothing unsaved, it
 * picks up saves made elsewhere, so a second manager doesn't edit an old copy.
 */
export function useAutosave(repo: MapRepository, options: AutosaveOptions = {}) {
  const { saveTimeoutMs = 60_000, slowSaveMs = 1500, checkElsewhereMs = 30_000 } = options;
  const editSeq = useEditor((s) => s.editSeq);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const lastVersionAt = useRef(0);
  const timer = useRef<number>();
  const failures = useRef(0);
  /**
   * Documents sent since the last save this editor knows landed. If one of them
   * turns out to be what storage holds, that "conflict" is our own save whose
   * answer was lost (dropped connection, timeout), not someone else's.
   */
  const sent = useRef<MapDocument[]>([]);

  /** Saves `doc`; a "conflict" with a save this editor sent itself is adopted instead of reported. */
  const store = useCallback(
    async (doc: MapDocument, base: number): Promise<MapDocument> => {
      try {
        return await repo.saveMap(doc, base);
      } catch (e) {
        if (!(e instanceof ConflictError) || !sent.current.some((d) => sameMapContent(d, e.current))) throw e;
        if (sameMapContent(doc, e.current)) return e.current;
        return repo.saveMap(doc, e.current.revision);
      }
    },
    [repo],
  );

  const saveOnce = useCallback(
    async (opts?: { version?: 'manual'; label?: string }) => {
      const s = useEditor.getState();
      if (!s.doc || s.saveStatus === 'conflict') return false;
      const seq = s.editSeq;
      const doc = s.doc;
      const base = s.revision;
      const needsSave = seq !== s.savedSeq;
      let stored: MapDocument = { ...doc, revision: base };
      if (needsSave) {
        s.setSaveState({ status: 'saving' });
        sent.current = [...sent.current.slice(-19), doc];
        const slow = window.setTimeout(() => writeBackup(useEditor.getState().doc ?? doc, base), slowSaveMs);
        try {
          stored = await withTimeout(store(doc, base), saveTimeoutMs);
          sent.current = [];
          failures.current = 0;
          clearBackup(doc.id);
          const after = useEditor.getState();
          after.setSaveState({
            status: after.editSeq === seq ? 'saved' : 'unsaved',
            savedSeq: seq,
            revision: stored.revision,
            error: null,
          });
        } catch (e) {
          writeBackup(useEditor.getState().doc ?? doc, base);
          const st = useEditor.getState();
          if (!(e instanceof ConflictError)) failures.current++;
          if (e instanceof ConflictError) {
            st.setSaveState({ status: 'conflict', conflict: e.current, error: e.message });
          } else if (e instanceof MapGoneError) {
            if (st.saveError !== e.message) st.notify({ tone: 'error', message: e.message });
            st.setSaveState({ status: 'failed', error: e.message });
          } else {
            st.setSaveState({ status: 'failed', error: !online() ? OFFLINE : e instanceof SaveTimeout ? SLOW : FAILED });
          }
          return false;
        } finally {
          window.clearTimeout(slow);
        }
      }
      // Recovery points. The map itself is saved by now, so a failure here doesn't mark it unsaved.
      const now = Date.now();
      try {
        if (opts?.version) {
          await withTimeout(repo.saveVersion(stored, opts.version, opts.label), saveTimeoutMs);
        } else if (needsSave && now - lastVersionAt.current > AUTO_VERSION_EVERY_MS) {
          await withTimeout(repo.saveVersion(stored, 'auto'), saveTimeoutMs);
          lastVersionAt.current = now;
        }
      } catch {
        if (opts?.version) {
          useEditor.getState().notify({ tone: 'error', message: 'Your map is saved, but the version couldn’t be added to Version history. Check your connection and try again.' });
          return false;
        }
        // An automatic point is tried again with the next save.
      }
      return true;
    },
    [repo, store, saveTimeoutMs, slowSaveMs],
  );

  /**
   * Saves now. If a save is already running (autosave fired a moment ago),
   * waits for it and then saves whatever changed since, so Save, Publish and
   * leaving the editor never give up just because autosave got there first.
   */
  const saveNow = useCallback(
    async (opts?: { version?: 'manual'; label?: string }) => {
      while (inFlight.current) await inFlight.current;
      const run = saveOnce(opts);
      inFlight.current = run;
      try {
        return await run;
      } finally {
        if (inFlight.current === run) inFlight.current = null;
      }
    },
    [saveOnce],
  );

  const retryDelay = () => RETRY_MS[Math.min(failures.current, RETRY_MS.length) - 1] ?? RETRY_MS[0];

  // Debounced autosave after each change (and retry after failures).
  useEffect(() => {
    const s = useEditor.getState();
    if (!s.doc || s.editSeq === s.savedSeq || s.saveStatus === 'conflict') return;
    window.clearTimeout(timer.current);
    // While saves are failing, each change is kept in this browser straight away instead of waiting for the next retry.
    if (failures.current) writeBackup(s.doc, s.revision);
    const delay = failures.current ? retryDelay() : DEBOUNCE_MS;
    timer.current = window.setTimeout(async () => {
      await saveNow();
      const after = useEditor.getState();
      // Changes made while saving, or a failed save: schedule another pass.
      if (after.editSeq !== after.savedSeq && after.saveStatus !== 'conflict') {
        timer.current = window.setTimeout(() => void saveNow(), failures.current ? retryDelay() : DEBOUNCE_MS);
      }
    }, delay);
    return () => window.clearTimeout(timer.current);
  }, [editSeq, saveNow]);

  // Back online: save right away rather than waiting out the retry timer.
  useEffect(() => {
    const onOnline = () => {
      const s = useEditor.getState();
      if (!s.doc || s.editSeq === s.savedSeq || s.saveStatus === 'conflict') return;
      window.clearTimeout(timer.current);
      void saveNow().then(() => {
        const after = useEditor.getState();
        if (after.editSeq !== after.savedSeq && after.saveStatus !== 'conflict')
          timer.current = window.setTimeout(() => void saveNow(), failures.current ? retryDelay() : DEBOUNCE_MS);
      });
    };
    const onOffline = () => {
      const s = useEditor.getState();
      if (s.saveStatus === 'failed') s.setSaveState({ status: 'failed', error: OFFLINE });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [saveNow]);

  // Another window or manager saved: while nothing here is unsaved, show their
  // version instead of letting this editor carry on from an old copy (which
  // would end in a conflict at the first change).
  useEffect(() => {
    if (!repo.getRevision || checkElsewhereMs <= 0) return;
    let checking = false;
    const idle = () => {
      const s = useEditor.getState();
      return !!s.doc && s.saveStatus === 'saved' && s.editSeq === s.savedSeq && !inFlight.current && !busyEditing();
    };
    const check = async () => {
      if (checking || document.visibilityState === 'hidden' || !idle()) return;
      checking = true;
      try {
        const id = useEditor.getState().doc!.id;
        const rev = await repo.getRevision!(id);
        if (rev === null || rev <= useEditor.getState().revision || !idle()) return;
        const theirs = await repo.getMap(id);
        const s = useEditor.getState();
        if (!theirs || s.doc?.id !== id || theirs.revision <= s.revision || !idle()) return;
        s.replaceDoc(theirs, { markSaved: true });
        s.setSaveState({ status: 'saved', revision: theirs.revision, error: null });
        clearBackup(id);
        s.notify({ tone: 'info', message: 'This map was just saved in another window or by another manager. You’re now seeing the latest version.' });
      } catch {
        /* offline or signed out: the next save says so */
      } finally {
        checking = false;
      }
    };
    const interval = window.setInterval(check, checkElsewhereMs);
    const onShow = () => void check();
    const onVisible = () => document.visibilityState === 'visible' && void check();
    window.addEventListener('focus', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [repo, checkElsewhereMs]);

  // Warn before leaving with unsaved work, and keep a copy in this browser in
  // case they leave anyway (a refresh within a second of an edit, a closed
  // tab, a phone killing the page, or being signed out mid-edit). Opening the
  // map again offers to recover it.
  useEffect(() => {
    const unsaved = () => {
      const s = useEditor.getState();
      return s.doc && (s.editSeq !== s.savedSeq || s.saveStatus === 'conflict') ? s : null;
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = unsaved();
      if (s) {
        writeBackup(s.doc!, s.revision);
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onHide = () => {
      const s = unsaved();
      if (s) writeBackup(s.doc!, s.revision);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, []);

  /** Resolve a conflict by keeping this editor's version; the other version goes to history. */
  const keepMine = useCallback(async () => {
    const s = useEditor.getState();
    if (!s.doc || !s.conflict) return;
    try {
      await repo.saveVersion(s.conflict, 'conflict', 'Other changes (replaced by yours)');
    } catch {
      s.notify({ tone: 'error', message: 'Couldn’t reach the server to keep the other version. Check your connection and try again.' });
      return;
    }
    s.setSaveState({ status: 'unsaved', revision: s.conflict.revision, conflict: null, error: null });
    await saveNow();
  }, [repo, saveNow]);

  /** Resolve a conflict by loading the other version; this editor's version goes to history. */
  const useTheirs = useCallback(async () => {
    const s = useEditor.getState();
    if (!s.doc || !s.conflict) return;
    try {
      await repo.saveVersion({ ...s.doc, revision: s.revision }, 'conflict', 'Your changes (replaced during a conflict)');
    } catch {
      s.notify({ tone: 'error', message: 'Couldn’t reach the server to keep your version in history. Check your connection and try again.' });
      return;
    }
    const theirs = s.conflict;
    s.setSaveState({ status: 'saved', revision: theirs.revision, conflict: null, error: null });
    s.replaceDoc(theirs, { markSaved: true });
    sent.current = [];
    clearBackup(theirs.id);
  }, [repo]);

  return { saveNow, keepMine, useTheirs };
}
