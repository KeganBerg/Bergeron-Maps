import { Group, Path, Rect } from 'react-konva';
import type { MapObject } from '../model/types';
import { MAP_PALETTE } from '../theme';

/** The "go inside" door-and-arrow mark, in a 24 × 24 box. */
const ENTER_PATH = 'M13 4h6v16h-6M3 12h11M10 8l4 4-4 4';

/**
 * A small door mark in the top-right corner of every building that has a
 * floor plan, so people can see which buildings they can go into. It stays
 * the same size on screen at any zoom and never takes clicks itself.
 */
export function InteriorMarkers({ objects, ids, scale }: { objects: MapObject[]; ids: Set<string>; scale: number }) {
  if (!ids.size) return null;
  const k = 1 / scale;
  const size = 20 * k;
  return (
    <Group listening={false}>
      {objects
        .filter((o) => ids.has(o.id))
        .map((o) => {
          // Shrink the mark on small buildings so it never covers the badge.
          const s = Math.min(size, Math.min(o.width, o.height) * 0.28);
          const pad = Math.min(6 * k, s * 0.3);
          return (
            <Group key={o.id} x={o.x} y={o.y} rotation={o.rotation}>
              <Group x={o.width / 2 - pad - s / 2} y={-o.height / 2 + pad + s / 2} rotation={-o.rotation}>
                <Rect x={-s / 2} y={-s / 2} width={s} height={s} cornerRadius={s * 0.2} fill="#ffffff" stroke={MAP_PALETTE.label} strokeWidth={s * 0.07} />
                <Path data={ENTER_PATH} x={-s * 0.36} y={-s * 0.36} scaleX={(s * 0.72) / 24} scaleY={(s * 0.72) / 24}
                  stroke={MAP_PALETTE.label} strokeWidth={2.2} lineCap="round" lineJoin="round" />
              </Group>
            </Group>
          );
        })}
    </Group>
  );
}
