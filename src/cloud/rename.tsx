import { useState } from 'react';
import { cleanName, NAME_MAX, nameProblem } from '../model/names';
import { friendly, supabase } from './client';

/**
 * Renames a company or a site. Row-level security decides who may: Bergeron
 * Maps admins, the company's account lead and its regional managers (see the
 * companies_rename and facilities_update policies). A refused rename changes
 * no rows, so an empty result means "not allowed" rather than success.
 * Site links (slugs) stay as they are, so printed QR signs keep working.
 */
export async function renameCompanyOrSite(kind: 'company' | 'site', id: string, name: string): Promise<string | null> {
  const table = kind === 'company' ? 'companies' : 'facilities';
  const r = await supabase!.from(table).update({ name: cleanName(name) }).eq('id', id).select('id');
  if (r.error) return friendly(r.error);
  if (!r.data?.length) return `Only the account lead, regional managers and Bergeron Maps can rename ${kind === 'company' ? 'the company' : 'sites'}.`;
  return null;
}

/**
 * The inline "type a new name, Save or Cancel" form used on Sites and people
 * and on All accounts. It checks the name first (model/names.ts), then saves.
 */
export function RenameForm({ kind, id, current, others, onDone, onCancel }: {
  kind: 'company' | 'site'; id: string; current: string; others?: readonly string[];
  /** Called with the saved name once the database has it. */
  onDone: (name: string) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState(current);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const name = cleanName(value);
    if (name === current) return onCancel();
    const p = nameProblem(name, kind, others);
    if (p) return setProblem(p);
    setBusy(true);
    const err = await renameCompanyOrSite(kind, id, name);
    setBusy(false);
    if (err) return setProblem(err);
    onDone(name);
  };
  return (
    <form className="link-edit rename-form" onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid={`rename-${kind}-form`}>
      <input autoFocus value={value} maxLength={NAME_MAX} onChange={(e) => { setValue(e.target.value); setProblem(null); }}
        aria-label={kind === 'company' ? 'Company name' : 'Site name'} aria-invalid={!!problem} data-testid={`rename-${kind}-input`} />
      <button className="btn small primary" disabled={busy}>Save</button>
      <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
      {problem && <span className="error-text small link-warning" role="alert">{problem}</span>}
    </form>
  );
}
