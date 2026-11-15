import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackup, serializeBackup, versionBatches, type BackupCompany, type BackupVersion } from './backup';

const company: BackupCompany = {
  id: 'c0000000-0000-4000-8000-000000000001', name: 'Company / East', created_at: '2026-11-01T00:00:00Z', max_sites: 2, exported_at: '2026-11-12T00:00:00Z',
  sites: [], people: [],
  maps: [{ id: 'a0000000-0000-4000-8000-000000000001', facility_id: 'f', name: 'Garage', slot: 1, is_public: false, deleted_at: null,
    created_at: '', updated_at: '', revision: 1, draft: { floors: [] }, published: null, versions: [] }],
};

describe('account backups', () => {
  it('round-trips and names the file after the company and day', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    const file = parseBackup(serializeBackup([company], 'admin@example.com', now));
    expect(file.companies[0]).toEqual(company);
    expect(file.exportedBy).toBe('admin@example.com');
    expect(backupFileName([company], now)).toBe('Company-East-backup-2026-11-12.bmbackup.json');
    expect(backupFileName([company, company], now)).toBe('All-accounts-backup-2026-11-12.bmbackup.json');
  });

  it('refuses map files, other JSON, newer formats and damaged companies with a plain message', () => {
    expect(() => parseBackup('{"format":"bergeron-maps/map","map":{}}')).toThrow(/single map file/);
    expect(() => parseBackup('not json')).toThrow(/isn’t a Bergeron Maps backup/);
    expect(() => parseBackup('{"a":1}')).toThrow(/isn’t a Bergeron Maps backup/);
    expect(() => parseBackup(JSON.stringify({ format: 'bergeron-maps/backup', version: 99, companies: [] }))).toThrow(/newer version/);
    expect(() => parseBackup(JSON.stringify({ format: 'bergeron-maps/backup', version: 1, companies: [{ id: 'x', name: 'A' }] }))).toThrow(/damaged/);
    const noDraft = { ...company, maps: [{ ...company.maps[0], draft: null }] };
    expect(() => parseBackup(JSON.stringify({ format: 'bergeron-maps/backup', version: 1, companies: [noDraft] }))).toThrow(/map in it is incomplete/);
  });

  it('sends versions back in batches that stay under the size limit, never splitting one', () => {
    const v = (i: number, size: number): BackupVersion => ({ id: `v${i}`, created_at: '', reason: 'auto', label: '', revision: i, doc: { pad: 'x'.repeat(size) } });
    const list = [v(1, 400), v(2, 400), v(3, 400), v(4, 2000)];
    const batches = versionBatches(list, 1000);
    expect(batches.map((b) => b.map((x) => x.id))).toEqual([['v1', 'v2'], ['v3'], ['v4']]);
    expect(versionBatches([])).toEqual([]);
  });
});
