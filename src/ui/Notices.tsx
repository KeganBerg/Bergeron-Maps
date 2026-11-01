import { useEditor } from '../editor/store';
import { Icon } from './icons';

export function Notices() {
  const notices = useEditor((s) => s.notices);
  const dismiss = useEditor((s) => s.dismiss);
  if (!notices.length) return null;
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.tone}`} data-testid="notice">
          <span>{n.message}</span>
          {n.action && (
            <button className="btn small" onClick={() => { n.action!.run(); dismiss(n.id); }} data-testid="notice-action">
              {n.action.label}
            </button>
          )}
          <button className="icon-btn tiny" aria-label="Dismiss" onClick={() => dismiss(n.id)}><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}
