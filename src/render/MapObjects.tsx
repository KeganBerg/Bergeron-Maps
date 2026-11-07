import { Fragment, memo, useMemo } from 'react';
import type Konva from 'konva';
import { Group, Image as KImage, Line, Rect, Shape, Text } from 'react-konva';
import { spaceMarks, spaceOutline } from '../assets/catalog/spaces';
import { badgeLayout } from '../assets/draw';
import { ASSET_BY_KEY, defaultBlend, isShapeable, mergeKey, renderAssetSvg, shapeSourceFor, svgDataUrl, symbolSupport, type AssetDef } from '../assets/library';
import { bandWidth, insetLines, isShaped, localOutline, maxCorner, mergeClusters, subtractRings, toLocal, toWorld, traceRings, type Ring } from '../model/shape';
import { P, svgDoc, withAlpha } from '../assets/style';
import type { AssetObject, BackgroundImage, MapObject, SpaceObject, SpaceVariant, TextObject } from '../model/types';
import { useImage } from './useImage';
import { fitLabel, LABEL_LINE_HEIGHT } from './fitLabel';
import { MAP_PALETTE } from '../theme';
import { SPACE_FILL } from '../model/rows';

export const LABEL_FONT = MAP_PALETTE.font;

interface ObjProps {
  obj: MapObject;
  duplicate?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
}

/**
 * Text that stays upright on screen whatever the object's rotation. With
 * `fitW`/`fitH` (the room the object leaves for it) it shrinks or breaks onto
 * two lines so it never spills into neighbouring objects.
 */
function UprightLabel({ text, x, y, rotation, size, color = MAP_PALETTE.label, maxWidth, fitW, fitH }: {
  text: string; x: number; y: number; rotation: number; size: number; color?: string; maxWidth: number; fitW?: number; fitH?: number;
}) {
  const fitted = fitW ? fitLabel(text, size, fitW, fitH ?? size * 3) : { lines: [text], size };
  const fs = fitted.size;
  const body = fitted.lines.join('\n');
  const h = fs * LABEL_LINE_HEIGHT * fitted.lines.length;
  const w = fitW ? Math.max(fitW, ...fitted.lines.map((l) => fs * l.length * 0.7)) : Math.max(maxWidth, fs * text.length * 0.7);
  return (
    <Text
      text={body}
      x={x}
      y={y}
      width={w}
      height={h}
      offsetX={w / 2}
      offsetY={h / 2}
      lineHeight={LABEL_LINE_HEIGHT}
      wrap="none"
      rotation={-rotation}
      align="center"
      verticalAlign="middle"
      fontSize={fs}
      fontStyle="bold"
      fontFamily={LABEL_FONT}
      fill={color}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

export function spaceFontSize(s: Pick<SpaceObject, 'width' | 'height'>) {
  return Math.max(9, Math.min(24, Math.min(s.width, s.height) * 0.34));
}

export const spaceVariant = (s: Pick<SpaceObject, 'variant' | 'accessible'>): SpaceVariant =>
  s.variant ?? (s.accessible ? 'accessible' : 'standard');

/** Space paint: the object's own settings over the theme defaults. */
export function spacePaint(obj: SpaceObject) {
  return {
    fill: obj.fill === SPACE_FILL || !obj.fill ? MAP_PALETTE.spaceFill : obj.fill,
    fo: obj.fillOpacity ?? 1,
    stroke: obj.stroke || MAP_PALETTE.spaceStroke,
    sw: obj.strokeWidth ?? 1.5,
  };
}

function useSvgImage(markup: string | null) {
  const src = useMemo(() => (markup ? svgDataUrl(markup) : undefined), [markup]);
  return useImage(src);
}

const SpaceShape = memo(function SpaceShape({ obj, duplicate, highlighted }: ObjProps & { obj: SpaceObject }) {
  const size = spaceFontSize(obj);
  const variant = spaceVariant(obj);
  const p = spacePaint(obj);
  const marks = useMemo(() => {
    const body = spaceMarks(variant, obj.width, obj.height, obj.labelPlacement, p.stroke);
    return body ? svgDoc(obj.width, obj.height, body) : null;
  }, [variant, obj.width, obj.height, obj.labelPlacement, p.stroke]);
  const marksImg = useSvgImage(marks);
  const ly = obj.labelPlacement === 'top' ? size : obj.labelPlacement === 'bottom' ? obj.height - size : obj.height / 2;
  // Room for the number: the stall width (minus an accessible aisle) by about half its depth.
  const aisle = variant === 'accessible' && obj.width / obj.height >= 0.75 ? obj.width * 0.38 : 0;
  const labelRoomW = obj.width - aisle;
  const labelRoomH = obj.labelPlacement === 'center' && variant === 'standard' ? obj.height : obj.height * 0.5;
  const rot = ((obj.rotation % 180) + 180) % 180;
  const sideways = rot > 45 && rot < 135;
  const lx = variant === 'accessible' && obj.width / obj.height >= 0.75 ? (obj.width * 0.62) / 2 : obj.width / 2;
  const fill = highlighted ? MAP_PALETTE.highlightFill : withAlpha(p.fill, p.fo);
  const stroke = duplicate ? '#dc2626' : p.stroke;
  const sw = duplicate ? 3 : p.sw;
  const bodyProps = {
    fill,
    stroke: sw > 0 ? stroke : undefined,
    strokeWidth: sw,
    strokeEnabled: sw > 0,
    dash: duplicate ? [6, 3] : undefined,
    perfectDrawEnabled: false,
  };
  return (
    <Group id={obj.id} name="obj" x={obj.x} y={obj.y} rotation={obj.rotation} offsetX={obj.width / 2} offsetY={obj.height / 2}>
      {variant === 'angled' ? (
        <>
          {/* Invisible box keeps the whole stall clickable. */}
          <Rect width={obj.width} height={obj.height} fill="rgba(0,0,0,0.001)" />
          <Line points={spaceOutline(variant, obj.width, obj.height)} closed {...bodyProps} />
        </>
      ) : (obj.corner ?? 0) > 0 && obj.bevel ? (
        <>
          <Rect width={obj.width} height={obj.height} fill="rgba(0,0,0,0.001)" />
          <Line points={localOutline(obj)[0] ?? []} closed {...bodyProps} />
        </>
      ) : (
        <Rect width={obj.width} height={obj.height} cornerRadius={Math.min(obj.corner ?? 0, maxCorner(obj))} {...bodyProps} />
      )}
      {marksImg && <KImage image={marksImg} width={obj.width} height={obj.height} listening={false} perfectDrawEnabled={false} />}
      <UprightLabel text={obj.label} x={lx} y={ly} rotation={obj.rotation} size={size} maxWidth={obj.width}
        fitW={sideways ? labelRoomH : labelRoomW} fitH={sideways ? labelRoomW : labelRoomH}
        color={highlighted ? MAP_PALETTE.highlightLabel : MAP_PALETTE.label} />
    </Group>
  );
});

/** Where an asset's name label goes, in the object's own coordinates. */
function labelSpot(def: AssetDef | undefined, obj: AssetObject): { y: number; size: number } | null {
  const { width: w, height: h } = obj;
  let pos = def?.labelPos ?? 'below';
  // The name sits under the badge only while there is a badge.
  if (def && (pos === 'badge' || pos === 'center') && symbolSupport(def).custom) {
    const shows = !obj.symbolHidden && (!!obj.symbol || (pos === 'badge' && symbolSupport(def).builtIn));
    pos = shows ? 'badge' : 'center';
  }
  if (pos === 'inside') return null;
  if (pos === 'below') return { y: h + 10, size: Math.max(10, Math.min(14, Math.max(w, h) * 0.22)) };
  const size = Math.max(10, Math.min(20, Math.min(w, h) * 0.16, (w / 8) * 1.6));
  return { y: pos === 'badge' ? badgeLayout(w, h).labelY : h / 2, size };
}

/**
 * How a piece inside a merged shape draws itself: 'ghost' = nothing (the merged
 * shape paints it), 'fill' = its own drawing without a border, clipped to its
 * outline (the merged shape paints the one outline), 'marks' = only its
 * paint marks, clipped to `markClip` (merged roads: the shared surface and
 * edge lines are painted once by the merged shape).
 */
type MergedMode = 'ghost' | 'fill' | 'marks';

const AssetShape = memo(function AssetShape({ obj, merged: mode, markClip, highlighted }: ObjProps & { obj: AssetObject; merged?: MergedMode; markClip?: Ring[] }) {
  const def = ASSET_BY_KEY[obj.assetKey];
  const src = mergeSourceFor(def, obj);
  const merged = mode === 'ghost';
  const shaped = (!obj.imageSrc && !!def && isShapeable(def) && isShaped(src)) || mode === 'fill';
  const rings = useMemo(
    () => (shaped || merged ? localOutline(src) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shaped, merged, obj.width, obj.height, src.outline, obj.corner, obj.bevel, src.band, obj.cuts],
  );
  const markup = useMemo(
    // Shaped pieces draw their own border along the outline, so the box border is left off.
    () => (def && !obj.imageSrc && !merged ? renderAssetSvg(def, shaped || mode ? { ...obj, strokeWidth: 0, marksOnly: mode === 'marks' } : obj) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, merged, shaped, mode, obj.band, obj.imageSrc, obj.width, obj.height, obj.fill, obj.fillOpacity, obj.stroke, obj.strokeWidth, obj.label, obj.symbol, obj.symbolHidden],
  );
  const drawn = useSvgImage(markup);
  const photo = useImage(obj.imageSrc);
  const label = obj.label?.trim();
  const spot = label ? labelSpot(def, obj) : null;
  const clipRings = mode === 'marks' && markClip ? markClip : rings;
  const clip = clipRings ? (ctx: Konva.Context) => traceRings(ctx, clipRings) : undefined;
  const sw = obj.strokeWidth ?? def?.strokeWidth ?? 0;
  return (
    <Group id={obj.id} name="obj" x={obj.x} y={obj.y} rotation={obj.rotation} offsetX={obj.width / 2} offsetY={obj.height / 2}>
      <Group clipFunc={clip}>
        <Rect width={obj.width} height={obj.height} fill="rgba(0,0,0,0.001)" />
        {merged ? null : obj.imageSrc ? (
          <>
            {photo && <KImage image={photo} width={obj.width} height={obj.height} opacity={obj.fillOpacity ?? 1} perfectDrawEnabled={false} />}
            {(obj.strokeWidth ?? 0) > 0 && (
              <Rect width={obj.width} height={obj.height} stroke={obj.stroke ?? '#27313d'} strokeWidth={obj.strokeWidth} listening={false} />
            )}
          </>
        ) : drawn ? (
          <KImage image={drawn} width={obj.width} height={obj.height} perfectDrawEnabled={false} />
        ) : !def ? (
          <Rect width={obj.width} height={obj.height} fill="#f3f4f6" stroke="#9ca3af" dash={[4, 3]} />
        ) : null}
      </Group>
      {rings && shaped && !mode && sw > 0 && (
        <Shape
          sceneFunc={(ctx, shape) => {
            traceRings(ctx, rings);
            ctx.strokeShape(shape);
          }}
          stroke={obj.stroke ?? def?.stroke ?? '#27313d'}
          strokeWidth={sw}
          lineJoin="round"
          dash={def?.dashed ? [sw * 4, sw * 2.5] : undefined}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {rings && highlighted && (
        <Shape sceneFunc={(ctx, shape) => { traceRings(ctx, rings); ctx.strokeShape(shape); }} stroke={MAP_PALETTE.ring} strokeWidth={4} listening={false} />
      )}
      {label && spot && (
        <UprightLabel
          text={label}
          x={obj.width / 2}
          y={spot.y}
          rotation={obj.rotation}
          size={spot.size}
          maxWidth={obj.width}
          color={spot.y < obj.height && def?.labelColor ? def.labelColor : MAP_PALETTE.label}
        />
      )}
    </Group>
  );
});

type Painter = (c: CanvasRenderingContext2D, size: number) => void;
const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, lw = 0) => {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke && lw) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
};
const dots = (color: string, r: number): Painter => (c, n) => {
  for (const [x, y] of [[0.25, 0.3], [0.75, 0.2], [0.3, 0.8], [0.8, 0.7]]) dot(c, x * n, y * n, r, color);
};

/**
 * World-anchored textures for merged surfaces, matching each asset's own
 * drawing, so the fill runs on continuously across every piece. `tile` is the
 * repeat size in map pixels; painters draw in map pixels.
 */
const MERGE_TEXTURE: Record<string, { tile: number; paint: Painter }> = {
  grass: { tile: 28, paint: dots(P.grassEdge, 1) },
  gravel: { tile: 14, paint: dots('#a39a88', 1.1) },
  dirt: { tile: 26, paint: dots('#8c6b4a', 1.2) },
  'rock-bed': { tile: 18, paint: dots('#8f897d', 2.4) },
  'flower-bed': {
    tile: 24,
    paint: (c) => {
      const colors = ['#e86a8a', '#f2c230', '#f4f4f4', '#b05cc8'];
      [[6, 6], [18, 6], [10, 18], [22, 18]].forEach(([x, y], i) => dot(c, x, y, 3, colors[i], P.foliageDark, 0.6));
    },
  },
};

/**
 * Things drawn once per piece on top of a merged surface (after the shared
 * fill), so one piece's details are never hidden under another piece's fill.
 * Drawn in the piece's own coordinates.
 */
const MERGE_DECOR: Record<string, (c: CanvasRenderingContext2D, w: number, h: number) => void> = {
  // Landscaping bed: a row of shrubs down the middle, as in its own drawing.
  planter: (c, w, h) => {
    const along = w >= h;
    const len = along ? w : h;
    const r = Math.min(10, (along ? h : w) * 0.3);
    for (let t = 15; t < len - 5; t += 30) dot(c, along ? t : w / 2, along ? h / 2 : t, r, P.foliage, P.foliageDark, 1);
  },
};

const patternTiles = new Map<string, HTMLCanvasElement | null>();
const TILE_K = 4; // tiles are drawn at 4x and scaled down, so they stay sharp when zoomed
function textureTile(key: string): HTMLCanvasElement | null {
  if (patternTiles.has(key)) return patternTiles.get(key)!;
  const t = MERGE_TEXTURE[key];
  let tile: HTMLCanvasElement | null = null;
  if (t && typeof document !== 'undefined') {
    tile = document.createElement('canvas');
    tile.width = tile.height = t.tile * TILE_K;
    const c = tile.getContext('2d');
    if (c) {
      c.scale(TILE_K, TILE_K);
      t.paint(c, t.tile);
    } else tile = null;
  }
  patternTiles.set(key, tile);
  return tile;
}

/** Geometry for an object inside a merge: hedges merge as rounded strips. */
function mergeSourceFor(def: AssetDef | undefined, o: AssetObject) {
  const src = shapeSourceFor(def, o);
  if (def && mergeKey(def) === 'hedge') return { ...src, corner: Math.max(0, Math.min(o.width, o.height) / 2 - 1) };
  return src;
}

interface MergeCluster {
  key: string;
  members: AssetObject[];
  rings: Ring[];
  /** Merged roads: the painted edge lines, as open polylines. */
  lines?: Ring[];
}

/** Paint line along a road's edge: inset from the edge, and its width (as drawn by each road piece). */
const ROAD_EDGE = { inset: 3.5, width: 2 };

/** A road piece's open ends (where it continues), in world coordinates. */
function roadEnds(def: AssetDef | undefined, o: AssetObject): number[][] {
  const w = o.width, h = o.height;
  const t = def?.outline === 'arc' ? bandWidth({ width: w, height: h, band: o.band ?? def.band }) : 0;
  const local = def?.outline === 'arc' ? [[0, 0, 0, t], [w - t, h, w, h]] : [[0, 0, 0, h], [w, 0, w, h]];
  return local.map(([x1, y1, x2, y2]) => [...toWorld(o, x1, y1), ...toWorld(o, x2, y2)]);
}

/**
 * Where each road piece may show its own paint marks: its own outline, minus
 * every crossing piece of the same road (so centre lines and arrows stop at a
 * junction instead of running across it). Pieces lying in the same direction
 * (a road built from straight pieces end to end) keep their marks, and where
 * they overlap only the first one paints.
 */
function roadMarkClips(members: AssetObject[]): Map<string, Ring[]> {
  const world = members.map((m) => {
    const src = shapeSourceFor(ASSET_BY_KEY[m.assetKey], m);
    return localOutline(src).map((r) => {
      const out: Ring = [];
      for (let i = 0; i < r.length; i += 2) out.push(...toWorld(m, r[i], r[i + 1]));
      return out;
    });
  });
  const straight = (m: AssetObject) => !ASSET_BY_KEY[m.assetKey]?.outline;
  const inLine = (a: AssetObject, b: AssetObject) => {
    if (!straight(a) || !straight(b)) return false;
    const d = (((a.rotation - b.rotation) % 180) + 180) % 180;
    return d < 3 || d > 177;
  };
  const clips = new Map<string, Ring[]>();
  members.forEach((m, i) => {
    // In-line pieces: the earlier piece paints the overlap, so the marks are never doubled up.
    const crossing = members.flatMap((o, j) => (j !== i && (j < i || !inLine(m, o)) ? world[j] : []));
    const rings = subtractRings(world[i], crossing).map((r) => {
      const out: Ring = [];
      for (let k = 0; k < r.length; k += 2) out.push(...toLocal(m, r[k], r[k + 1]));
      return out;
    });
    clips.set(m.id, rings);
  });
  return clips;
}

/**
 * Pieces on one layer that merge: copies of the same ground or planting asset
 * (or any grass piece) that overlap or sit within their blend distance.
 * A piece on its own keeps its normal drawing.
 */
export function mergePlan(objects: MapObject[]): { leads: Map<string, MergeCluster>; modes: Map<string, MergedMode>; clips: Map<string, Ring[]> } {
  const byKey = new Map<string, AssetObject[]>();
  for (const o of objects) {
    if (o.kind !== 'asset' || o.imageSrc || o.merge === false) continue;
    const def = ASSET_BY_KEY[o.assetKey];
    const key = def && mergeKey(def);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), o]);
  }
  const leads = new Map<string, MergeCluster>();
  const modes = new Map<string, MergedMode>();
  const clips = new Map<string, Ring[]>();
  for (const [key, objs] of byKey) {
    if (objs.length < 2) continue;
    const clusters = mergeClusters(objs.map((m) => {
      const def = ASSET_BY_KEY[m.assetKey];
      return { x: m.x, y: m.y, rotation: m.rotation, blend: m.blend ?? defaultBlend(def), ...mergeSourceFor(def, m) };
    }));
    const mode: MergedMode = key === 'road' ? 'marks' : MERGE_TEXTURE[key] || MERGE_DECOR[key] || key === 'hedge' ? 'ghost' : 'fill';
    for (const c of clusters) {
      if (c.members.length < 2) continue;
      const members = c.members.map((i) => objs[i]);
      const cluster: MergeCluster = { key, members, rings: c.rings };
      if (key === 'road') {
        cluster.lines = insetLines(c.rings, members.flatMap((m) => roadEnds(ASSET_BY_KEY[m.assetKey], m)), ROAD_EDGE.inset);
        for (const [id, r] of roadMarkClips(members)) clips.set(id, r);
      }
      leads.set(members[0].id, cluster);
      for (const m of members) modes.set(m.id, mode);
    }
  }
  return { leads, modes, clips };
}

const MergedShape = function MergedShape({ cluster }: { cluster: MergeCluster }) {
  const { key, rings } = cluster;
  const lead = cluster.members[0];
  const def = ASSET_BY_KEY[lead.assetKey];
  const fill = withAlpha(lead.fill ?? def?.fill ?? P.grass, lead.fillOpacity ?? def?.fillOpacity ?? 1);
  const edge = lead.strokeWidth ?? def?.strokeWidth ?? 0;
  const edgeColor = lead.stroke ?? def?.stroke ?? P.concreteEdge;
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(kctx) => {
        const ctx = kctx._context;
        traceRings(ctx, rings);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (cluster.lines) {
          // A road: one surface, then one pair of edge lines that turn every corner.
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.beginPath();
          for (const l of cluster.lines) {
            ctx.moveTo(l[0], l[1]);
            for (let i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]);
          }
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'round';
          ctx.lineWidth = ROAD_EDGE.width;
          ctx.strokeStyle = P.paint;
          ctx.stroke();
          return;
        }
        if (key === 'hedge') {
          // Shrub lobes all along the edge, so merged hedges keep their bushy outline.
          const lobe = Math.max(6, Math.min(lead.width, lead.height) * 0.55);
          ctx.setLineDash([0.01, lobe * 0.7]);
          ctx.lineWidth = lobe + edge * 2;
          ctx.strokeStyle = edgeColor;
          ctx.stroke();
          ctx.lineWidth = lobe;
          ctx.strokeStyle = fill;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = fill;
          ctx.fill();
          return;
        }
        // The border is stroked first at double width and the fill then covers its
        // inner half, so the one border runs only around the outside of the merged shape.
        if (edge > 0) {
          ctx.lineWidth = edge * 2;
          ctx.strokeStyle = edgeColor;
          if (def?.dashed) ctx.setLineDash([edge * 4, edge * 2.5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = fill;
        ctx.fill();
        const tile = textureTile(key);
        const pattern = tile && ctx.createPattern(tile, 'repeat');
        if (pattern) {
          pattern.setTransform?.(new DOMMatrix().scale(1 / TILE_K));
          ctx.fillStyle = pattern;
          ctx.fill();
        }
        const decor = MERGE_DECOR[key];
        if (decor) {
          ctx.save();
          ctx.clip();
          for (const m of cluster.members) {
            ctx.save();
            ctx.translate(m.x, m.y);
            ctx.rotate((m.rotation * Math.PI) / 180);
            ctx.translate(-m.width / 2, -m.height / 2);
            decor(ctx, m.width, m.height);
            ctx.restore();
          }
          ctx.restore();
        }
      }}
    />
  );
};

/**
 * Everything on one layer, in drawing order. Pieces that merge are drawn as
 * one shape where their bottom-most piece sits; each piece still gets its own
 * invisible outline for clicking, selecting and labels.
 */
export function LayerObjects({ objects, objProps }: { objects: MapObject[]; objProps?: (o: MapObject) => Omit<ObjProps, 'obj'> }) {
  // Re-merge only when a mergeable piece changes, not on every pan, zoom or unrelated edit.
  const signature = JSON.stringify(
    objects.map((o) => (o.kind === 'asset' && ASSET_BY_KEY[o.assetKey] && mergeKey(ASSET_BY_KEY[o.assetKey]!) ? [o.id, o.x, o.y, o.width, o.height, o.rotation, o.corner, o.bevel, o.band, o.cuts, o.blend, o.merge, o.fill, o.fillOpacity, o.stroke, o.strokeWidth] : 0)),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { leads, modes, clips } = useMemo(() => mergePlan(objects), [signature]);
  return (
    <>
      {objects.map((o) => {
        const lead = leads.get(o.id);
        const props = objProps?.(o) ?? {};
        return (
          <Fragment key={o.id}>
            {lead && <MergedShape cluster={lead} />}
            {o.kind === 'asset' ? <AssetShape obj={o} {...props} merged={modes.get(o.id)} markClip={clips.get(o.id)} /> : <MapObjectShape obj={o} {...props} />}
          </Fragment>
        );
      })}
    </>
  );
}

const TextShape = memo(function TextShape({ obj }: ObjProps & { obj: TextObject }) {
  const sw = obj.strokeWidth ?? 0;
  const hasBox = !!obj.fill || sw > 0;
  return (
    <Group id={obj.id} name="obj" x={obj.x} y={obj.y} rotation={obj.rotation} offsetX={obj.width / 2} offsetY={obj.height / 2}>
      <Rect
        width={obj.width}
        height={obj.height}
        cornerRadius={hasBox ? 3 : 0}
        fill={obj.fill ? withAlpha(obj.fill, obj.fillOpacity ?? 1) : 'rgba(0,0,0,0.001)'}
        stroke={sw > 0 ? obj.stroke ?? '#27313d' : undefined}
        strokeWidth={sw}
        strokeEnabled={sw > 0}
      />
      <Text
        text={obj.text}
        x={hasBox ? 4 : 0}
        width={obj.width - (hasBox ? 8 : 0)}
        height={obj.height}
        align="center"
        verticalAlign="middle"
        fontSize={obj.fontSize}
        fontStyle="bold"
        fontFamily={LABEL_FONT}
        lineHeight={1.15}
        fill={obj.color === '#111827' ? MAP_PALETTE.label : obj.color}
        listening={false}
      />
    </Group>
  );
});

export function MapObjectShape(props: ObjProps) {
  const { obj } = props;
  if (obj.kind === 'space') return <SpaceShape {...props} obj={obj} />;
  if (obj.kind === 'asset') return <AssetShape {...props} obj={obj} />;
  return <TextShape {...props} obj={obj} />;
}

export function BackgroundShape({ bg, listening, draggable, onMoved }: {
  bg: BackgroundImage;
  listening: boolean;
  draggable?: boolean;
  onMoved?: (x: number, y: number) => void;
}) {
  const img = useImage(bg.src);
  if (!img) return null;
  return (
    <KImage
      id="__background"
      name="background"
      image={img}
      x={bg.x}
      y={bg.y}
      width={bg.width}
      height={bg.height}
      opacity={bg.opacity}
      listening={listening}
      draggable={draggable}
      onDragEnd={(e) => onMoved?.(e.target.x(), e.target.y())}
    />
  );
}
