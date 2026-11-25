import type { SearchHit } from '../model/search';
import { Icon } from '../ui/icons';
import { useT } from '../i18n/useLanguage';

/** The viewer's search box and its list of results (arrow keys move through them, Escape closes). */
export function SearchBox({ query, setQuery, showResults, setShowResults, hits, goTo, submitSearch, quietFocus }: {
  query: string;
  setQuery: (q: string) => void;
  showResults: boolean;
  setShowResults: (open: boolean) => void;
  hits: SearchHit[];
  goTo: (h: SearchHit) => void;
  submitSearch: () => void;
  /** True while focus is being put back on the box by the app, not the person: don't open the results. */
  quietFocus: React.MutableRefObject<boolean>;
}) {
  const t = useT();
  return (
      <form className="viewer-search" role="search" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
        <Icon name="search" size={18} />
        <input
          type="search"
          inputMode="search"
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
          onFocus={() => { if (!quietFocus.current) setShowResults(true); }}
          aria-label={t.searchLabel}
          aria-controls={showResults && query.trim() ? "viewer-results" : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowResults(false);
            else if (e.key === 'ArrowDown' && showResults) {
              e.preventDefault();
              e.currentTarget.form?.querySelector<HTMLElement>('.results button')?.focus();
            }
          }}
          data-testid="viewer-search"
        />
        {showResults && query.trim() && (
          <ul className="results" id="viewer-results" aria-label={t.searchResults} data-testid="search-results"
            onKeyDown={(e) => {
              // Up and down move through the results; Escape goes back to the search box.
              const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button')];
              const at = items.indexOf(document.activeElement as HTMLElement);
              const input = e.currentTarget.parentElement?.querySelector('input');
              if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(at + 1, items.length - 1)]?.focus(); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); (at <= 0 ? input : items[at - 1])?.focus(); }
              else if (e.key === 'Escape') { input?.focus(); setShowResults(false); }
            }}>
            {hits.length === 0 ? (
              <li className="none">{t.noMatchFor(query.trim())}</li>
            ) : (
              hits.map((h) => (
                <li key={`${h.floorId}:${h.object.id}`}>
                  <button type="button" onClick={() => goTo(h)}>
                    <strong>{h.title}</strong>
                    <span className="muted">{h.floorName}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </form>
  );
}
