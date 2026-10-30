import { useEffect, useState } from 'react';

const cache = new Map<string, HTMLImageElement>();

/** Loads (and caches) an image for Konva. Returns undefined until it has loaded. */
export function useImage(src: string | undefined): HTMLImageElement | undefined {
  const [, force] = useState(0);
  const cached = src ? cache.get(src) : undefined;
  const ready = cached && cached.complete && cached.naturalWidth > 0;
  useEffect(() => {
    if (!src || ready) return;
    let img = cache.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      cache.set(src, img);
    }
    const onLoad = () => force((n) => n + 1);
    img.addEventListener('load', onLoad);
    return () => img!.removeEventListener('load', onLoad);
  }, [src, ready]);
  return ready ? cached : undefined;
}
