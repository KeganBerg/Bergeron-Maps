import { useEffect, useRef, type MutableRefObject } from 'react';
import type { MapDocument } from '../model/types';
import type { MapRepository } from '../storage/repository';

/** Moved out of ViewerPage.tsx to keep that file from growing (src/codeSize.test.ts). */
export function useLatestPublished({ mapId, repo, preview, docRef, load }: {
  mapId: string; repo: MapRepository; preview: boolean;
  docRef: MutableRefObject<(MapDocument & { publishedAt?: string }) | null>;
  /** Downloads the map again and shows it. */
  load: () => void;
}) {
  const loadRef = useRef(load);
  loadRef.current = load;

  // A newly published version shows up by itself: checked every minute while the page is
  // on screen, and as soon as someone comes back to it (unlocks the phone, switches tabs).
  // The check only asks when the map was last published; the map itself is downloaded
  // again only when that changed. The public link has no such check, so it reloads when
  // someone comes back after a few minutes away.
  useEffect(() => {
    if (preview) return;
    let busy = false;
    let lastFull = Date.now();
    const check = async () => {
      if (busy || document.visibilityState !== 'visible' || !docRef.current) return;
      busy = true;
      try {
        const shown = docRef.current.publishedAt ?? docRef.current.updatedAt;
        if (typeof repo.getPublishInfo === 'function') {
          const info = await repo.getPublishInfo(mapId).catch(() => undefined);
          if (info === undefined) return; // offline for a moment: try again later
          if (!info || info.publishedAt !== shown) loadRef.current();
        } else if (Date.now() - lastFull > 5 * 60_000) {
          lastFull = Date.now();
          loadRef.current();
        }
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(check, 60_000);
    const onShow = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, [mapId, repo, preview]);
}
