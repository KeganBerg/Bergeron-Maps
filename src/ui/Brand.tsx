/**
 * The Bergeron Maps brand: the "BM" monogram and the "BERGERON MAPS"
 * wordmark, traced to vectors from the official artwork. Both draw in
 * currentColor so they follow the surrounding text color.
 */
import monogram from '../assets/brand/monogram.svg?raw';
import wordmark from '../assets/brand/wordmark.svg?raw';

/** The monogram on its black tile, used as the app mark. Favicons are built from the same artwork by scripts/build-icons.mjs. */
export function BrandMark({ size = 32, title = 'Bergeron Maps' }: { size?: number; title?: string }) {
  return (
    <span className="brand-mark" role="img" aria-label={title} style={{ width: size, height: size }}>
      <span className="brand-mark-glyph" dangerouslySetInnerHTML={{ __html: monogram }} />
    </span>
  );
}

/** The spaced "BERGERON MAPS" wordmark, sized by its cap height. */
export function BrandWordmark({ height = 14 }: { height?: number }) {
  return <span className="brand-wordmark" role="img" aria-label="Bergeron Maps" style={{ height }} dangerouslySetInnerHTML={{ __html: wordmark }} />;
}
