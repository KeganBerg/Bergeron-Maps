import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export interface MoreItem {
  label: string;
  onClick: () => void;
  /** Removes or erases something: shown in red, after a divider. */
  danger?: boolean;
  testId?: string;
  title?: string;
}

/**
 * A row's less-used actions behind one "More" button, so each row shows its
 * main action and the list doesn't turn into a wall of buttons. Closes on a
 * pick, a click elsewhere or Escape; arrow keys move between items.
 */
export function MoreMenu({ items, label, testId }: { items: MoreItem[]; label: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  if (!items.length) return null;
  const close = () => { setOpen(false); button.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    all[(at + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
  };
  const plain = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);
  const item = (i: MoreItem) => (
    <button key={i.label} role="menuitem" className={i.danger ? 'danger-text' : undefined} title={i.title} data-testid={i.testId}
      onClick={() => { setOpen(false); i.onClick(); }}>
      {i.label}
    </button>
  );

  return (
    <div className="more" ref={wrap} onKeyDown={onKey}>
      <button ref={button} className="btn small more-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
        onClick={() => setOpen((o) => !o)} data-testid={testId}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="more-menu" role="menu" aria-label={label}>
          {plain.map(item)}
          {plain.length > 0 && danger.length > 0 && <hr />}
          {danger.map(item)}
        </div>
      )}
    </div>
  );
}
