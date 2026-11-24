// What each sample site shows in the industry clips (clips.mjs) and tablet stills (tablet.mjs).
// What happens in each clip. The phone searches for the page's own example (sample.find in
// scripts/site-pages.mjs), so the caption and the clip agree. from: where directions start;
// lib/tile/drop: the library search, the tile picked, and where it is dragged to (map units).
// step: a direction step to tap at the end, to show the next floor.
// The dropped item is left out of the sample map in scenes.ts (see CLIP_ITEM there), so the clip adds it.
export const PLAN = {
  dealership: {
    from: 'Entrance',
    lib: 'inventory',
    tile: 'used-inventory-sign',
    drop: [730, 420],
    focus: [620, 400],
    zoom: 1.3,
  },
  warehouse: { from: 'Entrance', lib: 'first aid', tile: 'first-aid', drop: [70, 300], focus: [520, 420], zoom: 1.1 },
  school: { from: 'Visitor entrance', lib: 'aed', tile: 'aed', drop: [960, 300], focus: [700, 450], zoom: 1.2 },
  valet: {
    from: 'Entrance',
    lib: 'key',
    tile: 'key-box',
    drop: [260, 770],
    focus: [420, 430],
    zoom: 1.1,
    step: 'Walk to Space',
  },
  office: {
    from: 'Elevator',
    lib: 'cubicle',
    tile: 'cubicle-cluster',
    drop: [560, 470],
    focus: [600, 360],
    zoom: 1.15,
  },
};
