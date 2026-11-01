/**
 * Small symbols (24 × 24 design box) used inside badges, signs, painted
 * markings and pins. All original line work for this project. `C` is replaced
 * by the glyph color.
 */
import { r2 } from './style';

const L = 'fill="none" stroke="C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const SOLID = 'fill="C"';

const G: Record<string, string> = {
  key: `<circle cx="7.5" cy="12" r="4" ${L}/><path d="M11.5 12H21M18 12v3.5M21 12v2.5" ${L}/>`,
  car: `<path d="M3.5 15v-3l2.2-4.6A2 2 0 0 1 7.5 6.2h9a2 2 0 0 1 1.8 1.2l2.2 4.6v3a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" ${L}/><path d="M4 12h16" ${L}/><circle cx="7.5" cy="16.5" r="1.8" ${SOLID}/><circle cx="16.5" cy="16.5" r="1.8" ${SOLID}/>`,
  carIn: `<path d="M2.5 15v-2.6l1.8-3.8A1.7 1.7 0 0 1 5.8 7.6h6.4a1.7 1.7 0 0 1 1.5 1l1.8 3.8V15a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8Z" ${L}/><path d="M17 11.5h5M19.5 9l2.5 2.5-2.5 2.5" ${L}/>`,
  person: `<circle cx="12" cy="4.5" r="2.2" ${SOLID}/><path d="M12 8v7M8 11l4-2 4 2M9.5 21l2.5-6 2.5 6" ${L}/>`,
  walk: `<circle cx="13" cy="4" r="2.2" ${SOLID}/><path d="M12.5 8 10.5 14l3 2.5 1 4.5M10.5 14 8 20.5M12.5 8l3.5 3 2.5.5M12.5 8 9 9.5 7.5 12.5" ${L}/>`,
  run: `<circle cx="15" cy="3.8" r="2.2" ${SOLID}/><path d="M13.5 8 11 13.5l4 3-1 4.5M11 13.5l-2.5 4H5M13.5 8l4 3.5h3M13.5 8 9.5 8.5 7.5 11.5" ${L}/>`,
  wheelchair: `<circle cx="10" cy="3.8" r="2.1" ${SOLID}/><path d="M10 7.5v6h6l2.5 5.5" ${L}/><path d="M10 10h5" ${L}/><path d="M7 11.2a5.6 5.6 0 1 0 7.7 7.4" ${L}/>`,
  bolt: `<path d="M13.5 2 5.5 13.5h6L10 22l8.5-12h-6Z" ${SOLID}/>`,
  plug: `<path d="M9 3v4.5M15 3v4.5M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0ZM12 16v5" ${L}/>`,
  star: `<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z" ${SOLID}/>`,
  wrench: `<path d="M14.5 3.5a5 5 0 0 0-4.6 6.9L3.5 16.8a1.9 1.9 0 0 0 2.7 2.7l6.4-6.4a5 5 0 0 0 6.9-4.6l-3 3-2.8-.8-.8-2.8Z" ${L}/>`,
  dollar: `<path d="M16.5 7.5c0-1.7-2-2.8-4.5-2.8S7.5 5.8 7.5 7.6c0 4.4 9 2.4 9 6.9 0 1.9-2 3-4.5 3s-4.5-1.2-4.5-2.9M12 2.5v19" ${L}/>`,
  info: `<circle cx="12" cy="12" r="9.5" ${L}/><path d="M12 11v6" ${L}/><circle cx="12" cy="7.3" r="1.4" ${SOLID}/>`,
  bed: `<path d="M2.5 19V6M2.5 15h19v4M21.5 15v-3.5a2.5 2.5 0 0 0-2.5-2.5h-8.5V15" ${L}/><circle cx="6.5" cy="11" r="2" ${L}/>`,
  dine: `<path d="M6 2.5v6.5a2 2 0 0 0 4 0V2.5M8 11v10.5M17.5 21.5V2.5c-2.5 1.5-3.5 4-3.5 7.5v3h3.5" ${L}/>`,
  briefcase: `<rect x="2.5" y="7" width="19" height="13" rx="2" ${L}/><path d="M9 7V4.5h6V7M2.5 12.5h19" ${L}/>`,
  bag: `<path d="M5 8h14l-1 13H6Z" ${L}/><path d="M9 10V6.5a3 3 0 0 1 6 0V10" ${L}/>`,
  ticket: `<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4Z" ${L}/><path d="M14.5 7v10" stroke="C" stroke-width="1.6" stroke-dasharray="1.6 1.6" fill="none"/>`,
  coffee: `<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM16 11h1.5a2.5 2.5 0 0 1 0 5H16M7.5 2.5c-1 1.3 1 2.2 0 3.5M11.5 2.5c-1 1.3 1 2.2 0 3.5" ${L}/>`,
  drop: `<path d="M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5Z" ${L}/>`,
  tire: `<circle cx="12" cy="12" r="9.5" ${L}/><circle cx="12" cy="12" r="4" ${L}/><path d="M12 2.5v5.5M12 16v5.5M2.5 12H8M16 12h5.5" ${L}/>`,
  wash: `<path d="M7 3.5S4 7.2 4 9.4a3 3 0 0 0 6 0C10 7.2 7 3.5 7 3.5ZM17 3.5s-3 3.7-3 5.9a3 3 0 0 0 6 0c0-2.2-3-5.9-3-5.9Z" ${L}/><path d="M3 16.5h18M5 20.5h14" ${L}/>`,
  camera: `<path d="M3 8h4l2-3h6l2 3h4v11H3Z" ${L}/><circle cx="12" cy="13" r="3.5" ${L}/>`,
  sparkle: `<path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8ZM18 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9Z" ${SOLID}/>`,
  box: `<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z" ${L}/><path d="M3 7.5 12 12l9-4.5M12 12v9" ${L}/>`,
  shield: `<path d="M12 2.5 4 5.5v6c0 5 3.5 8.6 8 10 4.5-1.4 8-5 8-10v-6Z" ${L}/><path d="m8.5 12 2.5 2.5 4.5-5" ${L}/>`,
  flag: `<path d="M5 21.5V3M5 4h12l-2.5 4L17 12H5" ${L}/>`,
  clock: `<circle cx="12" cy="12" r="9.5" ${L}/><path d="M12 6.5V12l3.5 2.5" ${L}/>`,
  clipboard: `<rect x="4.5" y="4" width="15" height="17.5" rx="2" ${L}/><path d="M9 4V2.5h6V4M8 10h8M8 14h8M8 18h5" ${L}/>`,
  bell: `<path d="M5 17h14l-1.6-2.2V10a5.4 5.4 0 0 0-10.8 0v4.8ZM10 20h4" ${L}/>`,
  desk: `<path d="M2.5 9.5h19M4.5 9.5v10M19.5 9.5v10M13 9.5v6h6.5" ${L}/><circle cx="8.5" cy="5.5" r="2.3" ${L}/>`,
  sofa: `<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2.5 12.5a1.5 1.5 0 0 1 3 0v1.5h13v-1.5a1.5 1.5 0 0 1 3 0V18h-19ZM5 18v2.5M19 18v2.5" ${L}/>`,
  gear: `<circle cx="12" cy="12" r="3.2" ${L}/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" ${L}/>`,
  fan: `<circle cx="12" cy="12" r="9.5" ${L}/><path d="M12 12c0-3 1-5.5 3.5-5.5S17 10 12 12Zm0 0c3 0 5.5 1 5.5 3.5S14 17 12 12Zm0 0c0 3-1 5.5-3.5 5.5S7 14 12 12Zm0 0c-3 0-5.5-1-5.5-3.5S10 7 12 12Z" ${L}/>`,
  stairs: `<path d="M3 20h5v-5h5v-5h5V5h3" ${L}/>`,
  elevator: `<rect x="3.5" y="2.5" width="17" height="19" rx="1.5" ${L}/><path d="M8 9.5 12 5.5l4 4ZM8 14.5l4 4 4-4Z" ${SOLID}/>`,
  escalator: `<path d="M3 19h4.5L16 8.5h5" ${L}/><path d="M13 13.5l3.5-3.5" ${L}/><path d="m15 4.5 4.5 0 0 4.5" ${L}/>`,
  up: `<path d="M12 21V4M5 10.5 12 3.5l7 7" ${L}/>`,
  down: `<path d="M12 3v17M5 13.5l7 7 7-7" ${L}/>`,
  right: `<path d="M3 12h17M13.5 5l7 7-7 7" ${L}/>`,
  left: `<path d="M21 12H4M10.5 5l-7 7 7 7" ${L}/>`,
  upDown: `<path d="M8 21V4M3.5 8.5 8 4l4.5 4.5M16 3v17M11.5 15.5 16 20l4.5-4.5" ${L}/>`,
  door: `<path d="M5 21.5V3h10v18.5M3 21.5h18M15 3l4 2v14l-4 2.5" ${L}/><circle cx="12" cy="12.5" r="1" ${SOLID}/>`,
  enter: `<path d="M13 3h6v18h-6M3 12h11M10 8l4 4-4 4" ${L}/>`,
  exit: `<path d="M11 3H5v18h6M10 12h11M17 8l4 4-4 4" ${L}/>`,
  pin: `<path d="M12 21.5s-7-6.6-7-12a7 7 0 0 1 14 0c0 5.4-7 12-7 12Z" ${L}/><circle cx="12" cy="9.5" r="2.6" ${L}/>`,
  meet: `<circle cx="7.5" cy="6" r="2.4" ${SOLID}/><circle cx="16.5" cy="6" r="2.4" ${SOLID}/><path d="M3.5 20v-6a4 4 0 0 1 8 0v6M12.5 20v-6a4 4 0 0 1 8 0v6" ${L}/>`,
  alert: `<path d="M12 3 2 20.5h20Z" ${L}/><path d="M12 9.5v5" ${L}/><circle cx="12" cy="17.3" r="1.2" ${SOLID}/>`,
  cross: `<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" ${SOLID}/>`,
  hand: `<path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10M10 9.5V4a1.5 1.5 0 0 1 3 0v6M13 9.5V5a1.5 1.5 0 0 1 3 0v6M16 10V7.5a1.5 1.5 0 0 1 3 0v6.5c0 4-3 7.5-7 7.5-3 0-4.5-1.5-6.5-4.5L3.5 13a1.6 1.6 0 0 1 2.6-1.8L7 12.5" ${L}/>`,
  handoff: `<circle cx="6.5" cy="12" r="3" ${L}/><path d="M9.5 12h6M13.5 12v2.5" ${L}/><path d="M15 6.5h6M18.5 4l2.5 2.5L18.5 9M21 17.5h-6M17.5 15 15 17.5l2.5 2.5" ${L}/>`,
  queue: `<path d="M3 6h3M9 6h3M15 6h3M3 12h3M9 12h3M15 12h3M3 18h3M9 18h3" ${L}/><path d="M18 15v6M15.5 18.5 18 21l2.5-2.5" ${L}/>`,
  lift: `<path d="M4 21.5V5M20 21.5V5M4 9h16M4 15h16" ${L}/><path d="M7 9V6.5h10V9" ${L}/>`,
  oil: `<path d="M3 10.5h8.5l3.5-2.5 5 1.5-4 3.5H6.5L3 10.5Z" ${L}/><path d="M3 10.5v6.5h12.5V13" ${L}/><path d="M20 15s-1.5 1.8-1.5 2.8a1.5 1.5 0 0 0 3 0c0-1-1.5-2.8-1.5-2.8Z" ${SOLID}/>`,
  align: `<circle cx="12" cy="12" r="9.5" ${L}/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" ${L}/><circle cx="12" cy="12" r="2" ${SOLID}/>`,
  fuel: `<path d="M4 21.5V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16.5M2.5 21.5h13M4 10h10M14 8.5l3.5 2.5v6.5a1.5 1.5 0 0 0 3 0V7l-3-3" ${L}/>`,
  truck: `<path d="M2.5 5.5h11v10h-11ZM13.5 9h4.5l3.5 3.5v3h-8" ${L}/><circle cx="6.5" cy="17" r="1.9" ${SOLID}/><circle cx="17" cy="17" r="1.9" ${SOLID}/>`,
  storage: `<rect x="3" y="3" width="18" height="18" rx="1.5" ${L}/><path d="M3 9h18M3 15h18M10 6h4M10 12h4M10 18h4" ${L}/>`,
  toilet: `<path d="M6 3h7v5H6ZM4 10h15a7 7 0 0 1-7 7H8.5L8 21.5h7" ${L}/>`,
  man: `<circle cx="12" cy="3.8" r="2.2" ${SOLID}/><path d="M8 8h8v7h-2v6.5h-4V15H8Z" ${SOLID}/>`,
  woman: `<circle cx="12" cy="3.8" r="2.2" ${SOLID}/><path d="M10 8h4l3.5 9h-3v4.5h-5V17h-3Z" ${SOLID}/>`,
  restroom: `<circle cx="7" cy="4" r="2" ${SOLID}/><path d="M4.5 7.5h5V14H8.3v6.5H5.7V14H4.5Z" ${SOLID}/><circle cx="17" cy="4" r="2" ${SOLID}/><path d="M15.3 7.5h3.4l2.8 7.5h-2.4v5.5h-4.2V15h-2.4Z" ${SOLID}/><path d="M12 3v18" stroke="C" stroke-width="1.4"/>`,
  hanger: `<path d="M12 7.5a2 2 0 1 0-2-2M12 7.5v2L3 16h18l-9-6.5" ${L}/>`,
  lock: `<rect x="4.5" y="10.5" width="15" height="11" rx="2" ${L}/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" ${L}/>`,
  noEntry: `<circle cx="12" cy="12" r="9.5" ${L}/><path d="M6.5 12h11" stroke="C" stroke-width="3.2" stroke-linecap="round"/>`,
  cone: `<path d="M9.5 3h5l4.5 15h-14Z" ${L}/><path d="M3 21h18M8 10.5h8M6.8 14.5h10.4" ${L}/>`,
  extinguisher: `<rect x="7.5" y="7" width="9" height="14.5" rx="3" ${L}/><path d="M12 7V4.5M9.5 4.5H15M15 4.5l4 2.5" ${L}/>`,
  hydrant: `<path d="M8 21.5V9a4 4 0 0 1 8 0v12.5M6 21.5h12M5 12h3M16 12h3M12 3v2" ${L}/>`,
  globe: `<circle cx="12" cy="12" r="9.5" ${L}/><path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19" ${L}/>`,
  photo: `<rect x="2.5" y="4.5" width="19" height="15" rx="2" ${L}/><path d="m2.5 17 5.5-5.5 4 4 3-3 6.5 6.5" ${L}/><circle cx="16" cy="8.5" r="1.6" ${SOLID}/>`,
  plan: `<rect x="2.5" y="2.5" width="19" height="19" ${L}/><path d="M2.5 10h8V2.5M10.5 14v7.5M10.5 14h11M15 10h6.5" ${L}/>`,
  pdf: `<path d="M5 2.5h9.5L19 7v14.5H5Z M14.5 2.5V7H19" ${L}/><path d="M8 13h8M8 17h5" ${L}/>`,
  layers: `<path d="M12 3 2.5 8 12 13l9.5-5Z" ${L}/><path d="M2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5" ${L}/>`,
  svg: `<path d="M4.5 19.5 10 4.5 15 14.5 19.5 9" ${L}/><circle cx="4.5" cy="19.5" r="1.8" ${SOLID}/><circle cx="19.5" cy="9" r="1.8" ${SOLID}/>`,
  group: `<rect x="2.5" y="2.5" width="11" height="11" rx="1" ${L}/><rect x="10.5" y="10.5" width="11" height="11" rx="1" ${L}/>`,
  template: `<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2.5" ${L}/><path d="M12 8v8M8 12h8" ${L}/>`,
  building: `<path d="M3.5 21.5V6l8-3.5v19M11.5 8h9v13.5M2 21.5h20M6.5 9h2M6.5 13h2M6.5 17h2M14.5 12h3M14.5 16h3" ${L}/>`,
  showroom: `<path d="M2.5 21V9l9.5-6 9.5 6v12" ${L}/><path d="M6 18v-2l1.4-3a1.4 1.4 0 0 1 1.3-.9h6.6a1.4 1.4 0 0 1 1.3.9L18 16v2Z" ${L}/>`,
  handshake: `<path d="m2.5 11 4-4 3 1.5 3-2 4 1 5 4.5M2.5 11l6 6.5a1.6 1.6 0 0 0 2.3-2.2M10.8 15.3l1.6 1.6a1.6 1.6 0 0 0 2.3-2.3M14.7 14.6l.8.8a1.6 1.6 0 0 0 2.3-2.3l-4.3-4.6" ${L}/>`,
  north: `<path d="M12 2.5 18 21l-6-4-6 4Z" ${L}/><path d="M12 2.5V17L6 21Z" ${SOLID}/>`,
  ruler: `<path d="M2.5 15.5 15.5 2.5l6 6-13 13Z" ${L}/><path d="m6.5 11.5 2 2M9.5 8.5l2 2M12.5 5.5l2 2" ${L}/>`,
  vip: `<path d="M3 7l3 3.5L12 4l6 6.5L21 7l-2 11H5Z" ${L}/>`,
  grid: `<path d="M3 3h18v18H3ZM9 3v18M15 3v18M3 9h18M3 15h18" ${L}/>`,
  speed: `<path d="M3.5 17a8.5 8.5 0 1 1 17 0" ${L}/><path d="m12 16 4.5-6" ${L}/>`,
  height: `<path d="M3 4h18M3 20h18M12 6.5v11M9 9l3-3 3 3M9 15l3 3 3-3" ${L}/>`,
  flower: `<circle cx="12" cy="9" r="2.4" ${L}/><path d="M12 6.6a3 3 0 1 1 2.4 1.3M14.4 9.6a3 3 0 1 1-1 2.6M10.6 11.1a3 3 0 1 1-2.2-1.6M9.6 8.2A3 3 0 1 1 12 6.6M12 11.5v10M12 17c-2.5 0-4-1.5-4.5-3.5M12 19c2.5 0 4-1.5 4.5-3.5" ${L}/>`,
  tree: `<path d="M12 2.5 5 12h3.5L5 17h14l-3.5-5H19ZM12 17v4.5" ${L}/>`,
  pond: `<path d="M2.5 14c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M2.5 18.5c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0" ${L}/><path d="M8 10.5c0-3 2-5.5 4-7 2 1.5 4 4 4 7" ${L}/>`,
  dumpster: `<path d="M3 8h18l-1.5 12h-15ZM2 8l2-3.5h16L22 8M8 11v6M12 11v6M16 11v6" ${L}/>`,
  sign: `<rect x="3" y="3" width="18" height="11" rx="1.5" ${L}/><path d="M12 14v7.5M7 8.5h10" ${L}/>`,
  hammer: `<path d="M14 6.5 5 15.5a2 2 0 0 0 3 3l9-9M12.5 4.5l3-2 6 6-2 3Z" ${L}/>`,
  closed: `<rect x="2.5" y="7" width="19" height="7" rx="1" ${L}/><path d="M6 7l-3.5 7M11 7l-4 7M16 7l-4 7M21.5 7.5 18 14M5 14v6.5M19 14v6.5" ${L}/>`,
  moto: `<circle cx="5" cy="16" r="3.6" ${L}/><circle cx="19" cy="16" r="3.6" ${L}/><path d="M5 16 9 10.5h5.5L19 16M9 10.5 7.8 7.5H5M14.5 10.5 16.5 6.5h2.5" ${L}/>`,
  doubleArrow: `<path d="M2.5 12h19M6.5 8l-4 4 4 4M17.5 8l4 4-4 4" ${L}/>`,
  detour: `<path d="M4 21v-8a4 4 0 0 1 4-4h11.5M15.5 5l4 4-4 4" ${L}/><path d="M4 4v4" ${L}/>`,
};

export type GlyphName = keyof typeof G;

/** A glyph centered on (cx, cy) at the given size. */
export function glyph(name: string, cx: number, cy: number, size: number, color: string): string {
  const body = G[name];
  if (!body) return '';
  const k = size / 24;
  return `<g transform="translate(${r2(cx - size / 2)} ${r2(cy - size / 2)}) scale(${r2(k)})">${body.replace(/="C"/g, `="${color}"`)}</g>`;
}

export const GLYPH_NAMES = Object.keys(G);
