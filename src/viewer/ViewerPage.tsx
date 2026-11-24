import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import { searchMap, type SearchHit } from '../model/search';
import { buildingName, buildingOf, floorGroup, floorTitle, interiorFloors } from '../model/interiors';
import { InteriorMarkers } from '../render/InteriorMarkers';
import type { MapDocument, MapObject } from '../model/types';
import { clampScale, fitViewport, floorBounds } from '../render/viewport';
import { navigate } from '../router';
import type { MapRepository } from '../storage/repository';
import { Icon } from '../ui/icons';
import { floorVars } from '../theme';
import { findRoute, isBig, placeLabel, type Route } from '../model/route';
import { HereMarker, RouteOverlay } from './RouteOverlay';
import { SideViewSheet } from './SideView';
import { sideView } from '../model/sideView';
import { shareLink, viewerAnnouncement, atHint, boxOf, describe, fromHint, linkTo, searchSummary, useSettled } from './viewerHelpers';
import { type Directions, type Goal, type Start, sheetRoom } from './directionsTypes';
import { FloorList } from './FloorList';
import { DirectionsSheet } from './DirectionsSheet';
import { ViewerFloor } from './ViewerFloor';
import { SearchBox } from './SearchBox';
import { MapHighlights } from './MapHighlights';
import { InfoCard } from './InfoCard';
import { FloorBar } from './FloorBar';
import { useViewerPanZoom } from './useViewerPanZoom';
import { useFloorPrint } from './useFloorPrint';
import { useNewPublishCheck } from './useNewPublishCheck';
import { ViewerHeader } from './ViewerHeader';
import Konva from 'konva';
import '../render/konvaSetup';
export { searchSummary } from './viewerHelpers';

const ROADLIKE = /road|lane|drive|walk|sidewalk|path|zone|area|grass|crosswalk/;


/**
 * The employee view: read-only, phone-first, uses exactly the same map data
 * as the editor. Pan by dragging, pinch or scroll to zoom, tap to identify.
 */
export function ViewerPage({ mapId, repo, preview, backTo = '/' }: {
  mapId: string; repo: MapRepository; preview: boolean;
  /** Where the back button goes; null hides it (a public link to a site's only map). */
  backTo?: string | null;
}) {
  const [doc, setDoc] = useState<(MapDocument & { publishedAt?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [floorId, setFloorId] = useState('');
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ width: 360, height: 640 });
  /** The map stays undrawn until the box has been measured and the floor fitted to it (all before the first paint). */
  const [measured, setMeasured] = useState(false);
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [focus, setFocus] = useState<{ id: string; floorId: string } | null>(null);
  const [tapped, setTapped] = useState<MapObject | null>(null);
  const [dir, setDir] = useState<Directions | null>(null);
  const [avoidStairs, setAvoidStairs] = useState(false);
  const avoidRef = useRef(avoidStairs);
  avoidRef.current = avoidStairs;
  /** The version on screen, to tell whether Refresh brought a newer one. */
  const docRef = useRef<(MapDocument & { publishedAt?: string }) | null>(null);
  const [shared, setShared] = useState(false);
  // Where keyboard focus goes after the next render: the panel that just replaced the
  // button that was pressed (a result, a start place), so focus never drops to the page.
  const moveFocus = useRef<'card' | 'sheet' | 'directions' | 'list' | 'list-button' | 'side' | 'side-button' | 'search' | null>(null);
  /** Focus is going back to the search box after a card closed: don't pop the old results open again. */
  const quietFocus = useRef(false);
  /** Read out when a floor button (or a route step) changes the floor on screen. */
  const [floorNote, setFloorNote] = useState('');
  const floorNoteTimer = useRef<number>();
  const sayFloor = (text: string) => {
    window.clearTimeout(floorNoteTimer.current);
    setFloorNote(text);
    // Cleared soon after, so pressing the same floor again later is read out again.
    floorNoteTimer.current = window.setTimeout(() => setFloorNote(''), 2500);
  };
  useEffect(() => () => window.clearTimeout(floorNoteTimer.current), []);
  /** The floor as a text list (for screen readers, or anyone who'd rather read than look). */
  const [listOpen, setListOpen] = useState(false);
  /** The side view of every floor, stacked (a cross-section of the building). */
  const [sideOpen, setSideOpen] = useState(false);
  useLayoutEffect(() => {
    const want = moveFocus.current;
    if (!want) return;
    const box = boxRef.current;
    const el = want === 'card' ? box?.querySelector<HTMLElement>('.info-card')
      : want === 'sheet' ? box?.querySelector<HTMLElement>('.dir-banner button, .dir-sheet')
      : want === 'list' ? box?.querySelector<HTMLElement>('.floor-list')
      : want === 'list-button' ? document.querySelector<HTMLElement>('[data-testid="list-toggle"]')
      : want === 'side' ? box?.querySelector<HTMLElement>('.side-view')
      : want === 'side-button' ? document.querySelector<HTMLElement>('[data-testid="side-view-toggle"]')
      : want === 'search' ? document.querySelector<HTMLElement>('[data-testid="viewer-search"]')
      : box?.querySelector<HTMLElement>('[data-testid="directions"]');
    if (!el) return;
    moveFocus.current = null;
    if (want === 'search') quietFocus.current = true;
    el.focus({ preventScroll: true });
    quietFocus.current = false;
  });
  const boxRef = useRef<HTMLDivElement>(null);
  /** Where the site map was when someone went inside a building, to come back to. */
  const outside = useRef<{ x: number; y: number; scale: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const onEscape = useRef<() => boolean>(() => false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      // The search box and the floor list handle their own Escape.
      if (t?.closest('input, textarea, select, .floor-list, .results')) return;
      if (onEscape.current()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { mapLayer, moved: mapMoved, layer: mapLayerNode } = useViewerPanZoom({ boxRef, viewRef, setView, doc });

  const load = () => {
    setError(null);
    // Employees only ever see the published version; Preview shows the manager's draft.
    (preview ? repo.getMap(mapId) : repo.getPublishedMap(mapId)).then(
      (loaded) => {
        const d = loaded as (MapDocument & { publishedAt?: string }) | null;
        if (!d) return setError(preview
          ? 'This map isn’t available. It may have been deleted.'
          : 'This map isn’t published yet, or it was removed. Ask your manager to publish it.');
        setDoc(d);
        setFloorId((cur) => (d.floors.some((f) => f.id === cur) ? cur : d.floors[0].id));
        // A refresh brings the manager's latest changes: what's selected follows them, and
        // anything that was removed stops showing (no card for a space that's gone).
        const prev = docRef.current;
        docRef.current = d;
        if (!prev || (prev.publishedAt ?? prev.updatedAt) === (d.publishedAt ?? d.updatedAt)) return;
        sayFloor('The map was updated to the latest published version.');
        const find = (fid: string, id?: string) => (id ? d.floors.find((f) => f.id === fid)?.objects.find((o) => o.id === id) : undefined);
        setTapped((t) => (t ? d.floors.flatMap((f) => f.objects).find((o) => o.id === t.id) ?? null : t));
        setFocus((f) => (f && find(f.floorId, f.id) ? f : null));
        setDir((cur) => {
          if (!cur) return cur;
          const goal = find(cur.goal.floorId, cur.goal.objectId);
          if (!goal) return null;
          const g = { ...cur.goal, x: goal.x, y: goal.y };
          if (!('start' in cur)) return { ...cur, goal: g };
          const so = cur.start.objectId ? find(cur.start.floorId, cur.start.objectId) : undefined;
          if (cur.start.objectId && !so) return { stage: 'pick', goal: g };
          const start = so ? { ...cur.start, x: so.x, y: so.y } : cur.start;
          // Worked out again on the new map, so the line never runs through something just drawn.
          const r = findRoute(d, start, g, { avoidStairs: avoidRef.current });
          return r.ok ? { stage: 'route', goal: g, start, route: r.route } : { stage: 'none', goal: g, start, reason: r.reason };
        });
      },
      () => setError('The latest version of this map couldn’t be loaded. Check your connection and try again.'),
    );
  };
  useEffect(load, [mapId, repo]);
  useNewPublishCheck({ mapId, repo, preview, docRef, load });

  // Measured before the first paint (layout effect), so a big map isn't drawn once at a
  // made-up size and position and then again for real.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    setMeasured(true);
    return () => ro.disconnect();
  }, [doc]);

  const floor = doc?.floors.find((f) => f.id === floorId) ?? doc?.floors[0];

  const printRef = useFloorPrint({ floor, layer: mapLayerNode, boxRef, viewRef });

  const resetView = () => floor && setView(fitViewport(floorBounds(floor), size, 24));
  // Fit when the floor or screen size changes (but not after a search jump).
  const fitKey = `${floor?.id}:${size.width}x${size.height}`;
  const lastFit = useRef('');
  useLayoutEffect(() => {
    if (!floor || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    if (!focus || focus.floorId !== floor.id) resetView();
  }, [fitKey]);

  const hits = useMemo(() => (doc ? searchMap(doc, query) : []), [doc, query]);
  // The result count is read out once typing pauses: said after every letter, the next key press
  // cuts it off, and a screen reader user hears nothing.
  const searchSaid = useSettled(showResults && query.trim() ? searchSummary(hits.length) : '', 600);

  const goTo = (h: SearchHit) => {
    setShowResults(false);
    // Finding something else while directions are up shows that instead (the route was to somewhere else).
    setDir(null);
    setListOpen(false);
    setSideOpen(false);
    moveFocus.current = 'card';
    setFocus({ id: h.object.id, floorId: h.floorId });
    setTapped(h.object);
    setFloorId(h.floorId);
    lastFit.current = `${h.floorId}:${size.width}x${size.height}`;
    const o = h.object;
    const target = Math.min(size.width, size.height) / 5 / Math.max(o.width, o.height);
    const scale = clampScale(Math.max(Math.min(target, 3), 0.6));
    setView({ scale, x: size.width / 2 - o.x * scale, y: size.height / 2 - o.y * scale });
  };

  // A shared link opens on its space or place, once the map is loaded and measured.
  const openedAt = useRef(false);
  useEffect(() => {
    if (openedAt.current || !doc || !measured) return;
    // A shared link opens on its place; a sign's QR code opens on where you're standing.
    const id = atHint() ?? fromHint();
    if (!id) return;
    openedAt.current = true;
    for (const f of doc.floors) {
      const o = f.objects.find((x) => x.id === id);
      if (o) return goTo({ floorId: f.id, floorName: f.name, object: o, title: '', exact: true });
    }
  }, [doc, measured, size]);

  // Asking "where are you starting from?" opens a panel over the map: keep the place being
  // asked about in view, above the panel on a phone, or beside it on a wide screen.
  useLayoutEffect(() => {
    if (dir?.stage !== 'pick' || !doc) return;
    const box = boxRef.current;
    const sheet = box?.querySelector('.dir-sheet');
    const o = doc.floors.find((f) => f.id === dir.goal.floorId && f.id === floorId)?.objects.find((x) => x.id === dir.goal.objectId);
    if (!box || !sheet || !o) return;
    const b = box.getBoundingClientRect();
    const sh = sheet.getBoundingClientRect();
    const v = viewRef.current;
    const r = (Math.max(o.width, o.height) / 2) * v.scale + 16;
    const sx = v.x + o.x * v.scale;
    const sy = v.y + o.y * v.scale;
    const top = sh.top - b.top;
    const left = sh.left - b.left;
    const right = sh.right - b.left;
    if (!(sx + r > left && sx - r < right && sy + r > top)) return;
    const beside = sh.width < b.width * 0.6;
    const next = beside ? { ...v, x: v.x + (right + (b.width - right) / 2 - sx) } : { ...v, y: v.y + (top / 2 - sy) };
    viewRef.current = next;
    setView(next);
  }, [dir?.stage, floorId]);

  const share = (o: MapObject) => shareLink(linkTo(o.id), describe(o, doc!).title, () => {
    setShared(true);
    setTimeout(() => setShared(false), 2500);
  });

  const submitSearch = () => {
    const exact = hits.filter((h) => h.exact);
    // "37" on a garage numbered per floor matches once per floor: the floor on screen wins.
    const here = exact.filter((h) => h.floorId === floor?.id);
    if (exact.length === 1) goTo(exact[0]);
    else if (here.length === 1) goTo(here[0]);
    else setShowResults(true);
  };

  // Room the info card takes at the bottom of the map: a guess until the card has been shown,
  // then its real height (it varies with the buttons). Once the card is on screen, measure it:
  // the map button sits just above it on a phone, and if the space turned out to be under it,
  // slide the map a little more.
  const cardRoom = useRef(160);
  const reKeep = useRef<(id: string) => void>(() => {});
  const tappedId = tapped?.id;
  useLayoutEffect(() => {
    const box = boxRef.current;
    const card = box?.querySelector<HTMLElement>('.info-card');
    if (!box || !card || !tappedId) return;
    const b = box.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const room = Math.round(b.bottom - c.top) + 12;
    box.style.setProperty('--sheet-room', `${room}px`);
    // A card beside the map (wide screens) doesn't cover the middle of it.
    if (c.width > b.width * 0.6 && room !== cardRoom.current) {
      cardRoom.current = room;
      reKeep.current(tappedId);
    }
  }, [tappedId]);
  if (error)
    return (
      <div className="page-message">
        <p>{error}</p>
        <button className="btn primary" onClick={load}>Try again</button>
        {backTo !== null && <button className="btn" onClick={() => navigate(backTo)}>All maps</button>}
      </div>
    );
  if (!doc || !floor) return <div className="page-message"><p>Loading map…</p></div>;

  const keepInView = (o: MapObject) => {
    // Room the info card takes at the bottom of the map, so a tapped space never hides under it.
    const CARD_ROOM = cardRoom.current;
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

  reKeep.current = (id: string) => {
    const o = floor.objects.find((x) => x.id === id);
    if (o) keepInView(o);
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
  const route = dir?.stage === 'route' ? dir.route : null;
  const hereId = fromHint();
  const here = hereId ? floor.objects.find((o) => o.id === hereId) : undefined;
  const routeFloors = new Set(route ? [...route.legs.map((l) => l.floorId), ...route.steps.map((s) => s.floorId)] : []);

  const announcement = viewerAnnouncement({ doc, floor, groupSize: group.length, sideOpen, dir, listOpen,
    searching: showResults && !!query.trim(), searchSaid, info, tappedFloor });

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

  // ------------------------------------------------------------ directions

  /** Shows one floor of the route, zoomed to fit above the directions panel. */
  const showFloorOfRoute = (route: Route, floorId: string) => {
    const f = doc.floors.find((x) => x.id === floorId);
    if (!f) return;
    setFloorId(floorId);
    lastFit.current = `${floorId}:${size.width}x${size.height}`;
    const pts = route.legs.filter((l) => l.floorId === floorId).flatMap((l) => l.points);
    const box = pts.length ? boxOf(pts) : floorBounds(f);
    const room = { width: size.width, height: Math.max(160, size.height - sheetRoom(size.height)) };
    const v = fitViewport(box && { x: box.x - 30, y: box.y - 30, width: box.width + 60, height: box.height + 60 }, room, 24);
    const next = { ...v, scale: Math.min(v.scale, 2.5) };
    // fitViewport centers in the room above the panel; recenter for the capped scale.
    if (box) {
      next.x = room.width / 2 - (box.x + box.width / 2) * next.scale;
      next.y = room.height / 2 - (box.y + box.height / 2) * next.scale;
    }
    viewRef.current = next;
    setView(next);
  };

  const runRoute = (goal: Goal, start: Start, avoid = avoidStairs) => {
    // The Avoid stairs box stays in place (and keeps focus) while the route is redrawn.
    if (!(document.activeElement instanceof HTMLInputElement)) moveFocus.current = 'sheet';
    setDir({ stage: 'busy', goal, start });
    setFocus({ id: goal.objectId, floorId: goal.floorId });
    // Let the "Finding the way" panel paint before the search runs.
    setTimeout(() => {
      const r = findRoute(doc, start, goal, { avoidStairs: avoid });
      if (moveFocus.current === null && !(document.activeElement instanceof HTMLInputElement)) moveFocus.current = 'sheet';
      if (!r.ok) return setDir({ stage: 'none', goal, start, reason: r.reason });
      setDir({ stage: 'route', goal, start, route: r.route });
      showFloorOfRoute(r.route, r.route.legs[0]?.floorId ?? r.route.steps[0]?.floorId ?? start.floorId);
    }, 30);
  };

  const startDirections = (o: MapObject) => {
    const f = doc.floors.find((x) => x.objects.includes(o));
    if (!f) return;
    const goal: Goal = { floorId: f.id, objectId: o.id, x: o.x, y: o.y, name: placeLabel(o) };
    const hint = fromHint();
    const hf = hint ? doc.floors.find((x) => x.objects.some((y) => y.id === hint)) : undefined;
    const ho = hf?.objects.find((y) => y.id === hint);
    if (hf && ho && ho.id !== o.id) return runRoute(goal, { floorId: hf.id, objectId: ho.id, x: ho.x, y: ho.y, name: placeLabel(ho) });
    moveFocus.current = 'sheet';
    setDir({ stage: 'pick', goal });
  };

  const endDirections = () => {
    const goal = dir?.goal;
    moveFocus.current = 'directions';
    setDir(null);
    if (goal) {
      const f = doc.floors.find((x) => x.id === goal.floorId);
      const o = f?.objects.find((x) => x.id === goal.objectId);
      if (f && o) {
        setFloorId(f.id);
        setTapped(o);
        setFocus({ id: o.id, floorId: f.id });
      }
    }
  };

  const onTap = (e: Konva.KonvaEventObject<Event>) => {
    if (mapMoved()) return; // the end of a drag or pinch, not a tap
    const g = e.target.hasName('obj') ? e.target : e.target.findAncestor('.obj');
    const o = g ? floor.objects.find((x) => x.id === g.id()) : undefined;
    if (dir?.stage === 'tap') {
      // Starting from what was tapped (an elevator, your car's space), or just that spot.
      const p = e.target.getStage()!.getRelativePointerPosition();
      if (!p) return;
      // A tap on a road, a lot or a building means "here", not "the whole thing".
      const start: Start = o && o.id !== dir.goal.objectId && !isBig(o) && !(o.kind === 'asset' && ROADLIKE.test(o.assetKey))
        ? { floorId: floor.id, objectId: o.id, x: o.x, y: o.y, name: placeLabel(o) }
        : { floorId: floor.id, x: p.x, y: p.y, name: 'the spot you picked' };
      runRoute(dir.goal, start);
      return;
    }
    if (dir && dir.stage !== 'pick') return; // the route stays up until it's closed
    if (dir) setDir(null);
    setTapped(o ?? null);
    setFocus(o ? { id: o.id, floorId: floor.id } : null);
    if (o) keepInView(o);
  };

  // Escape backs out one step: tap mode to the list of places, directions to the place, the card to the map.
  onEscape.current = () => {
    if (sideOpen) { moveFocus.current = 'side-button'; setSideOpen(false); return true; }
    if (dir?.stage === 'tap') { moveFocus.current = 'sheet'; setDir({ stage: 'pick', goal: dir.goal }); return true; }
    if (dir) { endDirections(); return true; }
    if (tapped) {
      // Focus was on the card (or on nothing): give it to the search box rather than drop it to the page.
      const at = document.activeElement;
      if (!at || at === document.body || at.closest('.info-card')) moveFocus.current = 'search';
      setTapped(null);
      setFocus(null);
      return true;
    }
    return false;
  };

  return (
    <main className="viewer" style={floorVars(group.indexOf(floor))}>
      {preview && (
        <div className="preview-banner">
          Preview — this is the employee view. <button className="link" onClick={() => navigate(`/edit/${doc.id}`)}>Back to editing</button>
        </div>
      )}
      <div className="print-only viewer-print" ref={printRef} aria-hidden="true">
        <style />
        <h1>{doc.name} · {floorTitle(doc, floor)}</h1>
      </div>
      <ViewerHeader mapName={doc.name} floorName={floorTitle(doc, floor)} updatedAt={doc.publishedAt ?? doc.updatedAt}
        preview={preview} listOpen={listOpen} onRefresh={load}
        onBack={preview || backTo !== null ? () => navigate(preview ? `/edit/${doc.id}` : backTo ?? '/') : undefined}
        onToggleList={() => { moveFocus.current = listOpen ? null : 'list'; setListOpen(!listOpen); if (!listOpen) { setDir(null); setTapped(null); setFocus(null); } }} />

      <SearchBox query={query} setQuery={setQuery} showResults={showResults} setShowResults={setShowResults}
        hits={hits} goTo={goTo} submitSearch={submitSearch} quietFocus={quietFocus} />

      <div className="viewer-canvas" ref={boxRef} onClick={() => setShowResults(false)}>
        {/* The drawing itself can't be read aloud; search and the panels below say what's selected. */}
        <div role="img" aria-label={`Map of ${floorTitle(doc, floor)}. Use the search box to find a space or place.`}>
        <Stage
          visible={measured}
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
          <Layer ref={mapLayer}>
            <ViewerFloor floor={floor} focusedId={focused?.id} />
            <MapHighlights matches={matches} focused={focused} view={view} />
            {!floor.interiorOf && <InteriorMarkers objects={floor.objects} ids={interiorIds} scale={view.scale} />}
            {here && !route && <HereMarker x={here.x} y={here.y} scale={view.scale} />}
          </Layer>
          {/* The route draws itself in over about a second. On its own layer, each frame of that
              redraws just the line, not the whole floor (thousands of spaces on a big garage). */}
          <Layer listening={false}>
            {route && <RouteOverlay route={route} floorId={floor.id} scale={view.scale} />}
          </Layer>
        </Stage>
        </div>
        <button className="fab" onClick={resetView} aria-label="Show whole floor" title="Show whole floor" data-testid="reset-view">
          <Icon name="fit" />
        </button>
        {sideOpen && group.length > 1 && (
          <SideViewSheet
            model={sideView(doc, group, {
              focusId: route && dir ? dir.goal.objectId : tapped?.id,
              focusTitle: route && dir ? dir.goal.name : info?.title,
              route,
            })}
            currentId={floor.id}
            title={inside ? `${buildingName(inside.building)}, side view` : 'Side view'}
            onPick={(fid) => {
              const f = doc.floors.find((x) => x.id === fid);
              if (f) sayFloor(`${floorTitle(doc, f)} shown.`);
              moveFocus.current = route ? 'sheet' : tapped ? 'card' : 'side-button';
              setSideOpen(false);
              if (route) return showFloorOfRoute(route, fid);
              setFloorId(fid);
              // The space found stays picked when its own floor is opened.
              if (tappedFloor?.id !== fid) { setTapped(null); setFocus(null); }
            }}
            onClose={() => { moveFocus.current = 'side-button'; setSideOpen(false); }}
          />
        )}
        {listOpen && !dir && !sideOpen && (
          <FloorList doc={doc} floor={floor}
            onPick={(o, title) => goTo({ floorId: floor.id, floorName: floorTitle(doc, floor), object: o, title, exact: true })}
            onClose={() => { moveFocus.current = 'list-button'; setListOpen(false); }} />
        )}
        {info && tapped && !dir && !listOpen && !sideOpen && (
          <InfoCard title={info.title} detail={info.detail} floorName={tappedFloor ? floorTitle(doc, tappedFloor) : undefined}
            showSwatch={!!tappedFloor && group.length > 1} canGoIn={canGoIn} shared={shared}
            onClose={() => { moveFocus.current = 'search'; setTapped(null); setFocus(null); }}
            onGoInside={() => goInside(tapped.id)}
            onDirections={() => startDirections(tapped)}
            onShare={() => void share(tapped)} />
        )}
        {dir?.stage === 'tap' && !sideOpen && (
          <div className="dir-banner dir-sheet" data-testid="dir-tap-banner">
            <span>Tap where you are now</span>
            <button className="btn" onClick={() => { moveFocus.current = 'sheet'; setDir({ stage: 'pick', goal: dir.goal }); }}>Cancel</button>
          </div>
        )}
        {dir && dir.stage !== 'tap' && !sideOpen && (
          <DirectionsSheet
            dir={dir}
            doc={doc}
            floorId={floor.id}
            avoidStairs={avoidStairs}
            onPick={(start) => runRoute(dir.goal, start)}
            onTapMode={() => { moveFocus.current = 'sheet'; setDir({ stage: 'tap', goal: dir.goal }); }}
            onChangeStart={() => { moveFocus.current = 'sheet'; setDir({ stage: 'pick', goal: dir.goal }); }}
            onStep={(fid) => {
              if (!route) return;
              const f = doc.floors.find((x) => x.id === fid);
              if (f && fid !== floor.id) sayFloor(`${floorTitle(doc, f)} shown.`);
              showFloorOfRoute(route, fid);
            }}
            onAvoidStairs={(v) => {
              setAvoidStairs(v);
              if ('start' in dir) runRoute(dir.goal, dir.start, v);
            }}
            onClose={endDirections}
          />
        )}
      </div>

      {/* One floor and nothing to go back out to: the header already names it, so no bar. */}
      {(inside || group.length > 1) && (
        <FloorBar floor={floor} group={group} inside={inside} sideOpen={sideOpen} routeFloors={routeFloors}
          onOutside={goOutside}
          onToggleSide={() => {
            moveFocus.current = sideOpen ? 'side-button' : 'side';
            setSideOpen(!sideOpen);
            if (!sideOpen) setListOpen(false);
          }}
          onPickFloor={(f) => {
            sayFloor(`${floorTitle(doc, f)} shown${routeFloors.has(f.id) ? ', with the route' : ''}.`);
            if (dir?.stage === 'route') return showFloorOfRoute(dir.route, f.id);
            setFloorId(f.id);
            if (!dir) { setTapped(null); setFocus(null); }
          }} />
      )}
      <p className="sr-only" role="status" aria-live="polite" data-testid="viewer-announce">{announcement}</p>
      <p className="sr-only" role="status" aria-live="polite" data-testid="viewer-floor-announce">{floorNote}</p>
    </main>
  );
}
