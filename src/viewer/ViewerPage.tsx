import Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import { ASSET_BY_KEY } from '../assets/library';
import { searchMap, type SearchHit } from '../model/search';
import type { MapDocument, MapObject } from '../model/types';
import { BackgroundShape, MapObjectShape } from '../render/MapObjects';
import { clampScale, fitViewport, floorBounds, zoomAt } from '../render/viewport';
import { navigate } from '../router';
import type { MapRepository } from '../storage/repository';
import { Icon } from '../ui/icons';
import { floorColor, MAP_PALETTE } from '../theme';

const ago = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function describe(o: MapObject, doc: MapDocument): { title: string; detail?: string } {
  if (o.kind === 'space') return { title: `Space ${o.label || '(no number)'}`, detail: o.accessible ? 'Accessible space' : undefined };
  if (o.kind === 'text') return { title: o.text };
  const def = ASSET_BY_KEY[o.assetKey];
  const to = (o.connectsTo ?? []).map((id) => doc.floors.find((f) => f.id === id)?.name).filter(Boolean);
  return {
    title: o.name || o.label || def?.name || 'Object',
    detail: [def && o.name !== def.name ? def.name : null, to.length ? `Goes to ${to.join(', ')}` : null].filter(Boolean).join(' · ') || undefined,
  };
}

/**
 * The employee view: read-only, phone-first, uses exactly the same map data
 * as the editor. Pan by dragging, pinch or Ctrl+scroll to zoom, tap to identify.
 */
export function ViewerPage({ mapId, repo, preview }: { mapId: string; repo: MapRepository; preview: boolean }) {
  const [doc, setDoc] = useState<MapDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [floorId, setFloorId] = useState('');
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ width: 360, height: 640 });
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [focus, setFocus] = useState<{ id: string; floorId: string } | null>(null);
  const [tapped, setTapped] = useState<MapObject | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ dist: number; center: { x: number; y: number } } | null>(null);

  const load = () => {
    setError(null);
    repo.getMap(mapId).then(
      (d) => {
        if (!d) return setError('This map isn’t available. It may have been deleted or you may not have access.');
        setDoc(d);
        setFloorId((cur) => (d.floors.some((f) => f.id === cur) ? cur : d.floors[0].id));
      },
      () => setError('The latest version of this map couldn’t be loaded. Check your connection and try again.'),
    );
  };
  useEffect(load, [mapId, repo]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, [doc]);

  const floor = doc?.floors.find((f) => f.id === floorId) ?? doc?.floors[0];
  const resetView = () => floor && setView(fitViewport(floorBounds(floor), size, 24));
  // Fit when the floor or screen size changes (but not after a search jump).
  const fitKey = `${floor?.id}:${size.width}x${size.height}`;
  const lastFit = useRef('');
  useEffect(() => {
    if (!floor || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    if (!focus || focus.floorId !== floor.id) resetView();
  }, [fitKey]);

  const hits = useMemo(() => (doc ? searchMap(doc, query) : []), [doc, query]);

  const goTo = (h: SearchHit) => {
    setShowResults(false);
    setFocus({ id: h.object.id, floorId: h.floorId });
    setTapped(h.object);
    setFloorId(h.floorId);
    lastFit.current = `${h.floorId}:${size.width}x${size.height}`;
    const o = h.object;
    const target = Math.min(size.width, size.height) / 5 / Math.max(o.width, o.height);
    const scale = clampScale(Math.max(Math.min(target, 3), 0.6));
    setView({ scale, x: size.width / 2 - o.x * scale, y: size.height / 2 - o.y * scale });
  };

  const submitSearch = () => {
    const exact = hits.filter((h) => h.exact);
    if (exact.length === 1) goTo(exact[0]);
    else setShowResults(true);
  };

  if (error)
    return (
      <div className="page-message">
        <p>{error}</p>
        <button className="btn primary" onClick={load}>Try again</button>
        <button className="btn" onClick={() => navigate('/')}>All maps</button>
      </div>
    );
  if (!doc || !floor) return <div className="page-message"><p>Loading map…</p></div>;

  const focused = focus && focus.floorId === floor.id ? floor.objects.find((o) => o.id === focus.id) : undefined;
  const info = tapped ? describe(tapped, doc) : null;
  const tappedFloor = tapped && doc.floors.find((f) => f.objects.some((o) => o.id === tapped.id));

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = e.target.getStage()!.getPointerPosition()!;
    setView((v) => zoomAt(v, p, v.scale * Math.exp(-e.evt.deltaY * 0.0025)));
  };

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const stage = e.target.getStage()!;
    stage.stopDrag();
    const rect = stage.container().getBoundingClientRect();
    const p1 = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
    const p2 = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const prev = pinch.current;
    pinch.current = { dist, center };
    if (!prev) return;
    setView((v) => {
      const z = zoomAt(v, center, v.scale * (dist / prev.dist));
      return { ...z, x: z.x + center.x - prev.center.x, y: z.y + center.y - prev.center.y };
    });
  };

  const onTap = (e: Konva.KonvaEventObject<Event>) => {
    const g = e.target.hasName('obj') ? e.target : e.target.findAncestor('.obj');
    const o = g ? floor.objects.find((x) => x.id === g.id()) : undefined;
    setTapped(o ?? null);
    if (!o) setFocus(null);
  };

  return (
    <div className="viewer" style={{ ['--floor-color' as string]: floorColor(doc.floors.indexOf(floor)) }}>
      {preview && (
        <div className="preview-banner">
          Preview — this is the employee view. <button className="link" onClick={() => navigate(`/edit/${doc.id}`)}>Back to editing</button>
        </div>
      )}
      <header className="viewer-header">
        <button className="icon-btn" aria-label={preview ? 'Back to editor' : 'All maps'} onClick={() => navigate(preview ? `/edit/${doc.id}` : '/')}>
          <Icon name="back" />
        </button>
        <div className="titles">
          <strong data-testid="viewer-facility">{doc.name}</strong>
          <span className="muted small">
            {floor.name} · Updated {ago(doc.updatedAt)}
          </span>
        </div>
        <button className="icon-btn" aria-label="Refresh map" title="Get the latest version" onClick={load}><Icon name="restore" /></button>
      </header>

      <form className="viewer-search" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
        <Icon name="search" size={18} />
        <input
          type="search"
          inputMode="search"
          placeholder="Find a space, e.g. B16"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          aria-label="Find a parking space"
          data-testid="viewer-search"
        />
        {showResults && query.trim() && (
          <ul className="results" data-testid="search-results">
            {hits.length === 0 ? (
              <li className="none">No space or landmark called “{query.trim()}” on this map. Check the number and try again.</li>
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

      <div className="viewer-canvas" ref={boxRef} onClick={() => setShowResults(false)}>
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable
          onDragEnd={(e) => e.target === e.target.getStage() && setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))}
          onWheel={onWheel}
          onTouchMove={onTouchMove}
          onTouchEnd={() => (pinch.current = null)}
          onClick={onTap}
          onTap={onTap}
        >
          <Layer>
            {floor.layers.map((l) =>
              !l.visible ? null : (
                <Group key={l.id}>
                  {floor.background?.layerId === l.id && <BackgroundShape bg={floor.background} listening={false} />}
                  {floor.objects.filter((o) => o.layerId === l.id).map((o) => (
                    <MapObjectShape key={o.id} obj={o} highlighted={o.id === focused?.id} />
                  ))}
                </Group>
              ),
            )}
            {focused && (
              <Group x={focused.x} y={focused.y} rotation={focused.rotation} listening={false}>
                <Rect
                  x={-focused.width / 2 - 6 / view.scale}
                  y={-focused.height / 2 - 6 / view.scale}
                  width={focused.width + 12 / view.scale}
                  height={focused.height + 12 / view.scale}
                  stroke={MAP_PALETTE.ring}
                  strokeWidth={4 / view.scale}
                  cornerRadius={4 / view.scale}
                />
              </Group>
            )}
          </Layer>
        </Stage>
        <button className="fab" onClick={resetView} aria-label="Show whole floor" title="Show whole floor" data-testid="reset-view">
          <Icon name="fit" />
        </button>
        {info && (
          <div className="info-card" data-testid="info-card">
            <div>
              <strong>{info.title}</strong>
              <span className="muted">{[tappedFloor?.name, info.detail].filter(Boolean).join(' · ')}</span>
            </div>
            <button className="icon-btn" aria-label="Close" onClick={() => { setTapped(null); setFocus(null); }}><Icon name="close" /></button>
          </div>
        )}
      </div>

      <nav className="viewer-floors" aria-label="Floors">
        {doc.floors.map((f, i) => (
          <button key={f.id} className={f.id === floor.id ? 'active' : ''} aria-pressed={f.id === floor.id}
            style={{ ['--floor-color' as string]: floorColor(i) }}
            onClick={() => { setFloorId(f.id); setTapped(null); }} data-testid={`viewer-floor-${f.name}`}>
            {f.name}
          </button>
        ))}
      </nav>
    </div>
  );
}
