import { Circle, Group, Label, Line, Tag, Text } from 'react-konva';
import type { Route } from '../model/route';
import { MAP_PALETTE } from '../theme';

/**
 * The walking route on the floor on screen: a solid line in the brand ink on a
 * white casing (so it reads over dark aisles and light spaces alike), a ring
 * where the walk starts, and a tag wherever the route changes floor.
 * Sizes are in screen pixels, so it looks the same at every zoom.
 */
export function RouteOverlay({ route, floorId, scale }: { route: Route; floorId: string; scale: number }) {
  const ink = MAP_PALETTE.selection;
  const k = 1 / scale;
  const legs = route.legs.filter((l) => l.floorId === floorId);
  const changes = route.steps.filter((s) => s.kind !== 'walk' && s.floorId === floorId);
  const first = route.legs[0];
  return (
    <Group listening={false} name="route">
      {legs.map((l, i) => (
        <Group key={i}>
          <Line points={l.points} stroke="#ffffff" strokeWidth={10 * k} lineCap="round" lineJoin="round" />
          <Line points={l.points} stroke={ink} strokeWidth={5 * k} lineCap="round" lineJoin="round" name="route-line" />
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
            <Text text={tagText(s.text)} fill="#ffffff" fontSize={13 * k} fontStyle="bold" fontFamily={MAP_PALETTE.font} padding={6 * k} />
          </Label>
        </Group>
      ))}
    </Group>
  );
}

/** "Take Elevator 1 up to Floor 3" -> "Up to Floor 3"; "Go inside Main building" stays. */
function tagText(t: string): string {
  const m = /\b(up|down|across) to (.+)$/.exec(t);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} to ${m[2]}`;
  return t;
}
