import { useLayoutEffect, useRef, useState } from 'react';
import { ASSET_BY_KEY } from '../assets/library';
import type { MapObject } from '../model/types';
import { LABEL_FONT, spaceFontSize } from '../render/MapObjects';
import { useEditor } from './store';

/** The words shown on an object that can be typed over: a space's number, a text label, an object's name. */
export const editableText = (o: MapObject) => (o.kind === 'space' ? o.label : o.kind === 'text' ? o.text : o.name ?? ASSET_BY_KEY[o.assetKey]?.name ?? '');

/**
 * Typing straight onto the map, as in Figma and PowerPoint: a box over the object
 * holding its number, words or name. Enter or a click elsewhere keeps the change,
 * Esc throws it away. In a text label, Shift+Enter starts a new line.
 */
export function InlineLabelEditor({ o, onClose }: { o: MapObject; onClose: () => void }) {
  const v = useEditor((s) => s.viewport);
  const [value, setValue] = useState(() => editableText(o));
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = useRef(false);
  const multiline = o.kind === 'text';

  const opened = useRef(Date.now());
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  // The double-click that opened the box can land in it, and some browsers (Firefox) then
  // select just the word under the pointer: start with all of it selected, so typing replaces it.
  const selectAllAtFirst = () => {
    if (Date.now() - opened.current < 600) ref.current?.select();
  };

  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    const next = value.trim();
    if (keep && next !== editableText(o).trim()) {
      const st = useEditor.getState();
      if (o.kind === 'space') st.updateObjects([o.id], { label: next });
      else if (o.kind === 'text') { if (next) st.updateObjects([o.id], { text: value.replace(/\s+$/, '') }); }
      else st.renameObject(o.id, next);
    }
    onClose();
  };

  const font = Math.max(12, Math.min(48, (o.kind === 'space' ? spaceFontSize(o) * (o.labelScale ?? 1) : o.kind === 'text' ? o.fontSize : 14) * v.scale));
  const width = Math.max(o.width * v.scale, multiline ? 160 : 72);
  const height = multiline ? Math.max(o.height * v.scale, font * 2.4) : font * 1.7;
  const cx = v.x + o.x * v.scale;
  const cy = v.y + o.y * v.scale;
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      ref={ref}
      className="inline-label"
      data-testid="inline-label"
      aria-label={o.kind === 'space' ? 'Space number' : o.kind === 'text' ? 'Text' : 'Name'}
      value={value}
      maxLength={o.kind === 'space' ? 24 : o.kind === 'text' ? 600 : 80}
      style={{ left: cx - width / 2, top: cy - height / 2, width, height, fontSize: font, fontFamily: LABEL_FONT }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseUp={selectAllAtFirst}
      onDoubleClick={selectAllAtFirst}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); finish(true); }
      }}
    />
  );
}
