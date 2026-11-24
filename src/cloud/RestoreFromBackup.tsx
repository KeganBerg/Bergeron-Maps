import { useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { backupCounts, findMissing, parseBackup, restoreCompany, restoreMissing,
  BACKUP_EXTENSION, type BackupFile, type MissingParts, type RestoreMissingResult, type RestoreResult } from './backup';
import { friendly, supabase } from './client';
import { siteLink } from './TeamPage';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null);

/**
 * All accounts → Restore from backup: pick a backup file, choose companies, restore.
 * A deleted company comes back whole; a company that still exists gets back only
 * the sites and maps it has lost since the backup (findMissing / restoreMissing).
 */
export function RestoreFromBackup({ live, working, setWorking, setError, setNote, onRestored }: {
  /** Ids of the companies in All accounts now. */
  live: Set<string>;
  working: boolean;
  setWorking: (text: string | null) => void;
  setError: (text: string | null) => void;
  setNote: (text: string | null) => void;
  onRestored: () => Promise<void>;
}) {
  const [restoring, setRestoring] = useState<{
    file: BackupFile; fileName: string; picked: Set<string>;
    /** For companies that still exist: what the backup has that the database no longer does (null while checking). */
    missing: Record<string, MissingParts | null>;
  } | null>(null);
  const [restored, setRestored] = useState<{ results: RestoreResult[]; partial: RestoreMissingResult[]; failed: { name: string; error: string }[] } | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const pickBackup = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setNote(null);
    try {
      const file = parseBackup(await f.text());
      if (!file.companies.length) return setError('That backup has no companies in it.');
      const existing = file.companies.filter((c) => live.has(c.id));
      setRestoring({ file, fileName: f.name, picked: new Set(file.companies.filter((c) => !live.has(c.id)).map((c) => c.id)),
        missing: Object.fromEntries(existing.map((c) => [c.id, null])) });
      // Companies still here can get back the maps and sites they lost since the backup.
      for (const c of existing) {
        let m: MissingParts;
        try {
          m = await findMissing(supabase!, c);
        } catch {
          m = { sites: 0, maps: 0, trashed: 0 };
        }
        const has = m.sites + m.maps + m.trashed > 0;
        setRestoring((r) => r && ({ ...r, missing: { ...r.missing, [c.id]: m }, picked: has ? new Set([...r.picked, c.id]) : r.picked }));
      }
    } catch (e) {
      setError(friendly(e));
    }
  };

  const runRestore = async () => {
    if (!restoring) return;
    const chosen = restoring.file.companies.filter((c) => restoring.picked.has(c.id));
    setRestoring(null);
    setError(null);
    setNote(null);
    const results: RestoreResult[] = [];
    const partial: RestoreMissingResult[] = [];
    const failed: { name: string; error: string }[] = [];
    for (const c of chosen) {
      try {
        if (c.id in restoring.missing) partial.push(await restoreMissing(supabase!, c, setWorking));
        else results.push(await restoreCompany(supabase!, c, setWorking));
      } catch (e) {
        failed.push({ name: c.name, error: friendly(e) });
      }
    }
    setWorking(null);
    setRestored({ results, partial, failed });
    await onRestored();
  };

  return (
    <>
      <button className="btn small" disabled={working} onClick={() => restoreInput.current?.click()} data-testid="restore-backup">
        Restore from backup…
      </button>
      <input ref={restoreInput} type="file" hidden accept={`${BACKUP_EXTENSION},.json,application/json`} data-testid="restore-file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pickBackup(f); }} />

      {restoring && (() => {
        const n = restoring.picked.size;
        return (
          <Dialog title="Restore from backup" wide onClose={() => setRestoring(null)}
            footer={<>
              <button className="btn" onClick={() => setRestoring(null)}>Cancel</button>
              <button className="btn primary" disabled={n === 0} onClick={() => void runRestore()} data-testid="restore-confirm">
                {n === 0 ? 'Restore' : `Restore ${plural(n, 'company', 'companies')}`}
              </button>
            </>}>
            <p className="muted small">
              {restoring.fileName} · made {when(restoring.file.exportedAt)}{restoring.file.exportedBy ? ` by ${restoring.file.exportedBy}` : ''}
            </p>
            <ul className="restore-list">
              {restoring.file.companies.map((c) => {
                const k = backupCounts(c);
                const exists = live.has(c.id);
                const miss = restoring.missing[c.id];
                const missing = miss ? miss.sites + miss.maps + miss.trashed : 0;
                return (
                  <li key={c.id}>
                    <label>
                      <input type="checkbox" disabled={exists && missing === 0} checked={restoring.picked.has(c.id)} data-testid={`restore-pick-${c.name}`}
                        onChange={(e) => { const picked = new Set(restoring.picked); if (e.target.checked) picked.add(c.id); else picked.delete(c.id); setRestoring({ ...restoring, picked }); }} />
                      <span>
                        <strong>{c.name}</strong>
                        <span className="muted small">
                          {exists && miss === null && 'Still in All accounts. Checking what it’s missing… '}
                          {exists && miss && missing === 0 && 'Still in All accounts, and nothing in this backup is missing from it. '}
                          {exists && miss && missing > 0 && (
                            <span data-testid={`restore-missing-${c.name}`}>Still in All accounts. Brings back only what it’s missing:{' '}
                              {[miss.sites && plural(miss.sites, 'site'), miss.maps && plural(miss.maps, 'map'),
                                miss.trashed && `${miss.trashed} from Recently deleted`].filter(Boolean).join(', ')}. </span>
                          )}
                          {exists ? 'The backup has ' : ''}{plural(k.sites, 'site')}, {plural(k.people, 'person', 'people')}, {plural(k.maps, 'map')}
                          {k.trashed ? ` and ${k.trashed} in Recently deleted` : ''}, {plural(k.versions, 'saved version')}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="muted small">
              Everything comes back as it was in the backup, with the same site links and join codes (unless another site has taken one since).
              People who still have a sign-in get their access back right away; the rest get it when they next sign in.
              For a company that is still here, only its missing sites and maps come back; nothing it has now is changed.
            </p>
          </Dialog>
        );
      })()}

      {restored && (
        <Dialog title={restored.failed.length ? 'Restore finished with problems' : 'Restore finished'} onClose={() => setRestored(null)}
          footer={<button className="btn primary" onClick={() => setRestored(null)}>Done</button>}>
          <div data-testid="restore-result">
            {restored.results.map((r) => (
              <div key={r.name} className="restore-result">
                <p><strong>{r.name}</strong> is back: {plural(r.sites, 'site')}, {plural(r.maps, 'map')} ({r.published} published),
                  {' '}{plural(r.members + r.invited, 'person', 'people')} with access{r.invited ? ` (${r.invited} once they sign in)` : ''},
                  {' '}{plural(r.versions, 'saved version')}.</p>
                {r.slug_changes.map((x) => (
                  <p key={x.site} className="muted small">{x.site}’s link was taken by another site, so it is now {siteLink(x.now)}.</p>
                ))}
                {r.moved_to_trash > 0 && <p className="muted small">{plural(r.moved_to_trash, 'map')} didn’t fit in its site’s 5 slots and went to Recently deleted.</p>}
                {r.versionErrors > 0 && <p className="error-text">{plural(r.versionErrors, 'saved version')} couldn’t be restored. The maps themselves are fine.</p>}
              </div>
            ))}
            {restored.partial.map((r) => (
              <div key={r.name} className="restore-result">
                <p><strong>{r.name}</strong>: {r.sites + r.maps === 0 ? 'nothing was missing.'
                  : `${[r.sites && plural(r.sites, 'site'), r.maps && `${plural(r.maps, 'map')} (${r.published} published)`].filter(Boolean).join(' and ')} back`
                    + `${r.access ? `, access back for ${plural(r.access, 'person', 'people')}` : ''}, ${plural(r.versions, 'saved version')}.`}</p>
                {r.slug_changes.map((x) => (
                  <p key={x.site} className="muted small">{x.site}’s link was taken by another site, so it is now {siteLink(x.now)}.</p>
                ))}
                {r.moved_to_trash > 0 && <p className="muted small">{plural(r.moved_to_trash, 'map')} didn’t fit in its site’s 5 slots and went to Recently deleted.</p>}
                {r.versionErrors > 0 && <p className="error-text">{plural(r.versionErrors, 'saved version')} couldn’t be restored. The maps themselves are fine.</p>}
              </div>
            ))}
            {restored.failed.map((f) => (
              <p key={f.name} className="error-text"><strong>{f.name}</strong> wasn’t restored: {f.error}</p>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
