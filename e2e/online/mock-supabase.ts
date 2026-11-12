import type { Page, Route } from '@playwright/test';

/**
 * A stand-in for the Supabase server, so the online app's sign-in and access
 * screens can be tested in a browser. It mirrors what row-level security
 * returns for each person (tested for real against Postgres in
 * supabase/tests/rls.test.ts); here we test what the app does with it.
 */
export const MOCK_URL = 'https://mock.supabase.co';
const STORAGE_KEY = 'sb-mock-auth-token';

export type Role = 'owner' | 'manager' | 'employee';
interface Company { id: string; name: string }
interface Site { id: string; company_id: string; name: string; slug: string; code: string }
interface Member { user_id: string; email: string; company_id: string; role: Role; facility_ids: string[] | null }
export interface User { id: string; email: string; admin?: boolean }

export const COMPANY: Company = { id: 'c0000000-0000-4000-8000-000000000001', name: 'Company' };
export const OTHER_COMPANY: Company = { id: 'c0000000-0000-4000-8000-000000000002', name: 'Other Company' };
export const SITE_A: Site = { id: 'f0000000-0000-4000-8000-00000000000a', company_id: COMPANY.id, name: 'Site Name', slug: 'site-name', code: 'K7M2QX' };
export const SITE_B: Site = { id: 'f0000000-0000-4000-8000-00000000000b', company_id: COMPANY.id, name: 'Second Site', slug: 'second-site', code: 'P4R8TZ' };
export const SITE_C: Site = { id: 'f0000000-0000-4000-8000-00000000000c', company_id: OTHER_COMPANY.id, name: 'Other Site', slug: 'other-site', code: 'W3N6HJ' };

export const USERS = {
  admin: { id: 'u0000000-0000-4000-8000-000000000001', email: 'admin@example.com', admin: true },
  owner: { id: 'u0000000-0000-4000-8000-000000000002', email: 'owner@example.com' },
  siteManager: { id: 'u0000000-0000-4000-8000-000000000003', email: 'manager@example.com' },
  employee: { id: 'u0000000-0000-4000-8000-000000000004', email: 'employee@example.com' },
  newcomer: { id: 'u0000000-0000-4000-8000-000000000005', email: 'new@example.com' },
} satisfies Record<string, User>;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (u: User, exp: number) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp })}.sig`;
const userJson = (u: User) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: '2026-11-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' });

export function sessionFor(u: User, expiresInSec = 3600) {
  const expires_at = Math.floor(Date.now() / 1000) + expiresInSec;
  return { access_token: jwt(u, expires_at), token_type: 'bearer', expires_in: expiresInSec, expires_at, refresh_token: `refresh-${u.id}`, user: userJson(u) };
}

export class MockSupabase {
  companies = [COMPANY, OTHER_COMPANY];
  sites = [SITE_A, SITE_B, SITE_C];
  members: Member[] = [
    { user_id: USERS.owner.id, email: USERS.owner.email, company_id: COMPANY.id, role: 'owner', facility_ids: null },
    { user_id: USERS.siteManager.id, email: USERS.siteManager.email, company_id: COMPANY.id, role: 'manager', facility_ids: [SITE_A.id] },
    { user_id: USERS.employee.id, email: USERS.employee.email, company_id: COMPANY.id, role: 'employee', facility_ids: [SITE_A.id] },
  ];
  /** What the refresh endpoint does: 'ok' issues a new session, 'revoked' refuses the refresh token. */
  refresh: 'ok' | 'revoked' = 'ok';
  /** Set to make every data request answer 401 "JWT expired", as Supabase does for a stale token. */
  expireTokens = false;
  wrongCodes = 0;
  /** Map rows as the maps table holds them (draft = the map document). */
  maps: { id: string; company_id: string; facility_id: string; name: string; draft: Record<string, unknown>; revision: number; slot: number }[] = [];
  log: string[] = [];
  private users = new Map<string, User>(Object.values(USERS).map((u) => [u.id, u]));

  constructor(private page: Page) {}

  async install(as?: User, opts: { expiresInSec?: number } = {}) {
    await this.page.route(`${MOCK_URL}/**`, (route) => this.handle(route));
    if (as) {
      const s = sessionFor(as, opts.expiresInSec ?? 3600);
      await this.page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('bm.mockSeeded')) { localStorage.setItem(k, v); sessionStorage.setItem('bm.mockSeeded', '1'); } }, [STORAGE_KEY, JSON.stringify(s)]);
    }
  }

  private who(route: Route): User | null {
    const auth = route.request().headers()['authorization'] ?? '';
    const token = auth.replace(/^Bearer /, '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (p.role !== 'authenticated') return null;
      return this.users.get(p.sub) ?? null;
    } catch {
      return null;
    }
  }

  private memberOf(u: User) { return this.members.filter((m) => m.user_id === u.id); }
  private canSee(u: User, s: Site) {
    return !!u.admin || this.memberOf(u).some((m) => m.company_id === s.company_id && (m.facility_ids === null || m.facility_ids.includes(s.id)));
  }
  private canManage(u: User, s: Site) {
    return !!u.admin || this.memberOf(u).some((m) => m.company_id === s.company_id && m.role !== 'employee' && (m.facility_ids === null || m.facility_ids.includes(s.id)));
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    this.log.push(`${req.method()} ${path}${url.search}`);

    // ---- auth
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const { refresh_token } = req.postDataJSON() as { refresh_token: string };
      const u = this.users.get(refresh_token.replace(/^refresh-/, ''));
      if (this.refresh === 'revoked' || !u) return json({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400);
      this.expireTokens = false;
      return json(sessionFor(u));
    }
    if (path === '/auth/v1/otp') return json({});
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (path === '/auth/v1/user') {
      const u = this.who(route);
      return u ? json(userJson(u)) : json({ code: 401, msg: 'invalid JWT' }, 401);
    }

    // ---- data: every request needs a signed-in, unexpired token
    const u = this.who(route);
    if (this.expireTokens) return json({ code: 'PGRST301', message: 'JWT expired', details: null, hint: null }, 401);
    if (!u) return json({ code: '42501', message: 'permission denied', details: null, hint: null }, 401);
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const rows = (list: unknown[]) => (single ? (list.length ? json(list[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406)) : json(list));
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, '');

    if (path === '/rest/v1/memberships') {
      return rows(this.memberOf(u).map((m) => ({ company_id: m.company_id, role: m.role, facility_ids: m.facility_ids, companies: { name: this.companies.find((c) => c.id === m.company_id)!.name } })));
    }
    if (path === '/rest/v1/companies') {
      return rows(this.companies.filter((c) => u.admin || this.memberOf(u).some((m) => m.company_id === c.id)));
    }
    if (path === '/rest/v1/facilities' && req.method() === 'GET') {
      let list = this.sites.filter((s) => this.canSee(u, s));
      const id = eq('id'), slug = eq('slug'), company = eq('company_id');
      if (id) list = list.filter((s) => s.id === id);
      if (slug) list = list.filter((s) => s.slug === slug);
      if (company) list = list.filter((s) => s.company_id === company);
      return rows(list.map(({ code: _c, ...s }) => s));
    }
    if (path === '/rest/v1/maps') {
      let list = this.maps.filter((m) => this.canSee(u, this.sites.find((s) => s.id === m.facility_id)!));
      const id = eq('id');
      if (id) list = list.filter((m) => m.id === id);
      if (req.method() === 'PATCH') {
        const rev = Number(eq('revision'));
        list = list.filter((m) => m.revision === rev && this.canManage(u, this.sites.find((s) => s.id === m.facility_id)!));
        const body = req.postDataJSON() as { name: string; draft: Record<string, unknown> };
        for (const m of list) Object.assign(m, body, { revision: m.revision + 1 });
      }
      const now = '2026-11-12T00:00:00Z';
      return rows(list.map((m) => ({ ...m, created_at: now, updated_at: now, deleted_at: null, facilities: { name: this.sites.find((s) => s.id === m.facility_id)!.name }, published_maps: null })));
    }
    if (path === '/rest/v1/published_maps' || path === '/rest/v1/map_versions') return rows([]);

    const rpc = path.startsWith('/rest/v1/rpc/') ? path.slice('/rest/v1/rpc/'.length) : null;
    const args = (req.postDataJSON() ?? {}) as Record<string, string>;
    if (rpc === 'is_platform_admin') return json(!!u.admin);
    if (rpc === 'join_site') {
      if (this.wrongCodes >= 10) return json({ code: '54000', message: 'Too many wrong codes. Wait an hour, or ask your manager to add your email instead.' }, 400);
      const site = this.sites.find((s) => s.code === String(args.p_code ?? '').trim().replace(/ /g, '').toUpperCase());
      if (!site) { this.wrongCodes++; return json(null); }
      if (!this.members.some((m) => m.user_id === u.id && m.company_id === site.company_id))
        this.members.push({ user_id: u.id, email: u.email, company_id: site.company_id, role: 'employee', facility_ids: [site.id] });
      return json(site.id);
    }
    if (rpc === 'get_join_code') {
      const site = this.sites.find((s) => s.id === args.p_facility);
      return site && this.canManage(u, site) ? json(site.code) : json({ code: '42501', message: 'Only managers of this site can see its join code.' }, 403);
    }
    if (rpc === 'list_members') {
      const mine = this.memberOf(u).find((m) => m.company_id === args.p_company);
      if (!u.admin && (!mine || mine.role === 'employee')) return json({ code: '42501', message: 'Only owners and managers can see who has access.' }, 403);
      return json(this.members.filter((m) => m.company_id === args.p_company).map((m) => ({ ...m, pending: false })));
    }
    if (rpc === 'admin_overview') {
      if (!u.admin) return json({ code: '42501', message: 'Only Bergeron Maps admins can see all accounts.' }, 403);
      return json(this.companies.map((c) => ({
        id: c.id, name: c.name, created_at: '2026-11-01T00:00:00Z',
        sites: this.sites.filter((s) => s.company_id === c.id).map((s) => ({ id: s.id, name: s.name, slug: s.slug, maps: 0, published: 0 })),
        people: this.members.filter((m) => m.company_id === c.id).map((m) => ({ email: m.email, role: m.role, facility_ids: m.facility_ids, pending: false, last_sign_in: null })),
      })));
    }
    return json({ code: 'PGRST202', message: `mock: ${req.method()} ${path} not handled` }, 404);
  }
}
