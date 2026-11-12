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
interface Company { id: string; name: string; max_sites?: number | null }
interface Site { id: string; company_id: string; name: string; slug: string; code: string; address?: string | null }
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
  /** Manager requests (Request Manager Status). */
  requests: { id: string; company_id: string; facility_id: string; user_id: string; email: string; note: string | null; status: string; created_at: string }[] = [];
  /** Published copies: map id → whether a manager made it public. */
  published = new Map<string, { isPublic: boolean }>();
  /** Users whose sessions were ended (removed from a company). */
  signedOut: string[] = [];
  /** Saved versions of maps. */
  versions: { id: string; map_id: string; created_at: string; reason: string; label: string; revision: number; doc: unknown }[] = [];
  /** Companies sent to admin_restore_company, as received. */
  restoredPayloads: Record<string, unknown>[] = [];
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

    // ---- the one thing visitors who aren't signed in can call
    if (path === '/rest/v1/rpc/get_public_site') {
      const site = this.sites.find((s) => s.slug === String((req.postDataJSON() ?? {}).p_slug));
      const list = site ? this.maps.filter((m) => m.facility_id === site.id && this.published.get(m.id)?.isPublic) : [];
      return json(list.map((m) => ({ site_name: site!.name, map_id: m.id, name: m.name, doc: m.draft, published_at: '2026-11-12T00:00:00Z' })));
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
      const id = eq('id');
      return rows(this.companies.filter((c) => (u.admin || this.memberOf(u).some((m) => m.company_id === c.id)) && (!id || c.id === id))
        .map((c) => ({ ...c, max_sites: c.max_sites ?? null })));
    }
    if (path === '/rest/v1/manager_requests') {
      const company = eq('company_id');
      const list = this.requests.filter((q) => (q.user_id === u.id || u.admin || this.memberOf(u).some((m) => m.company_id === q.company_id && (m.role === 'owner' || (m.role === 'manager' && m.facility_ids === null))))
        && (!company || q.company_id === company) && q.status === 'pending');
      if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': `*/${list.length}` } });
      return rows(list);
    }
    if (path === '/rest/v1/facilities' && req.method() === 'GET') {
      let list = this.sites.filter((s) => this.canSee(u, s));
      const id = eq('id'), slug = eq('slug'), company = eq('company_id');
      if (id) list = list.filter((s) => s.id === id);
      if (slug) list = list.filter((s) => s.slug === slug);
      if (company) list = list.filter((s) => s.company_id === company);
      return rows(list.map(({ code: _c, ...s }) => ({ ...s, address: s.address ?? null })));
    }
    if (path === '/rest/v1/maps') {
      let list = this.maps.filter((m) => this.canSee(u, this.sites.find((s) => s.id === m.facility_id)!));
      const id = eq('id'), mapCompany = eq('company_id');
      if (id) list = list.filter((m) => m.id === id);
      if (mapCompany) list = list.filter((m) => m.company_id === mapCompany);
      if (req.method() === 'PATCH' && url.searchParams.has('revision')) {
        const rev = Number(eq('revision'));
        list = list.filter((m) => m.revision === rev && this.canManage(u, this.sites.find((s) => s.id === m.facility_id)!));
        const body = req.postDataJSON() as { name: string; draft: Record<string, unknown> };
        for (const m of list) Object.assign(m, body, { revision: m.revision + 1 });
      }
      const now = '2026-11-12T00:00:00Z';
      if (req.method() === 'PATCH' && !url.searchParams.has('revision')) {
        const body = req.postDataJSON() as { is_public?: boolean };
        list = list.filter((m) => this.canManage(u, this.sites.find((s) => s.id === m.facility_id)!));
        for (const m of list) if (body.is_public !== undefined && this.published.has(m.id)) this.published.get(m.id)!.isPublic = body.is_public;
      }
      return rows(list.map((m) => {
        const site = this.sites.find((s) => s.id === m.facility_id)!;
        const pub = this.published.get(m.id);
        return { ...m, created_at: now, updated_at: now, deleted_at: null, is_public: pub?.isPublic ?? false, facilities: { name: site.name, slug: site.slug },
          published_maps: pub ? { published_at: now, revision: m.revision } : null };
      }));
    }
    if (path === '/rest/v1/published_maps') {
      const id = eq('map_id'), pubCompany = eq('company_id');
      const list = this.maps.filter((m) => this.published.has(m.id) && this.canSee(u, this.sites.find((s) => s.id === m.facility_id)!) && (!id || m.id === id)
        && (!pubCompany || m.company_id === pubCompany));
      return rows(list.map((m) => ({ map_id: m.id, name: m.name, facility_id: m.facility_id, published_at: '2026-11-12T00:00:00Z', revision: m.revision, doc: m.draft,
        floors: (m.draft as { floors?: unknown[] }).floors ?? [] })));
    }
    if (path === '/rest/v1/map_versions') {
      const mapId = eq('map_id');
      const all = this.versions.filter((v) => !mapId || v.map_id === mapId);
      const range = req.headers()['range']?.match(/(\d+)-(\d+)/);
      return rows(range ? all.slice(Number(range[1]), Number(range[2]) + 1) : all);
    }

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
        id: c.id, name: c.name, created_at: '2026-11-01T00:00:00Z', max_sites: c.max_sites ?? null,
        sites: this.sites.filter((s) => s.company_id === c.id).map((s) => ({ id: s.id, name: s.name, slug: s.slug, address: s.address ?? null,
          maps: this.maps.filter((m) => m.facility_id === s.id).length, trashed: 0, published: 0, public: 0 })),
        people: this.members.filter((m) => m.company_id === c.id).map((m) => ({ user_id: m.user_id, email: m.email, role: m.role, facility_ids: m.facility_ids, pending: false, last_sign_in: null })),
        requests: this.requests.filter((q) => q.company_id === c.id && q.status === 'pending'),
      })));
    }
    const isLead = (company: string) => !!u.admin || this.memberOf(u).some((m) => m.company_id === company && (m.role === 'owner' || (m.role === 'manager' && m.facility_ids === null)));
    const refuse = (message: string) => json({ code: '42501', message }, 403);
    if (rpc === 'my_locations') {
      return json(this.memberOf(u).flatMap((m) => this.sites.filter((s) => s.company_id === m.company_id && (m.facility_ids === null || m.facility_ids.includes(s.id))).map((s) => ({
        company_id: s.company_id, company_name: this.companies.find((c) => c.id === s.company_id)!.name, site_id: s.id, site_name: s.name, slug: s.slug,
        address: s.address ?? null, role: m.role, live_maps: 0,
        request_status: [...this.requests].reverse().find((q) => q.user_id === u.id && q.facility_id === s.id)?.status ?? null,
      }))));
    }
    if (rpc === 'request_manager_access') {
      const site = this.sites.find((s) => s.id === args.p_facility);
      if (!site || !this.canSee(u, site)) return refuse('Join this site with its code first, then ask for manager access.');
      const id = `r${this.requests.length + 1}`;
      this.requests.push({ id, company_id: site.company_id, facility_id: site.id, user_id: u.id, email: u.email, note: args.p_note ?? null, status: 'pending', created_at: '2026-11-12T00:00:00Z' });
      return json(id);
    }
    if (rpc === 'decide_manager_request') {
      const q = this.requests.find((r) => r.id === args.p_request);
      if (!q || !isLead(q.company_id)) return refuse('Only owners and regional managers can answer manager requests.');
      q.status = (args.p_approve as unknown) === true ? 'approved' : 'denied';
      if (q.status === 'approved') {
        const m = this.members.find((x) => x.user_id === q.user_id && x.company_id === q.company_id);
        if (m) Object.assign(m, { role: 'manager', facility_ids: [q.facility_id] });
      }
      return json(null);
    }
    if (rpc === 'move_member') {
      if (!isLead(args.p_company)) return refuse('Only owners and regional managers can move people between sites.');
      const m = this.members.find((x) => x.company_id === args.p_company && x.email === args.p_email);
      if (m?.facility_ids) m.facility_ids = m.facility_ids.map((f) => (f === args.p_from ? args.p_to : f));
      return json(null);
    }
    if (rpc === 'remove_member') {
      const i = this.members.findIndex((x) => x.company_id === args.p_company && x.user_id === args.p_user);
      if (i >= 0) { this.members.splice(i, 1); this.signedOut.push(args.p_user); }
      return json(null);
    }
    if (rpc === 'leave_site') {
      const m = this.members.find((x) => x.user_id === u.id && x.facility_ids?.includes(args.p_facility));
      if (m) m.facility_ids = m.facility_ids!.filter((f) => f !== args.p_facility);
      this.members = this.members.filter((x) => !(x.facility_ids && x.facility_ids.length === 0));
      return json(null);
    }
    if (rpc === 'setup_company') {
      if (!u.admin) return refuse('Only Bergeron Maps admins can set up a new company.');
      const a = args as unknown as { p_name: string; p_site_name: string; p_site_address: string | null; p_lead_email: string | null; p_max_sites: number | null };
      const c = { id: `c-new-${this.companies.length}`, name: a.p_name, max_sites: a.p_max_sites };
      this.companies.push(c);
      this.sites.push({ id: `f-new-${this.sites.length}`, company_id: c.id, name: a.p_site_name, slug: a.p_site_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), code: 'NEWCDE', address: a.p_site_address });
      if (a.p_lead_email) this.members.push({ user_id: `u-lead-${c.id}`, email: a.p_lead_email.toLowerCase(), company_id: c.id, role: 'owner', facility_ids: null });
      return json(c.id);
    }
    if (rpc === 'admin_delete_company') {
      if (!u.admin) return refuse('Only Bergeron Maps admins can delete a company.');
      const c = this.companies.find((x) => x.id === args.p_company);
      if (!c || args.p_confirm_name !== c.name) return json({ code: '22023', message: 'Type the company name exactly as shown to confirm.' }, 400);
      this.companies = this.companies.filter((x) => x !== c);
      this.sites = this.sites.filter((x) => x.company_id !== c.id);
      const gone = new Set(this.maps.filter((m) => m.company_id === c.id).map((m) => m.id));
      this.members = this.members.filter((x) => x.company_id !== c.id);
      this.maps = this.maps.filter((m) => !gone.has(m.id));
      this.versions = this.versions.filter((v) => !gone.has(v.map_id));
      return json(null);
    }
    if (rpc === 'admin_restore_company') {
      if (!u.admin) return refuse('Only Bergeron Maps admins can restore a company.');
      const b = (req.postDataJSON() as { p_backup: {
        id: string; name: string; max_sites: number | null;
        sites: { id: string; name: string; slug: string; address: string | null; join_code: string | null }[];
        people: { email: string; role: Role; facility_ids: string[] | null }[];
        maps: { id: string; facility_id: string; name: string; draft: Record<string, unknown>; revision: number; slot: number; is_public: boolean; published: unknown }[];
      } }).p_backup;
      this.restoredPayloads.push(b as unknown as Record<string, unknown>);
      if (this.companies.some((c) => c.id === b.id)) return json({ code: '23505', message: `“${b.name}” is still in All accounts, so there is nothing to restore.` }, 409);
      this.companies.push({ id: b.id, name: b.name, max_sites: b.max_sites });
      for (const x of b.sites) this.sites.push({ id: x.id, company_id: b.id, name: x.name, slug: x.slug, code: x.join_code ?? 'NEWCDE', address: x.address });
      const known = [...this.users.values()];
      let members = 0, invited = 0;
      for (const p of b.people) {
        const who = known.find((k) => k.email === p.email);
        if (who) { this.members.push({ user_id: who.id, email: p.email, company_id: b.id, role: p.role, facility_ids: p.facility_ids }); members++; } else invited++;
      }
      for (const m of b.maps) {
        this.maps.push({ id: m.id, company_id: b.id, facility_id: m.facility_id, name: m.name, draft: m.draft, revision: m.revision, slot: m.slot });
        if (m.published) this.published.set(m.id, { isPublic: m.is_public });
      }
      return json({ company: b.id, name: b.name, sites: b.sites.length, members, invited, maps: b.maps.length, published: b.maps.filter((m) => m.published).length,
        moved_to_trash: 0, slug_changes: [] });
    }
    if (rpc === 'admin_restore_versions') {
      if (!u.admin) return refuse('Only Bergeron Maps admins can restore a company.');
      const a = req.postDataJSON() as { p_map: string; p_versions: { id: string }[] };
      let n = 0;
      for (const v of a.p_versions as never[]) if (!this.versions.some((x) => x.id === (v as { id: string }).id)) { this.versions.push({ ...(v as object), map_id: a.p_map } as never); n++; }
      return json(n);
    }
    if (rpc === 'admin_delete_site') {
      if (!u.admin) return refuse('Only Bergeron Maps admins can delete sites here.');
      if (this.maps.some((m) => m.facility_id === args.p_facility)) return json({ code: '23503', message: 'This site still has maps.' }, 409);
      this.sites = this.sites.filter((x) => x.id !== args.p_facility);
      return json(null);
    }
    if (rpc === 'set_site_limit') {
      if (!u.admin) return refuse('Only Bergeron Maps admins can change a contract.');
      const c = this.companies.find((x) => x.id === args.p_company);
      if (c) c.max_sites = (args.p_max_sites as unknown as number | null);
      return json(null);
    }
    return json({ code: 'PGRST202', message: `mock: ${req.method()} ${path} not handled` }, 404);
  }
}
