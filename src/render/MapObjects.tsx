import { Fragment, memo, useMemo } from 'react';
import type Konva from 'konva';
import { Group, Image as KImage, Line, Rect, Shape, Text } from 'react-konva';
import { spaceMarks, spaceOutline } from '../assets/catalog/spaces';
import { badgeLayout } from '../assets/draw';
import { ASSET_BY_KEY, isShapeable, renderAssetSvg, shapeSourceFor, svgDataUrl, symbolSupport, type AssetDef } from '../assets/library';
import { isShaped, localOutline, maxCorner, mergeOutlines, traceRings } from '../model/shape';
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

const AssetShape = memo(function AssetShape({ obj, merged, highlighted }: ObjProps & { obj: AssetObject; merged?: boolean }) {
  const def = ASSET_BY_KEY[obj.assetKey];
  const src = shapeSourceFor(def, obj);
  const shaped = !obj.imageSrc && !!def && isShapeable(def) && isShaped(src);
  const rings = useMemo(
    () => (shaped || merged ? localOutline(src) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shaped, merged, obj.width, obj.height, src.outline, obj.corner, obj.bevel, src.band, obj.cuts],
  );
  const markup = useMemo(
    // Shaped pieces draw their own border along the outline, so the box border is left off.
    () => (def && !obj.imageSrc && !merged ? renderAssetSvg(def, shaped ? { ...obj, strokeWidth: 0 } : obj) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, merged, shaped, obj.imageSrc, obj.width, obj.height, obj.fill, obj.fillOpacity, obj.stroke, obj.strokeWidth, obj.label, obj.symbol, obj.symbolHidden],
  );
  const drawn = useSvgImage(markup);
  const photo = useImage(obj.imageSrc);
  const label = obj.label?.trim();
  const spot = label ? labelSpot(def, obj) : null;
  const clip = rings ? (ctx: Konva.Context) => traceRings(ctx, rings) : undefined;
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
      {rings && shaped && !merged && sw > 0 && (
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

/** Dot texture for merged ground surfaces, matching the asset drawings. */
const MERGE_TEXTURE: Record<string, { color: string; step: number; r: number }> = {
  grass: { color: P.grassEdge, step: 14, r: 1 },
  gravel: { color: '#a39a88', step: 7, r: 1.1 },
  dirt: { color: '#8c6b4a', step: 13, r: 1.2 },
};
const patternTiles = new Map<string, HTMLCanvasElement | null>();
function textureTile(key: string): HTMLCanvasElement | null {
  if (patternTiles.has(key)) return patternTiles.get(key)!;
  const t = MERGE_TEXTURE[key];
  let tile: HTMLCanvasElement | null = null;
  if (t && typeof document !== 'undefined') {
    // Drawn at 4x and scaled down by the pattern transform, so dots stay round when zoomed.
    const k = 4;
    tile = document.createElement('canvas');
    tile.width = tile.height = t.step * 2 * k;
    const c = tile.getContext('2d');
    if (c) {
      c.fillStyle = t.color;
      const dots = [[0.25, 0.3], [0.75, 0.2], [0.3, 0.8], [0.8, 0.7]];
      for (const [x, y] of dots) {
        c.beginPath();
        c.arc(x * tile.width, y * tile.height, t.r * k, 0, Math.PI * 2);
        c.fill();
      }
    } else tile = null;
  }
  patternTiles.set(key, tile);
  return tile;
}

interface MergeGroup {
  key: string;
  members: AssetObject[];
}

/** Landscape pieces on one layer that flow together, keyed by their first (bottom) member. */
export function mergeGroups(objects: MapObject[]): { leads: Map<string, MergeGroup>; merged: Set<string> } {
  const byKey = new Map<string, MergeGroup>();
  for (const o of objects) {
    if (o.kind !== 'asset' || o.imageSrc || o.merge === false) continue;
    const key = ASSET_BY_KEY[o.assetKey]?.merge;
    if (!key) continue;
    const g = byKey.get(key) ?? { key, members: [] };
    g.members.push(o);
    byKey.set(key, g);
  }
  const leads = new Map<string, MergeGroup>();
  const merged = new Set<string>();
  for (const g of byKey.values()) {
    leads.set(g.members[0].id, g);
    for (const m of g.members) merged.add(m.id);
  }
  return { leads, merged };
}

const MergedShape = function MergedShape({ group }: { group: MergeGroup }) {
  const lead = group.members[0];
  const def = ASSET_BY_KEY[lead.assetKey];
  const members = group.members.map((m) => ({ x: m.x, y: m.y, rotation: m.rotation, blend: m.blend, ...shapeSourceFor(ASSET_BY_KEY[m.assetKey], m) }));
  // Re-merge only when a piece's geometry changes, not on every pan or zoom.
  const signature = JSON.stringify(members);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rings = useMemo(() => mergeOutlines(members), [signature]);
  const fill = withAlpha(lead.fill ?? def?.fill ?? P.grass, lead.fillOpacity ?? def?.fillOpacity ?? 1);
  const curb = lead.strokeWidth ?? def?.strokeWidth ?? 0;
  const curbColor = lead.stroke ?? def?.stroke ?? P.concreteEdge;
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(kctx) => {
        const ctx = kctx._context;
        traceRings(ctx, rings);
        ctx.lineJoin = 'round';
        // The curb is stroked first at double width; the grass then covers its inner
        // half, so the curb only ever shows around the outside of the merged shape.
        if (curb > 0) {
          ctx.lineWidth = curb * 2;
          ctx.strokeStyle = curbColor;
          ctx.stroke();
        }
        ctx.fillStyle = fill;
        ctx.fill();
        const tile = textureTile(group.key);
        const pattern = tile && ctx.createPattern(tile, 'repeat');
        if (pattern) {
          pattern.setTransform?.(new DOMMatrix().scale(0.25));
          ctx.fillStyle = pattern;
          ctx.fill();
        }
      }}
    />
  );
};

/**
 * Everything on one layer, in drawing order. Landscape pieces that merge are
 * drawn as one shape where their bottom-most piece sits; each piece still
 * gets its own invisible outline for clicking, selecting and labels.
 */
export function LayerObjects({ objects, objProps }: { objects: MapObject[]; objProps?: (o: MapObject) => Omit<ObjProps, 'obj'> }) {
  const { leads, merged } = useMemo(() => mergeGroups(objects), [objects]);
  return (
    <>
      {objects.map((o) => {
        const lead = leads.get(o.id);
        const props = objProps?.(o) ?? {};
        return (
          <Fragment key={o.id}>
            {lead && <MergedShape group={lead} />}
            {o.kind === 'asset' ? <AssetShape obj={o} {...props} merged={merged.has(o.id)} /> : <MapObjectShape obj={o} {...props} />}
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
