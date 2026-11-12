import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMap } from '../model/factory';
import { IndexedDbRepository } from '../storage/indexedDbRepository';
import { useEditor } from './store';
import { backupKey, useAutosave } from './useAutosave';

/** Browser storage whose saves take a while, like a slow connection. */
class SlowRepo extends IndexedDbRepository {
  saves = 0;
  async saveMap(...args: Parameters<IndexedDbRepository['saveMap']>) {
    this.saves++;
    await new Promise((r) => setTimeout(r, 60));
    return super.saveMap(...args);
  }
}

let n = 0;
async function setup() {
  const repo = new SlowRepo(`autosave-${++n}`);
  const doc = await repo.createMap(createMap('Lot'));
  useEditor.getState().load(doc);
  const hook = renderHook(() => useAutosave(repo));
  return { repo, doc, hook };
}

describe('autosave', () => {
  it('Save pressed while an autosave is running waits for it, then saves the newer change', async () => {
    const { repo, doc, hook } = await setup();
    useEditor.getState().renameMap('First');
    let first!: Promise<boolean>;
    act(() => { first = hook.result.current.saveNow(); });
    // A second change lands while the first save is still on its way.
    useEditor.getState().renameMap('Second');
    let ok = false;
    await act(async () => { ok = await hook.result.current.saveNow({ version: 'manual' }); await first; });
    expect(ok).toBe(true);
    const s = useEditor.getState();
    expect(s.editSeq).toBe(s.savedSeq);
    expect((await repo.getMap(doc.id))!.name).toBe('Second');
    expect((await repo.listVersions(doc.id)).filter((v) => v.reason === 'manual')).toHaveLength(1);
    hook.unmount();
  });

  it('keeps a copy in this browser when the editor closes with unsaved changes', async () => {
    const { doc, hook } = await setup();
    localStorage.removeItem(backupKey(doc.id));
    useEditor.getState().renameMap('Not saved yet');
    hook.unmount();
    expect(JSON.parse(localStorage.getItem(backupKey(doc.id))!).doc.name).toBe('Not saved yet');
  });
});
