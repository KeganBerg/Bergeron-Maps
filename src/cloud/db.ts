import { GoTrueClient as AuthClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { observedFetch } from '../errors/report';

/**
 * The two parts of Supabase the app uses: sign-in (auth) and the database
 * (tables and SQL functions). supabase-js's createClient also builds the
 * realtime, file storage and edge function clients, which the app never uses
 * but every visitor downloaded (about 85 KB of script). This client is wired
 * the same way createClient wires those two parts: same sign-in storage key
 * (so nobody is signed out by the switch), same headers, and every database
 * request carries the signed-in person's token, or the public key when
 * nobody is signed in.
 */
export interface Db {
  auth: AuthClient;
  from: PostgrestClient['from'];
  rpc: PostgrestClient['rpc'];
}

export function createDb(url: string, key: string, auth: { flowType: 'pkce' | 'implicit'; persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl: boolean }): Db {
  const base = new URL(url.trim().endsWith('/') ? url.trim() : url.trim() + '/');
  const headers = { 'X-Client-Info': 'bergeron-maps' };
  const authClient = new AuthClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key, ...headers },
    // supabase-js's default key: sessions saved before this client existed still load.
    storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
    // Server errors and the sign-in email limit are reported (docs/MONITORING.md); nothing else changes.
    fetch: observedFetch('sign-in'),
    ...auth,
  });
  const dbFetch = observedFetch('database');
  const fetchWithAuth: typeof fetch = async (input, init) => {
    const { data } = await authClient.getSession();
    const h = new Headers(init?.headers);
    if (!h.has('apikey')) h.set('apikey', key);
    if (!h.has('Authorization')) h.set('Authorization', `Bearer ${data.session?.access_token ?? key}`);
    return dbFetch(input, { ...init, headers: h });
  };
  const rest = new PostgrestClient(new URL('rest/v1', base).href, { headers, schema: 'public', fetch: fetchWithAuth });
  return {
    auth: authClient,
    from: rest.from.bind(rest) as PostgrestClient['from'],
    rpc: rest.rpc.bind(rest) as PostgrestClient['rpc'],
  };
}
