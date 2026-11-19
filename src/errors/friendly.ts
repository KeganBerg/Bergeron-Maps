/**
 * Turns an error into a sentence a manager or employee can act on. Messages
 * written for people (our SQL functions raise them) pass through; technical
 * ones that only mean "no connection" or "signed out" are replaced.
 */
export function friendly(e: unknown, fallback = 'Something went wrong. Check your connection and try again.'): string {
  const m = (e as { message?: string } | null)?.message;
  if (!m) return fallback;
  if (/row-level security|permission denied/i.test(m)) return 'You don’t have permission to do that.';
  // Chrome says "Failed to fetch", Firefox "NetworkError…", Safari (every iPhone) "Load failed".
  if (isNetworkMessage(m)) return 'Can’t reach the server. Check your connection and try again.';
  if (/JWT expired|invalid JWT|PGRST30[0-3]/i.test(m)) return 'Your sign-in expired. Reload the page to sign in again.';
  return m;
}

export const isNetworkMessage = (m: string) => /Failed to fetch|NetworkError|Load failed|Network request failed/i.test(m);
