import Konva from 'konva';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import { ASSET_BY_KEY } from '../assets/library';
import { searchMap, type SearchHit } from '../model/search';
import { buildingName, buildingOf, floorGroup, floorTitle, interiorFloors } from '../model/interiors';
import { InteriorMarkers } from '../render/InteriorMarkers';
import type { Floor, MapDocument, MapObject } from '../model/types';
import { BackgroundShape, LayerObjects } from '../render/MapObjects';
import { PanZoomTracker, wheelView } from '../render/panZoom';
import { clampScale, fitViewport, floorBounds } from '../render/viewport';
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
 * as the editor. Pan by dragging, pinch or scroll to zoom, tap to identify.
 */
export function ViewerPage({ mapId, repo, preview }: { mapId: string; repo: MapRepository; preview: boolean }) {
  const [doc, setDoc] = useState<(MapDocument & { publishedAt?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [floorId, setFloorId] = useState('');
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ width: 360, height: 640 });
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [focus, setFocus] = useState<{ id: string; floorId: string } | null>(null);
  const [tapped, setTapped] = useState<MapObject | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const tracker = useRef(new PanZoomTracker());
  /** Where the site map was when someone went inside a building, to come back to. */
  const outside = useRef<{ x: number; y: number; scale: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Drag to pan, pinch to zoom, wheel/trackpad. Native listeners on the canvas box
  // so every finger is seen (Konva only reports one pointer at a time).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const t = tracker.current;
    const at = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const set = (v: { x: number; y: number; scale: number }) => {
      viewRef.current = v;
      setView(v);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, .info-card')) return;
      t.down(e.pointerId, at(e), viewRef.current);
      t.startPan(e.pointerId, viewRef.current);
      // No pointer capture: it would steal the pointerup from Konva, so mouse clicks on a
      // space never registered. The window listeners below already follow drags off the map.
    };
    const onMove = (e: PointerEvent) => {
      const v = t.move(e.pointerId, at(e));
      if (v) set(v);
    };
    const onUp = (e: PointerEvent) => t.up(e.pointerId, viewRef.current);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      set(wheelView(viewRef.current, e, at(e), el.clientHeight));
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      t.reset();
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [doc]);

  const load = () => {
    setError(null);
    // Employees only ever see the published version; Preview shows the manager's draft.
    (preview ? repo.getMap(mapId) : repo.getPublishedMap(mapId)).then(
      (d) => {
        if (!d) return setError(preview
          ? 'This map isn’t available. It may have been deleted.'
          : 'This map isn’t published yet, or it was removed. Ask your manager to publish it.');
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
    // "37" on a garage numbered per floor matches once per floor: the floor on screen wins.
    const here = exact.filter((h) => h.floorId === floor?.id);
    if (exact.length === 1) goTo(exact[0]);
    else if (here.length === 1) goTo(here[0]);
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

  // Room the info card takes at the bottom of the map, so a tapped space never hides under it.
  const CARD_ROOM = 96;
  const keepInView = (o: MapObject) => {
    const v = viewRef.current;
    const sx = v.x + o.x * v.scale;
    const sy = v.y + o.y * v.scale;
    const r = (Math.max(o.width, o.height) / 2) * v.scale + 12;
    let dx = 0;
    let dy = 0;
    if (sx - r < 0) dx = r - sx;
    else if (sx + r > size.width) dx = size.width - (sx + r);
    if (sy + r > size.height - CARD_ROOM) dy = size.height - CARD_ROOM - (sy + r);
    else if (sy - r < 0) dy = r - sy;
    if (dx || dy) {
      const next = { ...v, x: v.x + dx, y: v.y + dy };
      viewRef.current = next;
      setView(next);
    }
  };

  const focused = focus && focus.floorId === floor.id ? floor.objects.find((o) => o.id === focus.id) : undefined;
  // While the results list is open, outline every match on this floor so typing "1" shows where the 1s are.
  const matches = showResults && query.trim()
    ? hits.filter((h) => h.floorId === floor.id && h.object.id !== focused?.id).map((h) => h.object)
    : [];
  const info = tapped ? describe(tapped, doc) : null;
  const tappedFloor = tapped && doc.floors.find((f) => f.objects.some((o) => o.id === tapped.id));
  const inside = buildingOf(doc, floor);
  const group = floorGroup(doc, floor);
  const interiorIds = new Set(doc.floors.map((f) => f.interiorOf).filter((x): x is string => !!x));
  const canGoIn = !!tapped && !floor.interiorOf && interiorIds.has(tapped.id);

  const goInside = (buildingId: string) => {
    const first = interiorFloors(doc, buildingId)[0];
    if (!first) return;
    outside.current = viewRef.current;
    setTapped(null);
    setFocus(null);
    setFloorId(first.id);
  };
  const goOutside = () => {
    if (!inside) return;
    const b = inside.building;
    setFloorId(inside.floor.id);
    setTapped(b);
    setFocus({ id: b.id, floorId: inside.floor.id });
    if (outside.current) {
      lastFit.current = `${inside.floor.id}:${size.width}x${size.height}`;
      setView(outside.current);
      outside.current = null;
    }
  };

  const onTap = (e: Konva.KonvaEventObject<Event>) => {
    if (tracker.current.moved) return; // the end of a drag or pinch, not a tap
    const g = e.target.hasName('obj') ? e.target : e.target.findAncestor('.obj');
    const o = g ? floor.objects.find((x) => x.id === g.id()) : undefined;
    setTapped(o ?? null);
    setFocus(o ? { id: o.id, floorId: floor.id } : null);
    if (o) keepInView(o);
  };

  return (
    <div className="viewer" style={{ ['--floor-color' as string]: floorColor(group.indexOf(floor)) }}>
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
            {floorTitle(doc, floor)} · {preview ? 'Draft' : 'Updated'} {ago(doc.publishedAt ?? doc.updatedAt)}
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
          // One handler for mouse, pen and finger. Listening to both click and tap
          // counted a finger tap twice: the tap, then the browser's copy-cat mouse
          // click a moment later. If the map slid in between (to keep the tapped
          // space clear of the card), that second click landed on the neighbor.
          onPointerClick={onTap}
        >
          <Layer>
            <ViewerFloor floor={floor} focusedId={focused?.id} />
            {matches.map((m) => (
              <Group key={m.id} x={m.x} y={m.y} rotation={m.rotation} listening={false}>
                <Rect
                  x={-m.width / 2 - 2 / view.scale}
                  y={-m.height / 2 - 2 / view.scale}
                  width={m.width + 4 / view.scale}
                  height={m.height + 4 / view.scale}
                  stroke={MAP_PALETTE.ring}
                  strokeWidth={3 / view.scale}
                  name="search-match"
                />
              </Group>
            ))}
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
                  name="focus-ring"
                />
              </Group>
            )}
            {!floor.interiorOf && <InteriorMarkers objects={floor.objects} ids={interiorIds} scale={view.scale} />}
          </Layer>
        </Stage>
        <button className="fab" onClick={resetView} aria-label="Show whole floor" title="Show whole floor" data-testid="reset-view">
          <Icon name="fit" />
        </button>
        {info && (
          <div className="info-card" data-testid="info-card">
            <div>
              <strong>{info.title}</strong>
              <span className="muted">{[tappedFloor && floorTitle(doc, tappedFloor), info.detail].filter(Boolean).join(' · ')}</span>
            </div>
            {canGoIn && (
              <button className="btn primary go-inside" onClick={() => goInside(tapped!.id)} data-testid="go-inside">
                <Icon name="enter" size={16} /> Go inside
              </button>
            )}
            <button className="icon-btn" aria-label="Close" onClick={() => { setTapped(null); setFocus(null); }}><Icon name="close" /></button>
          </div>
        )}
      </div>

      <nav className="viewer-floors" aria-label="Floors">
        {inside && (
          <button className="outside" onClick={goOutside} data-testid="go-outside" title={`Back outside to ${inside.floor.name}`}>
            <Icon name="back" size={16} /> Outside
          </button>
        )}
        {inside && <span className="viewer-building" data-testid="viewer-building">{buildingName(inside.building)}</span>}
        {(inside && group.length < 2 ? [] : group).map((f, i) => (
          <button key={f.id} className={f.id === floor.id ? 'active' : ''} aria-pressed={f.id === floor.id}
            style={{ ['--floor-color' as string]: floorColor(i) }}
            onClick={() => { setFloorId(f.id); setTapped(null); setFocus(null); }} data-testid={`viewer-floor-${f.name}`}>
            {f.name}
          </button>
        ))}
      </nav>
    </div>
  );
}

/**
 * The floor's drawn objects. Kept apart so pinching, panning and typing in the
 * search box don't re-check thousands of spaces that haven't changed.
 */
const ViewerFloor = memo(function ViewerFloor({ floor, focusedId }: { floor: Floor; focusedId?: string }) {
  const objProps = useCallback((o: MapObject) => ({ highlighted: o.id === focusedId }), [focusedId]);
  return (
    <>
      {floor.layers.map((l) =>
        !l.visible ? null : (
          <Group key={l.id}>
            {floor.background?.layerId === l.id && <BackgroundShape bg={floor.background} listening={false} />}
            <LayerObjects objects={floor.objects.filter((o) => o.layerId === l.id)} curbs={floor.objects} objProps={objProps} />
          </Group>
        ),
      )}
    </>
  );
});
