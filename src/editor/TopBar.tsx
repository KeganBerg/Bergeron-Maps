import { BrandMark } from '../ui/Brand';
import { floorBounds, fitViewport, zoomAt } from '../render/viewport';
import type { SnapMode } from '../model/snapping';
import { CommitInput, toNumber } from '../ui/fields';
import { Icon, type IconName } from '../ui/icons';
import { modLabel } from './useKeyboard';
import { mapFileName, serializeMapFile } from '../storage/mapFile';
import { currentFloor, useEditor, type SaveStatus } from './store';

const STATUS: Record<SaveStatus, { text: string; tone: string }> = {
  saved: { text: 'Saved', tone: 'ok' },
  unsaved: { text: 'Unsaved changes', tone: 'pending' },
  saving: { text: 'Saving…', tone: 'pending' },
  failed: { text: 'Save failed — retrying', tone: 'error' },
  conflict: { text: 'Changed elsewhere', tone: 'error' },
};

function ToolButton({ icon, label, onClick, disabled, active, testId }: {
  icon: IconName; label: string; onClick: () => void; disabled?: boolean; active?: boolean; testId?: string;
}) {
  return (
    <button className={`icon-btn${active ? ' on' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}
      aria-pressed={active} data-testid={testId}>
      <Icon name={icon} />
    </button>
  );
}

export type PublishState = 'never' | 'changes' | 'current';

const PUBLISH_TEXT: Record<PublishState, string> = {
  never: 'Not published yet: employees can’t see this map',
  changes: 'Employees see an older version until you publish',
  current: 'Employees see this version',
};

export function TopBar({ onSave, onHistory, onPreview, onHome, onPublish, publishing, publishState, publishedAt }: {
  onSave: () => void; onHistory: () => void; onPreview: () => void; onHome: () => void;
  onPublish: () => void; publishing: boolean; publishState: PublishState; publishedAt?: string;
}) {
  const doc = useEditor((s) => s.doc)!;
  const status = useEditor((s) => s.saveStatus);
  const error = useEditor((s) => s.saveError);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSel = useEditor((s) => s.selection.length > 0);
  const hasClip = useEditor((s) => !!s.clipboard);
  const tool = useEditor((s) => s.tool);
  const snapMode = useEditor((s) => s.snapMode);
  const scale = useEditor((s) => s.viewport.scale);
  const st = useEditor.getState;

  const zoomBy = (f: number) => {
    const s = st();
    s.setViewport(zoomAt(s.viewport, { x: s.viewSize.width / 2, y: s.viewSize.height / 2 }, s.viewport.scale * f));
  };
  const fit = () => {
    const s = st();
    const floor = currentFloor(s);
    if (floor) s.setViewport(fitViewport(floorBounds(floor), s.viewSize));
  };
  const info = STATUS[status];
  const download = () => {
    const url = URL.createObjectURL(new Blob([serializeMapFile(st().doc!)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = mapFileName(st().doc!);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <header className="topbar">
      <div className="group">
        <button className="icon-btn brand-home" title="All maps" aria-label="All maps" onClick={onHome}><BrandMark size={28} title="All maps" /></button>
        <CommitInput className="map-name" value={doc.name} maxLength={80} aria-label="Map name" data-testid="map-name-input-top" onCommit={(v) => st().renameMap(v)} />
        <span className={`save-status ${info.tone}`} title={error ?? (status === 'saved' ? 'Saved in this browser on this device' : undefined)} data-testid="save-status" role="status">
          {info.tone === 'ok' ? <Icon name="check" size={14} /> : info.tone === 'error' ? <Icon name="alert" size={14} /> : null}
          {info.text}
        </span>
        <button className="btn small" onClick={onSave} title={`Save now and keep a version (${modLabel}S)`} data-testid="save">
          <Icon name="save" size={14} /> Save
        </button>
      </div>

      <div className="group tools">
        <ToolButton icon="undo" label={`Undo (${modLabel}Z)`} onClick={() => st().undo()} disabled={!canUndo} testId="undo" />
        <ToolButton icon="redo" label={`Redo (${modLabel}Y)`} onClick={() => st().redo()} disabled={!canRedo} testId="redo" />
        <span className="sep" />
        <ToolButton icon="cut" label={`Cut (${modLabel}X)`} onClick={() => st().cut()} disabled={!hasSel} />
        <ToolButton icon="copy" label={`Copy (${modLabel}C)`} onClick={() => st().copy()} disabled={!hasSel} testId="copy" />
        <ToolButton icon="paste" label={`Paste (${modLabel}V)`} onClick={() => st().paste()} disabled={!hasClip} testId="paste" />
        <span className="sep" />
        <ToolButton icon="cursor" label="Select (Esc)" onClick={() => st().setTool({ type: 'select' })} active={tool.type === 'select'} />
        <ToolButton icon="hand" label="Pan (or hold Space and drag)" onClick={() => st().setTool({ type: 'hand' })} active={tool.type === 'hand'} />
        <ToolButton icon="text" label="Add a text label" onClick={() => st().setTool({ type: 'text' })} active={tool.type === 'text'} testId="tool-text" />
        <span className="sep" />
        <label className="snap" title="Smart: lines up with nearby objects. Grid: snaps to a grid. Free: no snapping.">
          <span className="muted">Snap</span>
          <select value={snapMode} onChange={(e) => st().setSnapMode(e.target.value as SnapMode)} data-testid="snap-mode">
            <option value="smart">Smart</option>
            <option value="grid">Grid</option>
            <option value="free">Free placement</option>
          </select>
        </label>
        {snapMode === 'grid' && (
          <label className="snap" title="Grid size">
            <CommitInput type="number" className="grid-size" value={doc.settings.gridSize} min={1} max={200}
              onCommit={(v) => st().setGridSize(toNumber(v, doc.settings.gridSize, 1, 200))} aria-label="Grid size" />
          </label>
        )}
        <span className="sep" />
        <ToolButton icon="zoomOut" label="Zoom out (Ctrl+scroll)" onClick={() => zoomBy(1 / 1.25)} />
        <button className="zoom-pct" onClick={() => zoomBy(1 / scale)} title="Reset to 100%">{Math.round(scale * 100)}%</button>
        <ToolButton icon="zoomIn" label="Zoom in (Ctrl+scroll)" onClick={() => zoomBy(1.25)} />
        <ToolButton icon="fit" label="Fit floor to screen" onClick={fit} testId="fit" />
      </div>

      <div className="group">
        <ToolButton icon="history" label="Version history" onClick={onHistory} testId="history" />
        <button className="btn small" onClick={download} title="Download this map as a file you can keep as a backup or import in another browser" data-testid="download-map">
          Download
        </button>
        <button className="btn" onClick={onPreview} data-testid="preview"><Icon name="play" size={14} /> Preview</button>
        <button className={`btn ${publishState === 'current' ? 'published' : 'primary'}`} onClick={onPublish} disabled={publishing}
          title={`${PUBLISH_TEXT[publishState]}${publishedAt ? ` (last published ${new Date(publishedAt).toLocaleString()})` : ''}`}
          data-testid="publish" data-state={publishState}>
          {publishing ? 'Publishing…' : publishState === 'current' ? <><Icon name="check" size={14} /> Published</> : publishState === 'changes' ? 'Publish changes' : 'Publish'}
        </button>
      </div>
    </header>
  );
}
