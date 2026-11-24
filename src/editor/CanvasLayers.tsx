/** Layers of the editor's map that redraw only when their own inputs change: the floor's objects and the grid. */
import { memo, useCallback, useMemo } from 'react';
import { Group, Shape } from 'react-konva';
import type { Floor, MapObject } from '../model/types';
import { BackgroundShape, LayerObjects } from '../render/MapObjects';
import { useCulledGroup } from '../render/cull';
import { useEditor } from './store';

/**
 * The floor's drawn objects. Kept apart from the canvas so zooming, panning and
 * selecting don't re-check thousands of objects that haven't changed.
 */
export const FloorObjects = memo(function FloorObjects({ floor, duplicates, bgEditable, bgSelected }: {
  floor: Floor; duplicates: Set<string>; bgEditable: boolean; bgSelected: boolean;
}) {
  const objProps = useCallback((o: MapObject) => ({ duplicate: duplicates.has(o.id) }), [duplicates]);
  const byLayer = useMemo(() => {
    const m = new Map<string, MapObject[]>();
    for (const o of floor.objects) {
      const list = m.get(o.layerId);
      if (list) list.push(o);
      else m.set(o.layerId, [o]);
    }
    return m;
  }, [floor.objects]);
  const culled = useCulledGroup(floor.objects);
  return (
    <>
      {floor.layers.map((layer) => {
        if (!layer.visible) return null;
        const listening = !layer.locked;
        return (
          <Group key={layer.id} listening={listening} ref={culled}>
            {floor.background?.layerId === layer.id && (
              <BackgroundShape
                bg={floor.background}
                listening={bgEditable}
                draggable={bgSelected}
                onMoved={(x, y) => useEditor.getState().updateBackground({ x, y })}
              />
            )}
            <LayerObjects honorLocks objects={byLayer.get(layer.id) ?? NO_OBJECTS} curbs={floor.objects} objProps={objProps} />
          </Group>
        );
      })}
    </>
  );
});
const NO_OBJECTS: MapObject[] = [];


export function GridLines({ viewport, size, grid }: { viewport: { x: number; y: number; scale: number }; size: { width: number; height: number }; grid: number }) {
  let step = grid;
  while (step * viewport.scale < 8) step *= 5;
  return (
    <Shape
      name="grid-lines"
      listening={false}
      sceneFunc={(ctx) => {
        const x0 = Math.floor(-viewport.x / viewport.scale / step) * step;
        const y0 = Math.floor(-viewport.y / viewport.scale / step) * step;
        const x1 = (size.width - viewport.x) / viewport.scale;
        const y1 = (size.height - viewport.y) / viewport.scale;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += step) {
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y1);
        }
        for (let y = y0; y <= y1; y += step) {
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
        }
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1 / viewport.scale;
        ctx.stroke();
      }}
    />
  );
}
