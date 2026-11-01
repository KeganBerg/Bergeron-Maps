import { useEffect, useRef, useState } from 'react';

const cache = new Map<string, HTMLImageElement>();
const MAX_CACHE = 600;

/**
 * Loads (and caches) an image for Konva. While a new source loads, the last
 * image this caller showed stays on screen, so restyling or resizing an
 * object never flickers.
 */
export function useImage(src: string | undefined): HTMLImageElement | undefined {
  const [, force] = useState(0);
  const last = useRef<HTMLImageElement>();
  const cached = src ? cache.get(src) : undefined;
  const ready = !!cached && cached.complete && cached.naturalWidth > 0;
  useEffect(() => {
    if (!src || ready) return;
    let img = cache.get(src);
    if (!img) {
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
      img = new Image();
      img.src = src;
      cache.set(src, img);
    }
    const onLoad = () => force((n) => n + 1);
    img.addEventListener('load', onLoad);
    return () => img!.removeEventListener('load', onLoad);
  }, [src, ready]);
  if (!src) return (last.current = undefined);
  if (ready) last.current = cached;
  return last.current;
}
