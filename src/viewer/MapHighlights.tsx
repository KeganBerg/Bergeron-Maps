import { Group, Rect } from 'react-konva';
import type { MapObject } from '../model/types';
import { MAP_PALETTE } from '../theme';

/**
 * Rings drawn on the viewer's map: a thin one round every search match on this
 * floor, and a bold one round the space or place that is picked. Line widths
 * are divided by the zoom so they look the same at any zoom.
 */
export function MapHighlights({ matches, focused, view }: { matches: MapObject[]; focused?: MapObject; view: { scale: number } }) {
  return (
    <>
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
              <Rect
                x={-m.width / 2 - 4 / view.scale}
                y={-m.height / 2 - 4 / view.scale}
                width={m.width + 8 / view.scale}
                height={m.height + 8 / view.scale}
                stroke={MAP_PALETTE.ringEdge}
                strokeWidth={1.5 / view.scale}
              />
            </Group>
          ))}
          {focused && (
            <Group x={focused.x} y={focused.y} rotation={focused.rotation} listening={false}>
              <Rect
                x={-focused.width / 2 - 4.5 / view.scale}
                y={-focused.height / 2 - 4.5 / view.scale}
                width={focused.width + 9 / view.scale}
                height={focused.height + 9 / view.scale}
                stroke={MAP_PALETTE.ringEdge}
                strokeWidth={2 / view.scale}
                cornerRadius={4 / view.scale}
              />
              <Rect
                x={-focused.width / 2 - 2.5 / view.scale}
                y={-focused.height / 2 - 2.5 / view.scale}
                width={focused.width + 5 / view.scale}
                height={focused.height + 5 / view.scale}
                stroke={MAP_PALETTE.ring}
                strokeWidth={2.5 / view.scale}
                cornerRadius={3 / view.scale}
                name="focus-ring"
              />
            </Group>
          )}
    </>
  );
}
