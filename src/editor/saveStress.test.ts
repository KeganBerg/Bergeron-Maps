/**
 * Saving under stress (2026-11-19 audit): dropped and slow connections, being
 * offline, a tab closing mid-save, and two people on one map. Each test sets
 * up the bad moment on purpose and checks that no work is lost and nothing is
 * reported that didn't happen.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMap } from '../model/factory';
import type { MapDocument } from '../model/types';
import { IndexedDbRepository } from '../storage/indexedDbRepository';
import { backupKey, clearBackup, flushBackups, readBackup, sameMapContent, writeBackup } from '../storage/unsavedBackup';
import { useEditor } from './store';
import { useAutosave, type AutosaveOptions } from './useAutosave';

type Mode = 'ok' | 'lost-reply' | 'offline' | 'hang';

/** Browser storage standing in for the server, with a switch for how the next saves go wrong. */
class FlakyRepo extends IndexedDbRepository {
  mode: Mode = 'ok';
  saves = 0;
  /** Saves left hanging ('hang'): call one to let it reach storage late. */
  hung: Array<() => Promise<void>> = [];
  async saveMap(doc: MapDocument, base: number): Promise<MapDocument> {
    this.saves++;
    if (this.mode === 'offline') throw new TypeError('Failed to fetch');
    if (this.mode === 'lost-reply') {
      // The server got it and saved it; the answer never made it back.
      await super.saveMap(doc, base);
      throw new TypeError('Failed to fetch');
    }
    if (this.mode === 'hang') {
      return new Promise<MapDocument>((resolve, reject) => {
        this.hung.push(() => super.saveMap(doc, base).then(resolve, reject));
      });
    }
    return super.saveMap(doc, base);
  }
}

let n = 0;
async function setup(opts: AutosaveOptions = {}) {
  const repo = new FlakyRepo(`stress-${++n}`);
  const doc = await repo.createMap(createMap('Garage'));
  useEditor.getState().load(doc);
  const hook = renderHook(() => useAutosave(repo, { checkElsewhereMs: 0, ...opts }));
  return { repo, doc, hook };
}

const state = () => useEditor.getState();
const save = async (hook: { result: { current: ReturnType<typeof useAutosave> } }) => {
  let ok = false;
  await act(async () => {
    ok = await hook.result.current.saveNow();
  });
  return ok;
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('a dropped connection mid-save', () => {
  it('a save that landed but whose answer was lost is not shown as “changed somewhere else”', async () => {
    const { repo, doc, hook } = await setup();
    state().renameMap('Level 1');
    repo.mode = 'lost-reply';
    expect(await save(hook)).toBe(false);
    expect(state().saveStatus).toBe('failed');
    // The connection comes back. The stored map is already our version (revision 2).
    repo.mode = 'ok';
    state().renameMap('Level 1 and 2');
    expect(await save(hook)).toBe(true);
    expect(state().saveStatus).toBe('saved');
    expect(state().conflict).toBeNull();
    const stored = await repo.getMap(doc.id);
    expect(stored!.name).toBe('Level 1 and 2');
    expect(state().revision).toBe(stored!.revision);
    hook.unmount();
  });

  it('…and when nothing changed since, the retry just confirms the save', async () => {
    const { repo, doc, hook } = await setup();
    state().renameMap('Only change');
    repo.mode = 'lost-reply';
    await save(hook);
    repo.mode = 'ok';
    const savesBefore = repo.saves;
    expect(await save(hook)).toBe(true);
    expect(repo.saves).toBe(savesBefore + 1);
    expect(state().saveStatus).toBe('saved');
    expect(state().revision).toBe((await repo.getMap(doc.id))!.revision);
    hook.unmount();
  });

  it('a real change from somewhere else is still reported as a conflict', async () => {
    const { repo, doc, hook } = await setup();
    await repo.saveMap({ ...doc, name: 'Other manager’s name' }, doc.revision);
    state().renameMap('My name');
    expect(await save(hook)).toBe(false);
    expect(state().saveStatus).toBe('conflict');
    expect(state().conflict!.name).toBe('Other manager’s name');
    hook.unmount();
  });

  it('a lost reply followed by someone else’s save is still a conflict', async () => {
    const { repo, doc, hook } = await setup();
    state().renameMap('Mine');
    repo.mode = 'lost-reply';
    await save(hook);
    repo.mode = 'ok';
    const now = (await repo.getMap(doc.id))!;
    await repo.saveMap({ ...now, name: 'Theirs' }, now.revision);
    state().renameMap('Mine, again');
    expect(await save(hook)).toBe(false);
    expect(state().saveStatus).toBe('conflict');
    hook.unmount();
  });
});

describe('a save that never answers', () => {
  it('times out instead of holding up every later save, and keeps a copy in this browser', async () => {
    const { repo, doc, hook } = await setup({ saveTimeoutMs: 50, slowSaveMs: 10 });
    state().renameMap('Sent into the void');
    repo.mode = 'hang';
    expect(await save(hook)).toBe(false);
    expect(state().saveStatus).toBe('failed');
    expect(state().saveError).toMatch(/too slow/);
    expect((await readBackup(doc.id))!.doc.name).toBe('Sent into the void');

    // The hung request reaches the server late, before the next save.
    await repo.hung[0]();
    repo.mode = 'ok';
    state().renameMap('Newest');
    expect(await save(hook)).toBe(true);
    expect(state().saveStatus).toBe('saved');
    expect((await repo.getMap(doc.id))!.name).toBe('Newest');
    await flushBackups();
    expect(await readBackup(doc.id)).toBeNull();
    hook.unmount();
  });

  it('a hung request that lands after a newer save changes nothing', async () => {
    const { repo, doc, hook } = await setup({ saveTimeoutMs: 50 });
    state().renameMap('Old');
    repo.mode = 'hang';
    await save(hook);
    repo.mode = 'ok';
    state().renameMap('New');
    expect(await save(hook)).toBe(true);
    await repo.hung[0]().catch(() => undefined);
    expect((await repo.getMap(doc.id))!.name).toBe('New');
    hook.unmount();
  });

  it('a slow save keeps a copy in this browser while it runs, in case the tab closes or crashes', async () => {
    const { repo, doc, hook } = await setup({ slowSaveMs: 10 });
    state().renameMap('Slow');
    repo.mode = 'hang';
    let done!: Promise<boolean>;
    act(() => {
      done = hook.result.current.saveNow();
    });
    await waitFor(() => expect(localStorage.getItem(backupKey(doc.id))).not.toBeNull());
    const b = JSON.parse(localStorage.getItem(backupKey(doc.id))!);
    expect(b.doc.name).toBe('Slow');
    expect(b.baseRevision).toBe(doc.revision);
    await act(async () => {
      await repo.hung[0]();
      await done;
    });
    expect(state().saveStatus).toBe('saved');
    expect(localStorage.getItem(backupKey(doc.id))).toBeNull();
    hook.unmount();
  });
});

describe('offline', () => {
  it('says so plainly, keeps each change in this browser, and saves as soon as the connection is back', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { repo, doc, hook } = await setup();
    repo.mode = 'offline';
    state().renameMap('Offline edit');
    await save(hook);
    expect(state().saveStatus).toBe('failed');
    expect(state().saveError).toMatch(/offline/i);
    // Further changes go straight to the browser copy, not only at the next retry.
    act(() => state().renameMap('Second offline edit'));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(backupKey(doc.id))!).doc.name).toBe('Second offline edit'));

    repo.mode = 'ok';
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    // Well before the 5-second retry.
    await waitFor(() => expect(state().saveStatus).toBe('saved'), { timeout: 1500 });
    expect((await repo.getMap(doc.id))!.name).toBe('Second offline edit');
    hook.unmount();
  });
});

describe('two people on one map', () => {
  it('an editor with nothing unsaved picks up a save made elsewhere when it gets focus', async () => {
    const { repo, doc, hook } = await setup({ checkElsewhereMs: 60_000 });
    hook.unmount();
    const live = renderHook(() => useAutosave(repo, { checkElsewhereMs: 60_000 }));
    await repo.saveMap({ ...doc, name: 'Saved by the other manager' }, doc.revision);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(state().doc!.name).toBe('Saved by the other manager'));
    expect(state().revision).toBe(2);
    expect(state().saveStatus).toBe('saved');
    expect(state().notices.some((x) => /another window or by another manager/.test(x.message))).toBe(true);
    live.unmount();
  });

  it('…but never swaps the map under unsaved changes (those go through the conflict choice instead)', async () => {
    const { repo, doc, hook } = await setup({ checkElsewhereMs: 60_000 });
    await repo.saveMap({ ...doc, name: 'Theirs' }, doc.revision);
    act(() => state().renameMap('Mine, not saved yet'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(state().doc!.name).toBe('Mine, not saved yet');
    hook.unmount();
  });

  it('undo while a conflict is open keeps autosave paused', async () => {
    const { repo, doc, hook } = await setup();
    await repo.saveMap({ ...doc, name: 'Theirs' }, doc.revision);
    state().renameMap('Mine');
    await save(hook);
    expect(state().saveStatus).toBe('conflict');
    act(() => state().undo());
    expect(state().saveStatus).toBe('conflict');
    hook.unmount();
  });

  it('“Keep my version” keeps theirs in Version history, then saves mine', async () => {
    const { repo, doc, hook } = await setup();
    await repo.saveMap({ ...doc, name: 'Theirs' }, doc.revision);
    state().renameMap('Mine');
    await save(hook);
    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(state().saveStatus).toBe('saved');
    expect((await repo.getMap(doc.id))!.name).toBe('Mine');
    const versions = await repo.listVersions(doc.id);
    const kept = versions.find((v) => v.reason === 'conflict');
    expect((await repo.getVersion(kept!.id))!.name).toBe('Theirs');
    hook.unmount();
  });

  it('a conflict choice made while offline says so and leaves the choice open', async () => {
    const { repo, doc, hook } = await setup();
    await repo.saveMap({ ...doc, name: 'Theirs' }, doc.revision);
    state().renameMap('Mine');
    await save(hook);
    vi.spyOn(repo, 'saveVersion').mockRejectedValue(new TypeError('Failed to fetch'));
    await act(async () => {
      await hook.result.current.useTheirs();
    });
    expect(state().saveStatus).toBe('conflict');
    expect(state().doc!.name).toBe('Mine');
    expect(state().notices.some((x) => x.tone === 'error')).toBe(true);
    hook.unmount();
  });
});

describe('the copy kept in this browser', () => {
  it('a map too big for localStorage is kept in IndexedDB instead, and an older small copy is not left behind', async () => {
    const doc = createMap('Huge garage');
    writeBackup({ ...doc, name: 'small, older' }, 1);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    writeBackup({ ...doc, name: 'big, newer' }, 1);
    setItem.mockRestore();
    expect(localStorage.getItem(backupKey(doc.id))).toBeNull();
    expect((await readBackup(doc.id))!.doc.name).toBe('big, newer');
    // Back under the limit: the small copy wins and the big one is removed.
    writeBackup({ ...doc, name: 'small again' }, 2);
    await flushBackups();
    expect((await readBackup(doc.id))!.doc.name).toBe('small again');
    clearBackup(doc.id);
    expect(await readBackup(doc.id)).toBeNull();
  });

  it('compares maps by content, whatever order storage hands the fields back in', () => {
    const a = createMap('Lot');
    // The database sorts JSON keys: same content, different order.
    const sorted = Object.fromEntries(Object.entries(a).sort(([x], [y]) => y.localeCompare(x)));
    const reordered = JSON.parse(JSON.stringify({ ...sorted, revision: 9, updatedAt: 'later' }));
    expect(sameMapContent(a, reordered)).toBe(true);
    expect(sameMapContent(a, { ...a, extra: undefined } as MapDocument)).toBe(true);
    expect(sameMapContent(a, { ...a, name: 'Other' })).toBe(false);
  });
});
