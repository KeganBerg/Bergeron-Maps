import { memo } from 'react';
import { Group, Image as KImage, Rect, Text } from 'react-konva';
import { ASSET_BY_KEY, svgDataUrl } from '../assets/library';
import type { AssetObject, BackgroundImage, MapObject, SpaceObject, TextObject } from '../model/types';
import { useImage } from './useImage';

export const LABEL_FONT = 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

interface ObjProps {
  obj: MapObject;
  duplicate?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
}

/** Text that stays upright on screen whatever the object's rotation, for readability. */
function UprightLabel({ text, x, y, rotation, size, color = '#111827', maxWidth }: {
  text: string; x: number; y: number; rotation: number; size: number; color?: string; maxWidth: number;
}) {
  const w = Math.max(maxWidth, size * text.length * 0.7);
  return (
    <Text
      text={text}
      x={x}
      y={y}
      width={w}
      height={size * 1.2}
      offsetX={w / 2}
      offsetY={(size * 1.2) / 2}
      rotation={-rotation}
      align="center"
      verticalAlign="middle"
      fontSize={size}
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

const SpaceShape = memo(function SpaceShape({ obj, duplicate, highlighted }: ObjProps & { obj: SpaceObject }) {
  const size = spaceFontSize(obj);
  const ly = obj.labelPlacement === 'top' ? size : obj.labelPlacement === 'bottom' ? obj.height - size : obj.height / 2;
  return (
    <Group id={obj.id} name="obj" x={obj.x} y={obj.y} rotation={obj.rotation} offsetX={obj.width / 2} offsetY={obj.height / 2}>
      <Rect
        width={obj.width}
        height={obj.height}
        fill={highlighted ? '#fde68a' : obj.accessible ? '#dbeafe' : obj.fill}
        stroke={duplicate ? '#dc2626' : '#1f2937'}
        strokeWidth={duplicate ? 3 : 1.5}
        dash={duplicate ? [6, 3] : undefined}
        perfectDrawEnabled={false}
      />
      {obj.accessible && <Rect x={3} y={3} width={10} height={10} fill="#1d4ed8" listening={false} />}
      <UprightLabel text={obj.label} x={obj.width / 2} y={ly} rotation={obj.rotation} size={size} maxWidth={obj.width} />
    </Group>
  );
});

const AssetShape = memo(function AssetShape({ obj }: ObjProps & { obj: AssetObject }) {
  const def = ASSET_BY_KEY[obj.assetKey];
  const src = def?.svg ? svgDataUrl(def.svg) : undefined;
  const img = useImage(src);
  const label = obj.label?.trim();
  const area = !def || def.render === 'area';
  return (
    <Group id={obj.id} name="obj" x={obj.x} y={obj.y} rotation={obj.rotation} offsetX={obj.width / 2} offsetY={obj.height / 2}>
      {area ? (
        <Rect
          width={obj.width}
          height={obj.height}
          fill={obj.fill ?? def?.fill ?? '#e5e7eb'}
          fillPatternImage={img}
          fillPatternRepeat="repeat"
          stroke={def?.stroke ?? '#6b7280'}
          strokeWidth={1.5}
          perfectDrawEnabled={false}
        />
      ) : img ? (
        <KImage image={img} width={obj.width} height={obj.height} perfectDrawEnabled={false} />
      ) : (
        <Rect width={obj.width} height={obj.height} fill="#f3f4f6" />
      )}
      {label && (
        <UprightLabel
          text={label}
          x={obj.width / 2}
          y={area ? obj.height / 2 : obj.height + 10}
          rotation={obj.rotation}
          size={Math.max(10, Math.min(16, Math.max(obj.width, obj.height) * 0.22))}
          maxWidth={obj.width}
        />
      )}
    </Group>
  );
});

const TextShape = memo(function TextShape({ obj }: ObjProps & { obj: TextObject }) {
  return (
    <Group id={obj.id} name="obj" x={obj.x} y={obj.y} rotation={obj.rotation} offsetX={obj.width / 2} offsetY={obj.height / 2}>
      <Rect width={obj.width} height={obj.height} fill="rgba(0,0,0,0.001)" />
      <Text
        text={obj.text}
        width={obj.width}
        height={obj.height}
        align="center"
        verticalAlign="middle"
        fontSize={obj.fontSize}
        fontStyle="bold"
        fontFamily={LABEL_FONT}
        fill={obj.color}
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
