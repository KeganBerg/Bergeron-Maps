import type { AssetObject, Floor } from '../model/types';
import { buildingName } from '../model/interiors';
import { floorVars } from '../theme';
import { Icon } from '../ui/icons';

/**
 * The bar of floors along the bottom of the viewer: Outside (inside a
 * building), All floors (the side view), and a button per floor, marked when
 * the route passes through it.
 */
export function FloorBar({ floor, group, inside, sideOpen, routeFloors, onOutside, onToggleSide, onPickFloor }: {
  floor: Floor;
  /** The floors that belong together (a garage's levels, or a building's floors). */
  group: Floor[];
  /** The building whose floor plan is open, and the site floor it stands on. */
  inside: { building: AssetObject; floor: Floor } | null;
  sideOpen: boolean;
  routeFloors: Set<string>;
  onOutside: () => void;
  onToggleSide: () => void;
  onPickFloor: (f: Floor) => void;
}) {
  return (
        <nav className="viewer-floors" aria-label="Floors">
          {inside && (
            <button className="outside" onClick={onOutside} data-testid="go-outside" title={`Back outside to ${inside.floor.name}`}>
              <Icon name="back" size={16} /> Outside
            </button>
          )}
          {inside && <span className="viewer-building" data-testid="viewer-building">{buildingName(inside.building)}</span>}
          {group.length > 1 && (
            <button className={`side-toggle${sideOpen ? ' on' : ''}`} aria-expanded={sideOpen} data-testid="side-view-toggle"
              aria-label="Side view of all floors" title="See every floor stacked, side on"
              onClick={onToggleSide}>
              <Icon name="floors" size={18} /> <span>All floors</span>
            </button>
          )}
          {(inside && group.length < 2 ? [] : group).map((f, i) => (
            <button key={f.id} className={[f.id === floor.id ? 'active' : '', routeFloors.has(f.id) ? 'on-route' : ''].join(' ').trim() || undefined} aria-pressed={f.id === floor.id}
              style={floorVars(i)}
              onClick={() => onPickFloor(f)} data-testid={`viewer-floor-${f.name}`}>
              {f.name}
            </button>
          ))}
        </nav>
  );
}
