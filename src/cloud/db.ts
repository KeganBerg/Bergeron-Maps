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
  /** Map pictures in Supabase Storage (see cloud/mapImages.ts). */
  storage: Storage;
}

/** The few file storage calls the app makes, straight to Supabase's Storage API. */
export interface Storage {
  /** The address anyone can load a file in a public bucket from. */
  publicUrl(bucket: string, path: string): string;
  /** Uploads a file. A file already stored at that path counts as done (paths name the content). */
  upload(bucket: string, path: string, body: Blob, contentType: string): Promise<void>;
  /** Names of the files in a folder (path without the bucket), up to 1,000 at a time. */
  list(bucket: string, folder: string): Promise<string[]>;
  /** Deletes files by path. */
  remove(bucket: string, paths: string[]): Promise<void>;
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
    storage: storageClient(new URL('storage/v1/', base).href, (input, init) => fetchWithAuth(input, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } })),
  };
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

async function storageError(res: Response): Promise<Error> {
  let message = `File storage answered ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    message = body.message || body.error || message;
  } catch {
    /* not JSON */
  }
  return new Error(message);
}

function storageClient(root: string, f: typeof fetch): Storage {
  return {
    publicUrl: (bucket, path) => `${root}object/public/${bucket}/${encodePath(path)}`,
    async upload(bucket, path, body, contentType) {
      const res = await f(`${root}object/${bucket}/${encodePath(path)}`, {
        method: 'POST',
        body,
        // The name is the picture's fingerprint, so a stored file never changes: browsers may keep it for a year.
        headers: { 'content-type': contentType, 'cache-control': 'max-age=31536000', 'x-upsert': 'false' },
      });
      if (res.ok) return;
      const err = await storageError(res);
      // Already there (409, or 400 with "already exists" on some versions): same name, same picture.
      if (res.status === 409 || /already exists|duplicate/i.test(err.message)) return;
      throw err;
    },
    async list(bucket, folder) {
      const res = await f(`${root}object/list/${bucket}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: folder, limit: 1000, offset: 0 }),
      });
      if (!res.ok) throw await storageError(res);
      return ((await res.json()) as { name: string }[]).map((o) => o.name);
    },
    async remove(bucket, paths) {
      if (!paths.length) return;
      const res = await f(`${root}object/${bucket}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) throw await storageError(res);
    },
  };
}
