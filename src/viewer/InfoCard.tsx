import { Icon } from '../ui/icons';
import { useT } from '../i18n/useLanguage';

/** The card at the bottom of the viewer about the picked space or place: what it is, and Go inside, Directions and Share. */
export function InfoCard({ title, detail, floorName, showSwatch, canGoIn, shared, onClose, onGoInside, onDirections, onShare }: {
  title: string;
  detail?: string;
  /** The floor it is on, when known. */
  floorName?: string;
  /** Show the floor's colour (only when the map has more than one floor). */
  showSwatch: boolean;
  /** It is a building with a floor plan inside. */
  canGoIn: boolean;
  /** Its link was just copied. */
  shared: boolean;
  onClose: () => void;
  onGoInside: () => void;
  onDirections: () => void;
  onShare: () => void;
}) {
  const t = useT();
  return (
        <section className="info-card" aria-label={title} tabIndex={-1} data-testid="info-card">
          <div className="info-head">
            <strong>{title}</strong>
            <span className="info-meta">
              {showSwatch && <span className="floor-swatch" aria-hidden="true" />}
              {[floorName, detail].filter(Boolean).join(', ')}
            </span>
          </div>
          <button className="icon-btn info-close" aria-label={t.close} onClick={onClose}><Icon name="close" /></button>
          <div className="info-actions">
            {canGoIn && (
              <button className="btn primary go-inside" onClick={onGoInside} data-testid="go-inside">
                <Icon name="enter" size={18} /> {t.goInside}
              </button>
            )}
            <button className={`btn directions-btn${canGoIn ? '' : ' primary'}`} onClick={onDirections} data-testid="directions">
              <Icon name="directions" size={18} /> {t.directions}
            </button>
            <button className={`btn share-btn${shared ? ' done' : ''}`} aria-label={shared ? t.linkCopied : t.shareLinkTo(title)}
              title={shared ? t.linkCopied : t.shareThis} onClick={onShare} data-testid="share">
              <Icon name={shared ? 'check' : 'share'} size={20} />
            </button>
          </div>
          {shared && <span className="share-toast" role="status" data-testid="share-copied">{t.linkCopied}</span>}
        </section>
  );
}
