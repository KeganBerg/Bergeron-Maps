import { useMemo } from 'react';
import { floorTitle } from '../model/interiors';
import type { MapDocument } from '../model/types';
import { Icon } from '../ui/icons';
import { feet, minutes, startPlaces } from '../model/route';
import { type Directions, type Start } from './directionsTypes';
import { useT } from '../i18n/useLanguage';

const STEP_ICON: Record<string, string> = { walk: 'directions', elevator: 'up', stairs: 'up', escalator: 'up', ramp: 'up', walkway: 'forward', inside: 'enter', outside: 'back' };

/** The panel at the bottom of the map: where are you starting, then the steps. */
export function DirectionsSheet(p: {
  dir: Exclude<Directions, { stage: 'tap' }>;
  doc: MapDocument;
  floorId: string;
  avoidStairs: boolean;
  onPick: (s: Start) => void;
  onTapMode: () => void;
  onChangeStart: () => void;
  onStep: (floorId: string) => void;
  onAvoidStairs: (v: boolean) => void;
  onClose: () => void;
}) {
  const { dir, doc } = p;
  const t = useT();
  const floorName = (id: string) => {
    const f = doc.floors.find((x) => x.id === id);
    return f ? floorTitle(doc, f) : '';
  };
  const places = useMemo(() => {
    const all = startPlaces(doc, t.words).filter((s) => s.obj.id !== dir.goal.objectId);
    // Ways in first, then this floor's elevators and stairs, then everything else; ramps (for cars) last.
    const rank = (s: (typeof all)[number]) => {
      const k = s.obj.kind === 'asset' ? s.obj.assetKey : '';
      const here = s.floor.id === p.floorId ? 0 : 1;
      if (/entrance|^exit$|ped-exit|checkpoint/.test(k)) return here;
      if (k.includes('ramp')) return 6 + here;
      if (/elevator|stair|escalator/.test(k)) return 2 + here * 2;
      return 3 + here * 2;
    };
    return all.map((s, i) => ({ s, i, r: rank(s) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.s);
  }, [doc, dir.goal.objectId, p.floorId, t]);
  const close = <button className="icon-btn" aria-label={t.closeDirections} onClick={p.onClose} data-testid="dir-close"><Icon name="close" /></button>;
  const multiFloor = doc.floors.length > 1;

  if (dir.stage === 'pick') {
    return (
      <div className="dir-sheet" role="region" aria-label={t.directions} tabIndex={-1} data-testid="directions-sheet">
        <div className="dir-head">
          <div>
            <strong>{t.directionsTo(dir.goal.name)}</strong>
            <span className="muted">{t.whereFrom}</span>
          </div>
          {close}
        </div>
        <div className="dir-list">
          <button className="dir-option primary" onClick={p.onTapMode} data-testid="dir-tap">
            <Icon name="locate" size={18} /> <span>{t.tapOnMap}</span>
          </button>
          {places.map((s) => (
            <button key={s.obj.id} className="dir-option" data-testid="dir-start"
              onClick={() => p.onPick({ floorId: s.floor.id, objectId: s.obj.id, x: s.obj.x, y: s.obj.y, name: s.name })}>
              <span>{s.name}</span>
              {multiFloor && <span className="muted">{floorTitle(doc, s.floor)}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (dir.stage === 'busy') {
    return (
      <div className="dir-sheet" role="region" aria-label={t.directions} tabIndex={-1} data-testid="directions-sheet">
        <div className="dir-head"><div><strong>{t.to(dir.goal.name)}</strong><span className="muted">{t.finding}</span></div>{close}</div>
      </div>
    );
  }
  if (dir.stage === 'none') {
    return (
      <div className="dir-sheet" role="region" aria-label={t.directions} tabIndex={-1} data-testid="directions-sheet">
        <div className="dir-head"><div><strong>{t.to(dir.goal.name)}</strong></div>{close}</div>
        <p className="dir-note" data-testid="dir-none">
          {dir.reason === 'same' ? t.alreadyThere : t.noWay(dir.start.name, p.avoidStairs)}
        </p>
        <div className="dir-actions">
          <button className="btn" onClick={p.onChangeStart}>{t.changeStart}</button>
          {p.avoidStairs && <button className="btn" onClick={() => p.onAvoidStairs(false)}>{t.allowStairs}</button>}
        </div>
      </div>
    );
  }
  const { route } = dir;
  const mins = minutes(route);
  return (
    <div className="dir-sheet" role="region" aria-label={t.directions} tabIndex={-1} data-testid="directions-sheet">
      <div className="dir-head">
        <div>
          <strong>{t.to(dir.goal.name)}</strong>
          <span className="muted" data-testid="dir-summary">{t.routeSummary(feet(route.length), mins, dir.start.name)}</span>
        </div>
        {close}
      </div>
      <ol className="dir-steps">
        {route.steps.map((s, i) => (
          <li key={i}>
            <button className={s.floorId === p.floorId ? 'here' : ''} onClick={() => p.onStep(s.kind === 'walk' ? s.floorId : s.toFloorId ?? s.floorId)} data-testid="route-step">
              <Icon name={STEP_ICON[s.kind] ?? 'directions'} size={16} />
              <span>{s.text}</span>
              {multiFloor && <span className="muted">{s.kind === 'walk' ? t.walkLength(floorName(s.floorId), feet(route.legs[s.leg!]?.length ?? 0)) : floorName(s.floorId)}</span>}
            </button>
          </li>
        ))}
      </ol>
      {route.squeezed && <p className="dir-note">{t.squeezed}</p>}
      <div className="dir-actions">
        <button className="btn" onClick={p.onChangeStart} data-testid="dir-change-start">{t.changeStart}</button>
        {multiFloor && (
          <label className="dir-check">
            <input type="checkbox" checked={p.avoidStairs} onChange={(e) => p.onAvoidStairs(e.target.checked)} data-testid="dir-avoid-stairs" /> {t.avoidStairs}
          </label>
        )}
      </div>
    </div>
  );
}
