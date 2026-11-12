import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Stage } from 'react-konva';
import { createMap } from '../model/factory';
import { clampQuickLot, createQuickLot, QUICK_LOT_DEFAULTS, QUICK_LOT_LIMITS, quickLotTotal, type QuickLotSpec } from '../model/quickLot';
import type { MapDocument } from '../model/types';
import { LayerObjects } from '../render/MapObjects';
import { fitViewport, floorBounds } from '../render/viewport';
import { floorColor } from '../theme';
import { Dialog } from '../ui/Dialog';

/**
 * Live preview of the level the manager is about to get, drawn with the same
 * renderer as the editor and the phone viewer, so it looks exactly like the
 * finished map. Levels can be flipped through with the floor buttons.
 */
function LotPreview({ doc }: { doc: MapDocument }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [index, setIndex] = useState(0);
  const floor = doc.floors[Math.min(index, doc.floors.length - 1)];
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const view = fitViewport(floorBounds(floor), size, 14);
  return (
    <div className="lot-preview">
      <div className="lot-sketch" ref={boxRef} data-testid="quick-preview">
        {size.width > 0 && (
          <Stage width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} listening={false}>
            <Layer>
              {floor.layers.map((l) => (
                <Group key={l.id}>
                  <LayerObjects objects={floor.objects.filter((o) => o.layerId === l.id)} />
                </Group>
              ))}
            </Layer>
          </Stage>
        )}
      </div>
      {doc.floors.length > 1 && (
        <div className="lot-floors" role="group" aria-label="Preview a floor">
          {doc.floors.map((f, i) => (
            <button key={f.id} type="button" className={f.id === floor.id ? 'active' : ''} aria-pressed={f.id === floor.id}
              style={{ ['--floor-color' as string]: floorColor(i) }} onClick={() => setIndex(i)}>
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const FIELDS: { key: keyof QuickLotSpec; label: string; hint: string }[] = [
  { key: 'floors', label: 'Floors', hint: '1 for a surface lot' },
  { key: 'rows', label: 'Rows per floor', hint: 'Lettered A, B, C…' },
  { key: 'spacesPerRow', label: 'Spaces per row', hint: 'Numbered 1, 2, 3…' },
  { key: 'accessible', label: 'Accessible spaces', hint: 'Start of row A' },
];

/**
 * New map, built for the busy manager: answer four numbers and get a full,
 * numbered layout to adjust, or start from an empty canvas.
 */
export function NewMapDialog({ site, onCreate, onClose }: { site?: string; onCreate: (doc: MapDocument, site?: string) => void | Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'quick' | 'blank'>('quick');
  // A double-click (or Enter then a click) must not create the map twice and use up two slots.
  const busy = useRef(false);
  const [creating, setCreating] = useState(false);
  const [raw, setRaw] = useState<Record<keyof QuickLotSpec, string>>({
    floors: String(QUICK_LOT_DEFAULTS.floors),
    rows: String(QUICK_LOT_DEFAULTS.rows),
    spacesPerRow: String(QUICK_LOT_DEFAULTS.spacesPerRow),
    accessible: String(QUICK_LOT_DEFAULTS.accessible),
  });
  const spec = clampQuickLot({
    floors: Number(raw.floors), rows: Number(raw.rows), spacesPerRow: Number(raw.spacesPerRow), accessible: Number(raw.accessible),
  });
  const preview = useMemo(() => createQuickLot('preview', spec), [spec.floors, spec.rows, spec.spacesPerRow, spec.accessible]);
  const total = quickLotTotal(spec);

  // A new site needs a real name; otherwise empty "Untitled site" entries pile up on the home page.
  const needsName = !site && !name.trim();
  const fallback = 'New map';
  const create = async () => {
    if (needsName || busy.current) return;
    busy.current = true;
    setCreating(true);
    try {
      await onCreate(mode === 'quick' ? createQuickLot(name.trim() || fallback, spec) : createMap(name.trim() || fallback), site);
    } finally {
      busy.current = false;
      setCreating(false);
    }
  };

  return (
    <Dialog title={site ? `New map at ${site}` : 'New site map'} wide onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => void create()} disabled={needsName || creating} title={needsName ? 'Enter a site name first' : undefined} data-testid="create-map">
            {mode === 'quick' ? `Create map with ${total} spaces` : 'Create blank map'}
          </button>
        </>
      }>
      <form className="new-map" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label className="stack">
          {site ? 'Map name' : 'Site name'}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={site ? 'e.g. Overflow lot' : 'Site Name'} maxLength={80} data-testid="map-name-input" />
        </label>

        <div className="segmented" role="radiogroup" aria-label="How to start">
          <button type="button" role="radio" aria-checked={mode === 'quick'} className={mode === 'quick' ? 'on' : ''} onClick={() => setMode('quick')} data-testid="mode-quick">
            <strong>Build it for me</strong>
            <span>Answer four numbers, adjust after</span>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'blank'} className={mode === 'blank' ? 'on' : ''} onClick={() => setMode('blank')} data-testid="mode-blank">
            <strong>Start blank</strong>
            <span>Draw everything yourself</span>
          </button>
        </div>

        {mode === 'quick' && (
          <div className="quick-lot">
            <div className="quick-fields">
              {FIELDS.map((f) => (
                <label key={f.key} className="stack">
                  {f.label}
                  <input type="number" inputMode="numeric" min={QUICK_LOT_LIMITS[f.key].min} max={QUICK_LOT_LIMITS[f.key].max}
                    value={raw[f.key]} onChange={(e) => setRaw({ ...raw, [f.key]: e.target.value })} data-testid={`quick-${f.key}`} />
                  <span className="hint">{f.hint}</span>
                </label>
              ))}
            </div>
            <figure className="quick-preview">
              <LotPreview doc={preview} />
              <figcaption>
                {spec.floors > 1 ? `${spec.floors} floors, ${total} spaces. ` : `${total} spaces. `}Lanes, entrance{spec.floors > 1 ? ', ramps and stairs' : ' and exit'} are added for you. Move or renumber anything afterward.
              </figcaption>
            </figure>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
