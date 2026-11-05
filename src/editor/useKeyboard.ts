import { useEffect } from 'react';
import { useEditor } from './store';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Standard shortcuts only: Ctrl/⌘ + C, V, X, D, Z, Y / Shift+Z, A, S;
 * Delete/Backspace; Escape; arrow keys nudge (Shift = 10).
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
      if (mod && key === 's') { onSave(); e.preventDefault(); return; }
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);
}

export const modLabel = isMac ? '⌘' : 'Ctrl+';
