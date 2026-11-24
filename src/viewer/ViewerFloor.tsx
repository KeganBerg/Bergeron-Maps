import { memo, useCallback } from 'react';
import { Group } from 'react-konva';
import type { Floor, MapObject } from '../model/types';
import { BackgroundShape, LayerObjects } from '../render/MapObjects';
import { useCulledGroup } from '../render/cull';

/**
 * The floor's drawn objects. Kept apart so pinching, panning and typing in the
 * search box don't re-check thousands of spaces that haven't changed.
 */
export const ViewerFloor = memo(function ViewerFloor({ floor, focusedId }: { floor: Floor; focusedId?: string }) {
  const objProps = useCallback((o: MapObject) => ({ highlighted: o.id === focusedId }), [focusedId]);
  const culled = useCulledGroup(floor.objects);
  return (
    <>
      {floor.layers.map((l) =>
        !l.visible ? null : (
          <Group key={l.id} ref={culled}>
            {floor.background?.layerId === l.id && <BackgroundShape bg={floor.background} listening={false} />}
            <LayerObjects objects={floor.objects.filter((o) => o.layerId === l.id)} curbs={floor.objects} objProps={objProps} />
          </Group>
        ),
      )}
    </>
  );
});
