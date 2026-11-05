import { memo, useMemo } from 'react';
import { Group, Image as KImage, Line, Rect, Text } from 'react-konva';
import { spaceMarks, spaceOutline } from '../assets/catalog/spaces';
import { badgeLayout } from '../assets/draw';
import { ASSET_BY_KEY, renderAssetSvg, svgDataUrl, symbolSupport, type AssetDef } from '../assets/library';
import { svgDoc, withAlpha } from '../assets/style';
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
      ) : (
        <Rect width={obj.width} height={obj.height} {...bodyProps} />
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

const AssetShape = memo(function AssetShape({ obj }: ObjProps & { obj: AssetObject }) {
  const def = ASSET_BY_KEY[obj.assetKey];
  const markup = useMemo(
    () => (def && !obj.imageSrc ? renderAssetSvg(def, obj) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, obj.imageSrc, obj.width, obj.height, obj.fill, obj.fillOpacity, obj.stroke, obj.strokeWidth, obj.label, obj.symbol, obj.symbolHidden],
  );
  const drawn = useSvgImage(markup);
  const photo = useImage(obj.imageSrc);
  const label = obj.label?.trim();
  const spot = label ? labelSpot(def, obj) : null;
  return (
    <Group id={obj.id} name="obj" x={obj.x} y={obj.y} rotation={obj.rotation} offsetX={obj.width / 2} offsetY={obj.height / 2}>
      <Rect width={obj.width} height={obj.height} fill="rgba(0,0,0,0.001)" />
      {obj.imageSrc ? (
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
