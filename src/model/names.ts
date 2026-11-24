/**
 * Company and site names as people type them. The database allows 1 to 120
 * characters; this tidies what was typed and says why a name can't be saved,
 * before anything is sent.
 */
export const NAME_MAX = 120;

/** Trims the ends and folds runs of spaces (a pasted name often carries extras). */
export function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Why a new name can't be used, or null when it can. `others` are the names
 * already used beside it (the company's other sites), so two sites never
 * share a name and people can tell them apart in lists and access emails.
 */
export function nameProblem(value: string, kind: 'company' | 'site', others: readonly string[] = []): string | null {
  const name = cleanName(value);
  if (!name) return kind === 'company' ? 'Enter a company name.' : 'Enter a site name.';
  if (name.length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters or fewer.`;
  const lower = name.toLocaleLowerCase();
  if (others.some((o) => cleanName(o).toLocaleLowerCase() === lower)) return `Another site is already called “${name}”. Pick a name people can tell apart.`;
  return null;
}
