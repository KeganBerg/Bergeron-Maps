import { useEffect, useState } from 'react';
import { Icon } from './icons';

/** Long enough to read two lines; hovering or focusing the notice keeps it open. */
const SHOW_MS = 8000;

/**
 * A result ("Site renamed", "Link copied") as a notice in the corner that
 * fades out, instead of a bar that pushes the page down. Errors stay in the
 * page, where they can't be missed, and so does anything with a button the
 * person still needs.
 */
export function Toast({ note, onClose }: { note: string | null; onClose: () => void }) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!note || held) return;
    const t = setTimeout(onClose, SHOW_MS);
    return () => clearTimeout(t);
  }, [note, held]);
  if (!note) return null;
  return (
    <div className="toast" role="status" data-testid="toast"
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <Icon name="check" size={18} className="toast-icon" />
      <span className="toast-text">{note}</span>
      <button className="icon-btn toast-close" onClick={onClose} aria-label="Close notice"><Icon name="close" size={16} /></button>
    </div>
  );
}
