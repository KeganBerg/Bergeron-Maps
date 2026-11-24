import { primeImage } from '../render/useImage';

/**
 * Where a picture goes when someone adds a background or an image object.
 * Online, the editor page points this at the company's file storage, so the
 * map only ever holds a short address; in this browser's own storage there is
 * no uploader and the picture stays inside the map.
 */
let uploader: ((src: string) => Promise<string>) | null = null;

export function setImageUploader(fn: ((src: string) => Promise<string>) | null) {
  uploader = fn;
}

/**
 * The source to put in the map for a picture just picked (a data URL). If the
 * upload fails (offline, say) the picture stays inside the map for now, and
 * the next save uploads it.
 */
export async function keepImage(src: string): Promise<string> {
  if (!uploader) return src;
  try {
    const url = await uploader(src);
    // Show the stored picture from the copy already in memory instead of downloading it again.
    if (url !== src) primeImage(url, src);
    return url;
  } catch {
    return src;
  }
}
