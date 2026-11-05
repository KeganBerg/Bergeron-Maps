/**
 * Symbols from Google's Material Symbols set (fonts.google.com/icons,
 * Apache 2.0). The full set (about 3,900 icons) loads only when someone opens
 * the symbol picker. A chosen symbol's path is saved on the object itself, so
 * maps draw it in the editor, the viewer and exported files without loading
 * the set.
 */
import { esc, r2 } from './style';

export interface MapSymbol {
  /** Material Symbols name, e.g. "local_parking". */
  name: string;
  /** SVG path data in the 960-unit box (viewBox "0 -960 960 960"). */
  path: string;
}

/**
 * How an object shows its symbol. Missing = the asset's built-in symbol,
 * null = no symbol at all, otherwise the chosen Material symbol.
 */
export type SymbolChoice = MapSymbol | null | undefined;

/** Only path commands and numbers: anything else is dropped, so a map file can't inject markup. */
export const isSafePath = (d: unknown): d is string =>
  typeof d === 'string' && d.length > 0 && d.length < 20000 && /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/.test(d);

/** A Material symbol drawn in a size × size box centred on (cx, cy). */
export function symbolSvg(path: string, cx: number, cy: number, size: number, color: string): string {
  if (!isSafePath(path)) return '';
  const k = size / 960;
  return `<path d="${path}" fill="${esc(color)}" transform="translate(${r2(cx - size / 2)} ${r2(cy + size / 2)}) scale(${r2(k * 1000) / 1000})"/>`;
}

let loading: Promise<Record<string, string>> | null = null;
export function loadSymbols(): Promise<Record<string, string>> {
  loading ??= import('virtual:material-symbols').then((m) => m.default).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Shown first in the picker: what parking, valet and facility maps use most. */
export const COMMON_SYMBOLS = [
  'local_parking', 'garage', 'directions_car', 'car_rental', 'ev_station', 'ev_charger', 'electric_car', 'accessible', 'key',
  'vpn_key', 'badge', 'person', 'groups', 'directions_walk', 'elevator', 'stairs', 'escalator', 'door_front', 'meeting_room',
  'wc', 'restaurant', 'local_cafe', 'store', 'shopping_bag', 'luggage', 'hotel', 'local_hospital', 'medical_services',
  'local_police', 'security', 'lock', 'block', 'do_not_disturb_on', 'warning', 'report', 'emergency', 'fire_extinguisher',
  'fire_hydrant', 'local_shipping', 'inventory_2', 'build', 'handyman', 'cleaning_services', 'local_car_wash', 'local_gas_station',
  'two_wheeler', 'pedal_bike', 'airport_shuttle', 'directions_bus', 'flight', 'payments', 'attach_money', 'credit_card',
  'confirmation_number', 'schedule', 'info', 'help', 'star', 'favorite', 'flag', 'location_on', 'place', 'push_pin',
  'my_location', 'park', 'forest', 'grass', 'water_drop', 'delete', 'recycling', 'wifi', 'videocam', 'notifications',
  'call', 'mail', 'event', 'celebration', 'sports_stadium', 'local_activity', 'arrow_upward', 'arrow_forward', 'turn_right',
  'u_turn_left', 'north', 'trip_origin', 'circle', 'square', 'change_history', 'check_circle', 'cancel',
];

/** Everyday words that Material's icon names don't use. */
export const SYMBOL_ALIASES: Record<string, string[]> = {
  restroom: ['wc', 'man', 'woman', 'family_restroom'],
  bathroom: ['wc', 'family_restroom', 'bathtub'],
  toilet: ['wc'],
  handicap: ['accessible', 'accessible_forward'],
  ada: ['accessible', 'accessible_forward'],
  wheelchair: ['accessible', 'accessible_forward'],
  charging: ['ev_station', 'ev_charger', 'electric_car', 'bolt'],
  charger: ['ev_station', 'ev_charger'],
  valet: ['key', 'vpn_key', 'car_rental', 'room_service'],
  entrance: ['login', 'door_front', 'meeting_room'],
  exit: ['logout', 'exit_to_app', 'door_open'],
  office: ['business', 'corporate_fare', 'work', 'apartment'],
  food: ['restaurant', 'fastfood', 'local_dining', 'lunch_dining'],
  coffee: ['local_cafe', 'coffee'],
  trash: ['delete', 'recycling'],
  camera: ['videocam', 'photo_camera', 'linked_camera'],
  police: ['local_police', 'security'],
  fire: ['fire_extinguisher', 'local_fire_department', 'fire_hydrant'],
  hospital: ['local_hospital', 'emergency'],
  money: ['payments', 'attach_money', 'local_atm'],
  pay: ['payments', 'credit_card', 'local_atm'],
  bike: ['pedal_bike', 'directions_bike'],
  motorcycle: ['two_wheeler', 'motorcycle'],
  truck: ['local_shipping'],
  delivery: ['local_shipping', 'inventory_2'],
  tree: ['park', 'forest', 'nature'],
  stairs: ['stairs'],
  lift: ['elevator'],
};
