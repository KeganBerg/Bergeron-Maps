import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { migrateDocument } from '../model/migrate';
import type { MapDocument } from '../model/types';
import { navigate } from '../router';
import type { MapRepository } from '../storage/repository';
import { ViewerPage } from '../viewer/ViewerPage';
import { supabase } from './client';
import { useLanguageInfo, useT } from '../i18n/useLanguage';
import { LanguagePicker } from '../ui/LanguagePicker';

interface PublicMap { site_name: string; map_id: string; name: string; doc: MapDocument; published_at: string }

/** Public site link: …/#/view/<site-link>. Anyone can open it; no sign-in. */
export const publicSiteLink = (slug: string) => `${window.location.origin}${window.location.pathname}#/view/${slug}`;

/** Site links are lowercase letters, digits and dashes; map ids online are UUIDs, and browser-only ids contain "_". */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPublicSiteRoute = (parts: string[]) => parts[0] === 'view' && !!parts[1] && /^[a-z0-9-]+$/i.test(parts[1]) && !UUID.test(parts[1]);

/**
 * The public maps of one site, read with get_public_site: only maps a manager
 * made public, and only their published version.
 */
export function PublicSitePage({ slug, mapId }: { slug: string; mapId?: string }) {
  const t = useT();
  const lang = useLanguageInfo();
  const [maps, setMaps] = useState<PublicMap[] | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchSite = () => supabase!.rpc('get_public_site', { p_slug: slug }).then(({ data, error }) => ({ list: (data ?? []) as PublicMap[], error }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchSite().then(({ list, error }) => {
      if (!alive) return;
      setFailed(!!error);
      setMaps(list);
    });
    return () => { alive = false; };
  }, [slug, attempt]);

  // The viewer reads through a repository; this one only knows the public maps. It asks the
  // server again each time, so the viewer's Refresh button brings the latest published version.
  const repo = useMemo(() => {
    let first = true;
    return {
      getPublishedMap: async (id: string) => {
        let list = maps ?? [];
        if (!first) {
          const r = await fetchSite();
          if (r.error) throw r.error;
          list = r.list;
        }
        first = false;
        const m = list.find((x) => x.map_id === id);
        return m ? { ...migrateDocument({ ...m.doc, id: m.map_id, name: m.name, updatedAt: m.published_at }), publishedAt: m.published_at } : null;
      },
      getMap: async () => null,
    } as unknown as MapRepository;
    // Made once per site: the list it starts from is the one this page just loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps === null, slug]);

  if (maps === null) return <div className="page-message" lang={lang.htmlLang}><p>{t.loading}</p></div>;
  const only = maps.length === 1 ? maps[0] : undefined;
  const open = mapId ? maps.find((m) => m.map_id === mapId) : only;
  if (open) return <ViewerPage key={open.map_id} mapId={open.map_id} repo={repo} preview={false} backTo={only ? null : `/view/${slug}`} />;

  return (
    <div className="home">
      <AppHeader />
      <main className="home-main locations" lang={lang.htmlLang}>
        {maps.length === 0 ? (
          <div className="empty-state" data-testid="public-none">
            <p>{failed ? t.publicFailed : t.publicNone}</p>
            {failed && <button className="btn primary" onClick={() => { setMaps(null); setAttempt((n) => n + 1); }} data-testid="public-retry">{t.tryAgain}</button>}
          </div>
        ) : (
          <>
            <div className="page-head"><h2>{maps[0].site_name}</h2><LanguagePicker /></div>
            <ul className="loc-maps">
              {maps.map((m) => (
                <li key={m.map_id}>
                  <button className="loc-map" onClick={() => navigate(`/view/${slug}/${m.map_id}`)} data-testid={`public-${m.name}`}>
                    <strong>{m.name}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
