import { useRef } from 'react';
import { Circle, Group, Line, Rect } from 'react-konva';
import type Konva from 'konva';
import { ASSET_BY_KEY } from '../assets/library';
import { curvePx, reshapedFields, type CurvePoints } from '../model/curve';
import { bandWidth, toLocal, toWorld } from '../model/shape';
import type { AssetObject, MapObject } from '../model/types';
import { MAP_PALETTE } from '../theme';
import { useEditor } from './store';

/** Curved pieces whose shape can be bent with handles (curved roads, lanes and grass dividers). */
export const canBend = (o: MapObject | undefined): o is AssetObject =>
  !!o && o.kind === 'asset' && !o.imageSrc && !o.locked && ASSET_BY_KEY[o.assetKey]?.outline === 'arc';

export const bandOf = (o: AssetObject) => bandWidth({ width: o.width, height: o.height, band: o.band ?? ASSET_BY_KEY[o.assetKey]?.band, curve: o.curve });

/**
 * Handles for bending a curved piece to match the photo under it: a square at
 * each end moves that end, and a round handle on a line from each end sets
 * which way the road leaves that end and how far it runs before turning (the
 * longer the line, the wider the bend). Drawn the same size at any zoom.
 */
export function CurveHandles({ o, scale, coarse }: { o: AssetObject; scale: number; coarse: boolean }) {
  const st = useEditor.getState;
  const t = bandOf(o);
  const p = curvePx(o, t);
  const w = (x: number, y: number) => toWorld(o, x, y);
  const pts = [0, 1, 2, 3].map((k) => w(p[k * 2], p[k * 2 + 1]));
  // The piece and its centre line as they were when the drag started: every move is measured in that frame.
  const start = useRef<{ o: AssetObject; p: CurvePoints } | null>(null);
  const r = (coarse ? 11 : 7) / scale;
  const sw = 1.5 / scale;

  const begin = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    start.current = { o, p };
    st().beginGesture();
  };
  const move = (k: number) => (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const s = start.current;
    if (!s) return;
    const [lx, ly] = toLocal(s.o, e.target.x(), e.target.y());
    const next = [...s.p];
    // Moving an end takes its handle along, so the road leaves the end the same way.
    if (k === 0 || k === 3) {
      const h = k === 0 ? 1 : 2;
      next[h * 2] += lx - next[k * 2];
      next[h * 2 + 1] += ly - next[k * 2 + 1];
    }
    next[k * 2] = lx;
    next[k * 2 + 1] = ly;
    const fields = reshapedFields(s.o, next, t);
    st().previewGesture((_d, f) => {
      const obj = f.objects.find((x) => x.id === o.id);
      if (obj) Object.assign(obj, fields);
    });
  };
  const end = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    start.current = null;
    st().endGesture();
  };
  const handle = (k: number) => {
    const [x, y] = pts[k];
    const common = {
      x, y, draggable: true, name: 'curve-handle', stroke: MAP_PALETTE.selection, strokeWidth: sw, fill: '#ffffff',
      onDragStart: begin, onDragMove: move(k), onDragEnd: end,
      onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => { e.target.getStage()!.container().style.cursor = 'move'; },
      onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => { e.target.getStage()!.container().style.cursor = ''; },
    };
    return k === 0 || k === 3
      ? <Rect key={k} {...common} width={r * 1.8} height={r * 1.8} offsetX={r * 0.9} offsetY={r * 0.9} cornerRadius={2 / scale} />
      : <Circle key={k} {...common} radius={r} fill={MAP_PALETTE.selection} stroke="#ffffff" />;
  };
  return (
    <Group name="curve-handles">
      <Line points={[...pts[0], ...pts[1]]} stroke={MAP_PALETTE.selection} strokeWidth={sw} dash={[5 / scale, 4 / scale]} listening={false} />
      <Line points={[...pts[3], ...pts[2]]} stroke={MAP_PALETTE.selection} strokeWidth={sw} dash={[5 / scale, 4 / scale]} listening={false} />
      {[1, 2, 0, 3].map(handle)}
    </Group>
  );
}
