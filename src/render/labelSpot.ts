import { badgeLayout } from '../assets/draw';
import { symbolSupport, type AssetDef } from '../assets/library';
import { cleanLabelLayout } from '../model/labelLayout';
import type { AssetObject } from '../model/types';

/** Where an asset's name label goes, in the object's own coordinates. */
export function labelSpot(def: AssetDef | undefined, obj: AssetObject): { x: number; y: number; size: number; badge: boolean; moved: boolean } | null {
  const { width: w, height: h } = obj;
  let pos = def?.labelPos ?? 'below';
  // The name sits under the badge only while there is a badge.
  if (def && (pos === 'badge' || pos === 'center') && symbolSupport(def).custom) {
    const shows = !obj.symbolHidden && (!!obj.symbol || (pos === 'badge' && symbolSupport(def).builtIn));
    pos = shows ? 'badge' : 'center';
  }
  if (pos === 'inside') return null;
  if (pos === 'below') return { x: w / 2, y: h + 10, size: Math.max(10, Math.min(14, Math.max(w, h) * 0.22)), badge: false, moved: false };
  const lay = cleanLabelLayout(obj.labelLayout);
  const size = Math.max(10, Math.min(20, Math.min(w, h) * 0.16, (w / 8) * 1.6)) * (lay?.textScale ?? 1);
  if (lay?.text) return { x: lay.text.x * w, y: lay.text.y * h, size, badge: false, moved: true };
  return { x: w / 2, y: pos === 'badge' ? badgeLayout(w, h).labelY : h / 2, size, badge: pos === 'badge', moved: !!lay };
}
