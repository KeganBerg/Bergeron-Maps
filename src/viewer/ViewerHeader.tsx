import { Icon } from '../ui/icons';
import { ago } from './viewerHelpers';

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
  return (
    <header className="viewer-header">
      {onBack && (
        <button className="icon-btn" aria-label={preview ? 'Back to editor' : 'All maps'} onClick={onBack}>
          <Icon name="back" />
        </button>
      )}
      <div className="titles">
        <h1 data-testid="viewer-facility">{mapName}</h1>
        <span className="muted small">
          {floorName} · {preview ? 'Draft' : 'Updated'} {ago(updatedAt)}
        </span>
      </div>
      <button className={`icon-btn${listOpen ? ' on' : ''}`} aria-label="List of spaces and places" title="List of spaces and places on this floor"
        aria-expanded={listOpen} data-testid="list-toggle"
        onClick={onToggleList}>
        <Icon name="rows" />
      </button>
      <button className="icon-btn" aria-label="Refresh map" title="Get the latest version" onClick={onRefresh}><Icon name="restore" /></button>
    </header>
  );
}
