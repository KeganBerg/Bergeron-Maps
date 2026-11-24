import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb } from './db';

const opts = { flowType: 'pkce' as const, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false };

describe('createDb', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('sends the public key when nobody is signed in, and the person’s token once they are', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers) });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const db = createDb('https://abcd.supabase.co', 'anon-key', opts);
    await db.from('maps').select('id');
    expect(calls[0].url).toBe('https://abcd.supabase.co/rest/v1/maps?select=id');
    expect(calls[0].headers.get('apikey')).toBe('anon-key');
    expect(calls[0].headers.get('Authorization')).toBe('Bearer anon-key');

    // A session saved under supabase-js's storage key (from before this client) is picked up.
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-abcd-auth-token', JSON.stringify({ access_token: 'user-token', refresh_token: 'r', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: { id: 'u1' } }));
    const signedIn = createDb('https://abcd.supabase.co', 'anon-key', opts);
    await signedIn.rpc('is_platform_admin');
    const rpc = calls.find((c) => c.url.endsWith('/rest/v1/rpc/is_platform_admin'))!;
    expect(rpc.headers.get('Authorization')).toBe('Bearer user-token');
    expect(rpc.headers.get('apikey')).toBe('anon-key');
  });

  it('uploads map pictures to file storage with the person’s token, and counts an existing file as done', async () => {
    const calls: { url: string; method?: string; headers: Headers }[] = [];
    let status = 200;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method, headers: new Headers(init?.headers) });
      const body = { 200: '{"Key":"x"}', 409: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' }[status]
        ?? '{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}';
      return new Response(body, { status });
    }));
    const db = createDb('https://abcd.supabase.co', 'anon-key', opts);
    await db.storage.upload('map-images', 'co/abc.png', new Blob(['x'], { type: 'image/png' }), 'image/png');
    expect(calls[0].url).toBe('https://abcd.supabase.co/storage/v1/object/map-images/co/abc.png');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.get('content-type')).toBe('image/png');
    expect(calls[0].headers.get('x-upsert')).toBe('false');
    expect(calls[0].headers.get('Authorization')).toBe('Bearer anon-key');
    status = 409;
    await expect(db.storage.upload('map-images', 'co/abc.png', new Blob(['x']), 'image/png')).resolves.toBeUndefined();
    status = 403;
    await expect(db.storage.upload('map-images', 'co/abc.png', new Blob(['x']), 'image/png')).rejects.toThrow();
    expect(db.storage.publicUrl('map-images', 'co/abc.png')).toBe('https://abcd.supabase.co/storage/v1/object/public/map-images/co/abc.png');
  });
});
