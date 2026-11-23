import { useEffect } from 'react';
import { useEditor } from './store';
import { fitFloor, zoomBy, zoomTo100, zoomToSelection } from './view';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Standard shortcuts only: Ctrl/⌘ + C, V, X, D, Z, Y / Shift+Z, A, S;
 * Delete/Backspace; Escape; arrow keys nudge (Shift = 10); zoom with Ctrl/⌘ +
 * plus, minus and 0, Shift+1 to fit and Shift+2 for the selection; ? lists them all.
 */
export function useKeyboard(onSave: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.dialog-backdrop')) return;
      const s = useEditor.getState();
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      // Zoom the map, not the page (the browser's own page zoom is on the same keys).
      if (mod && (key === '=' || key === '+' || e.code === 'NumpadAdd')) { zoomBy(1.25); e.preventDefault(); return; }
      if (mod && (key === '-' || key === '_' || e.code === 'NumpadSubtract')) { zoomBy(1 / 1.25); e.preventDefault(); return; }
      if (mod && (key === '0' || e.code === 'Numpad0')) { zoomTo100(); e.preventDefault(); return; }
      if (e.shiftKey && !mod && !e.altKey && e.code === 'Digit1') { fitFloor(); e.preventDefault(); return; }
      if (e.shiftKey && !mod && !e.altKey && e.code === 'Digit2') { zoomToSelection(); e.preventDefault(); return; }
      if (mod && key === 'f') { window.dispatchEvent(new CustomEvent('bm:find')); e.preventDefault(); return; }
      if (key === '?' && !mod) { window.dispatchEvent(new CustomEvent('bm:shortcuts')); e.preventDefault(); return; }
      if (mod && key === 'c') { s.copy(); e.preventDefault(); return; }
      if (mod && key === 'x') { s.cut(); e.preventDefault(); return; }
      if (mod && key === 'v') { s.paste(); e.preventDefault(); return; }
      if (mod && key === 'd') { s.duplicate(); e.preventDefault(); return; }
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && s.selection.length) {
        const up = e.code === 'BracketRight';
        s.reorder(e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward');
        e.preventDefault();
        return;
      }
      if (mod && key === 'a') { s.selectAll(); e.preventDefault(); return; }
      if (mod && key === 'z' && !e.shiftKey) { s.undo(); e.preventDefault(); return; }
      if ((mod && key === 'y') || (mod && key === 'z' && e.shiftKey)) { s.redo(); e.preventDefault(); return; }
      if (key === 'delete' || key === 'backspace') {
        if (s.selection.length) { s.deleteSelection(); e.preventDefault(); }
        return;
      }
      if (key === 'escape') {
        if (s.tool.type !== 'select') s.setTool({ type: 'select' });
        else if (s.enteredRowId) s.enterRow(null);
        else s.clearSelection();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
      if (arrows[key] && s.selection.length && !mod) {
        s.nudge(...arrows[key]);
        e.preventDefault();
      }
    };
    // Save works from inside a field too (a space number, a floor name): the field is
    // left first so what was typed is kept, and the browser's own "Save page" dialog
    // doesn't open. Fields stop their keys from reaching the handler above, so this
    // one listens first.
    const onSaveKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (document.querySelector('.dialog-backdrop')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) t.blur();
      onSave();
    };
    window.addEventListener('keydown', onSaveKey, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onSaveKey, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onSave]);
}

export const modLabel = isMac ? '⌘' : 'Ctrl+';
