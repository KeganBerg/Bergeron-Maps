import { useEffect, useState } from 'react';
import { Circle, Group, Label, Line, Tag, Text } from 'react-konva';
import type { Route } from '../model/route';
import { MAP_PALETTE } from '../theme';

/**
 * The walking route on the floor on screen: a solid line in the brand ink on a
 * white casing (so it reads over dark aisles and light spaces alike), a ring
 * where the walk starts, and a tag wherever the route changes floor.
 * Sizes are in screen pixels, so it looks the same at every zoom. The line
 * draws itself from the start, like the demo on the website (at once for
 * people who ask for less motion).
 */
export function RouteOverlay({ route, floorId, scale }: { route: Route; floorId: string; scale: number }) {
  const ink = MAP_PALETTE.selection;
  const k = 1 / scale;
  const legs = route.legs.filter((l) => l.floorId === floorId);
  const shown = useDrawIn(route, floorId);
  const changes = route.steps.filter((s) => s.kind !== 'walk' && s.floorId === floorId);
  const first = route.legs[0];
  return (
    <Group listening={false} name="route">
      {legs.map((l, i) => (
        <Group key={i}>
          <Line points={l.points} stroke="#ffffff" strokeWidth={10 * k} lineCap="round" lineJoin="round" {...dashFor(l.length, shown)} />
          <Line points={l.points} stroke={ink} strokeWidth={5 * k} lineCap="round" lineJoin="round" name="route-line" {...dashFor(l.length, shown)} />
        </Group>
      ))}
      {legs.map((l, i) =>
        l === first ? (
          <Circle key={`s${i}`} x={l.points[0]} y={l.points[1]} radius={8 * k} fill="#ffffff" stroke={ink} strokeWidth={4 * k} name="route-start" />
        ) : (
          // Where you come out from another floor.
          <Circle key={`s${i}`} x={l.points[0]} y={l.points[1]} radius={7 * k} fill={ink} stroke="#ffffff" strokeWidth={3 * k} />
        ),
      )}
      {changes.map((s, i) => (
        <Group key={`c${i}`} x={s.x} y={s.y}>
          <Circle radius={7 * k} fill={ink} stroke="#ffffff" strokeWidth={3 * k} />
          <Label y={-12 * k} name="route-change">
            <Tag fill={ink} pointerDirection="down" pointerWidth={10 * k} pointerHeight={6 * k} cornerRadius={3 * k} />
            <Text text={s.tag ?? s.text} fill="#ffffff" fontSize={13 * k} fontStyle="bold" fontFamily={MAP_PALETTE.font} padding={6 * k} />
          </Label>
        </Group>
      ))}
    </Group>
  );
}

const DRAW_MS = 900;

/** 0..1: how much of the line is drawn, from 0 each time a new route (or another floor of it) is shown. */
function useDrawIn(route: Route, floorId: string): number {
  const [t, setT] = useState(1);
  useEffect(() => {
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return setT(1);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const x = Math.min(1, (now - t0) / DRAW_MS);
      setT(x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2); // ease in and out
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    setT(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route, floorId]);
  return t;
}

function dashFor(length: number, shown: number) {
  if (shown >= 1) return {};
  const L = length + 1;
  return { dash: [L, L], dashOffset: L * (1 - shown) };
}

/** "You are here", where a sign's QR code says the person is standing (a ?from= link). */
export function HereMarker({ x, y, scale, label }: { x: number; y: number; scale: number; label: string }) {
  const ink = MAP_PALETTE.selection;
  const k = 1 / scale;
  return (
    <Group x={x} y={y} listening={false} name="here-marker">
      <Circle radius={9 * k} fill="#2563eb" stroke="#ffffff" strokeWidth={3 * k} />
      <Label y={-14 * k}>
        <Tag fill={ink} pointerDirection="down" pointerWidth={10 * k} pointerHeight={6 * k} cornerRadius={3 * k} />
        <Text text={label} fill="#ffffff" fontSize={13 * k} fontStyle="bold" fontFamily={MAP_PALETTE.font} padding={6 * k} />
      </Label>
    </Group>
  );
}
