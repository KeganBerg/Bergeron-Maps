import { Dialog } from '../ui/Dialog';
import { modLabel } from './useKeyboard';

const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Edit',
    rows: [
      ['Undo', `${modLabel}Z`],
      ['Redo', `${modLabel}Y or ${modLabel}Shift+Z`],
      ['Cut, copy, paste', `${modLabel}X, ${modLabel}C, ${modLabel}V`],
      ['Duplicate', `${modLabel}D`],
      ['Duplicate while dragging', 'Hold Alt (Option on Mac) and drag'],
      ['Delete', 'Delete or Backspace'],
      ['Save and keep a version', `${modLabel}S`],
    ],
  },
  {
    title: 'Select and arrange',
    rows: [
      ['Select all', `${modLabel}A`],
      ['Add to or remove from the selection', `Shift+click or ${modLabel}click`],
      ['Select all of the same type', 'Right-click an object'],
      ['Deselect, or leave a row', 'Esc'],
      ['Nudge 1 px, or 10 px', 'Arrow keys, Shift+arrow keys'],
      ['Bring forward, send backward', `${modLabel}], ${modLabel}[`],
      ['Bring to front, send to back', `${modLabel}Shift+], ${modLabel}Shift+[`],
      ['Edit one space in a row', 'Double-click it'],
    ],
  },
  {
    title: 'View',
    rows: [
      ['Zoom in, zoom out', `${modLabel}plus, ${modLabel}minus, or scroll / pinch`],
      ['Zoom to 100%', `${modLabel}0`],
      ['Fit the floor to the screen', 'Shift+1'],
      ['Zoom to the selection', 'Shift+2'],
      ['Pan', 'Hold Space and drag, or drag with the middle button'],
      ['This list', '?'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} wide footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="shortcuts" data-testid="shortcuts">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h3>{s.title}</h3>
            <dl>
              {s.rows.map(([what, keys]) => (
                <div key={what}>
                  <dt>{what}</dt>
                  <dd><kbd>{keys}</kbd></dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
