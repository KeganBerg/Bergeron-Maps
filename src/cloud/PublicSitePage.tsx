import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { migrateDocument } from '../model/migrate';
import type { MapDocument } from '../model/types';
import { navigate } from '../router';
import type { MapRepository } from '../storage/repository';
import { ViewerPage } from '../viewer/ViewerPage';
import { supabase } from './client';

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
  const [maps, setMaps] = useState<PublicMap[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase!.rpc('get_public_site', { p_slug: slug }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setFailed(true);
      setMaps((data ?? []) as PublicMap[]);
    });
    return () => { alive = false; };
  }, [slug]);

  // The viewer reads through a repository; this one only knows the public maps.
  const repo = useMemo(() => ({
    getPublishedMap: async (id: string) => {
      const m = maps?.find((x) => x.map_id === id);
      return m ? { ...migrateDocument({ ...m.doc, id: m.map_id, name: m.name, updatedAt: m.published_at }), publishedAt: m.published_at } : null;
    },
    getMap: async () => null,
  }) as unknown as MapRepository, [maps]);

  if (maps === null) return <div className="page-message"><p>Loading…</p></div>;
  const only = maps.length === 1 ? maps[0] : undefined;
  const open = mapId ? maps.find((m) => m.map_id === mapId) : only;
  if (open) return <ViewerPage key={open.map_id} mapId={open.map_id} repo={repo} preview={false} backTo={only ? null : `/view/${slug}`} />;

  return (
    <div className="home">
      <AppHeader />
      <main className="home-main locations">
        {maps.length === 0 ? (
          <div className="empty-state" data-testid="public-none">
            <p>{failed ? 'This map couldn’t be loaded. Check your connection and try again.' : 'There’s no public map at this link. It may have been taken offline, or the link changed.'}</p>
          </div>
        ) : (
          <>
            <div className="page-head"><h2>{maps[0].site_name}</h2></div>
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
