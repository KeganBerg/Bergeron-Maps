import { Icon } from '../ui/icons';
import { ago } from './viewerHelpers';
import { useLanguageInfo, useT } from '../i18n/useLanguage';
import { LanguagePicker } from '../ui/LanguagePicker';

/** The viewer's top bar: back, the map's name and floor, the list of places, and refresh. */
export function ViewerHeader({ mapName, floorName, updatedAt, preview, listOpen, onBack, onToggleList, onRefresh }: {
  mapName: string;
  floorName: string;
  /** When the map was published (or saved, for a draft preview). */
  updatedAt: string;
  /** The editor's preview of the draft. */
  preview: boolean;
  listOpen: boolean;
  /** Missing: no back button (a public link to a site's only map). */
  onBack?: () => void;
  onToggleList: () => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const { locale } = useLanguageInfo();
  return (
    <header className="viewer-header">
      {onBack && (
        <button className="icon-btn" aria-label={preview ? t.backToEditor : t.allMaps} onClick={onBack}>
          <Icon name="back" />
        </button>
      )}
      <div className="titles">
        <h1 data-testid="viewer-facility">{mapName}</h1>
        <span className="muted small">
          {(preview ? t.draftWhen : t.updatedWhen)(floorName, ago(updatedAt, locale))}
        </span>
      </div>
      <button className={`icon-btn${listOpen ? ' on' : ''}`} aria-label={t.listButton} title={t.listButtonTitle}
        aria-expanded={listOpen} data-testid="list-toggle"
        onClick={onToggleList}>
        <Icon name="rows" />
      </button>
      <button className="icon-btn" aria-label={t.refresh} title={t.refreshTitle} onClick={onRefresh}><Icon name="restore" /></button>
      <LanguagePicker compact />
    </header>
  );
}
