import { useEffect, useMemo, useState } from 'react';
import { COMMON_SYMBOLS, loadSymbols, SYMBOL_ALIASES, type MapSymbol } from '../assets/symbols';
import { Dialog } from '../ui/Dialog';

const PAGE = 240;

/** Small inline preview of a Material symbol. */
export function SymbolIcon({ path, size = 22 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor">
      <path d={path} />
    </svg>
  );
}

const pretty = (name: string) => name.replace(/_/g, ' ');

/**
 * Searchable grid of every Google Material symbol. Common parking and
 * facility symbols come first; typing searches all of them by name.
 */
export function SymbolPicker({ current, onPick, onClose }: {
  current?: string;
  onPick: (s: MapSymbol) => void;
  onClose: () => void;
}) {
  const [icons, setIcons] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let live = true;
    loadSymbols().then((m) => live && setIcons(m), () => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  const names = useMemo(() => {
    if (!icons) return [];
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/[^a-z0-9]/g, ''));
    if (!terms.length) {
      const common = COMMON_SYMBOLS.filter((n) => icons[n]);
      const seen = new Set(common);
      return [...common, ...Object.keys(icons).filter((n) => !seen.has(n))];
    }
    const hits = Object.keys(icons).filter((n) => terms.every((t) => n.replace(/_/g, '').includes(t) || n.split('_').some((w) => w.startsWith(t))));
    // Exact and prefix matches first.
    const score = (n: string) => (n === q.trim().replace(/\s+/g, '_') ? 0 : n.startsWith(terms[0]) ? 1 : 2);
    hits.sort((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b));
    const aliased = terms.flatMap((t) => SYMBOL_ALIASES[t] ?? []).filter((n) => icons[n]);
    return [...new Set([...aliased, ...hits])];
  }, [icons, q]);

  useEffect(() => setLimit(PAGE), [q]);

  return (
    <Dialog title="Choose a symbol" onClose={onClose} wide>
      <input
        type="search"
        className="symbol-search"
        placeholder="Search symbols: parking, key, elevator, restroom…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        data-testid="symbol-search"
      />
      {error && <p className="error-text">The symbol set didn’t load. Check your connection and try again.</p>}
      {!icons && !error && <p className="hint">Loading symbols…</p>}
      {icons && (
        <>
          <p className="hint">
            {q ? `${names.length} match${names.length === 1 ? '' : 'es'}` : `${names.length} symbols from Google Material Symbols. Common ones first.`}
          </p>
          <div className="symbol-grid" role="listbox" aria-label="Symbols">
            {names.slice(0, limit).map((n) => (
              <button
                key={n}
                role="option"
                aria-selected={n === current}
                className={`symbol-cell${n === current ? ' on' : ''}`}
                title={pretty(n)}
                onClick={() => onPick({ name: n, path: icons[n] })}
                data-testid={`symbol-${n}`}
              >
                <SymbolIcon path={icons[n]} size={26} />
                <span>{pretty(n)}</span>
              </button>
            ))}
          </div>
          {names.length > limit && (
            <div className="btn-row">
              <button className="btn small" onClick={() => setLimit((l) => l + PAGE * 2)}>Show more ({names.length - limit} left)</button>
            </div>
          )}
          {q && names.length === 0 && <p className="hint">No symbol matches “{q}”. Try a simpler word, like “car” or “door”.</p>}
        </>
      )}
    </Dialog>
  );
}
