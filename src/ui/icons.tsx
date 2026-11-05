import type { SVGProps } from 'react';

const paths: Record<string, string> = {
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  paste: 'M9 4h6v3H9zM15 5h3v15H6V5h3',
  cut: 'M6 6a2 2 0 1 0 0 .01M6 18a2 2 0 1 0 0 .01M8 7l12 10M8 17 20 7',
  duplicate: 'M8 8h12v12H8zM4 4h12v4M4 4v12h4M14 11v6M11 14h6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.3 6.3C3.6 8 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.7-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  plus: 'M12 5v14M5 12h14',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1-5.5-3L3.3 13.6a1.5 1.5 0 0 1 2.4-1.8L8 14',
  cursor: 'm5 3 14 8-6 2-3 6z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  rows: 'M3 6h18v12H3zM8 6v12M13 6v12M18 6v12',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 0 0 .01',
  play: 'M7 4v16l13-8z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  shapes: 'M4 4h7v7H4zM17.5 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM4 20l3.5-6 3.5 6zM14 14h7v7h-7z',
  chevronLeft: 'm15 6-6 6 6 6',
  chevronRight: 'm9 6 6 6-6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  alignLeft: 'M4 3v18M8 7h10v4H8zM8 14h6v4H8z',
  alignHCenter: 'M12 3v18M6 7h12v4H6zM8 14h8v4H8z',
  alignRight: 'M20 3v18M6 7h10v4H6zM10 14h6v4h-6z',
  alignTop: 'M3 4h18M7 8h4v10H7zM14 8h4v6h-4z',
  alignVCenter: 'M3 12h18M7 6h4v12H7zM14 8h4v8h-4z',
  alignBottom: 'M3 20h18M7 6h4v10H7zM14 10h4v6h-4z',
  distH: 'M4 3v18M20 3v18M10 7h4v10h-4z',
  distV: 'M3 4h18M3 20h18M7 10h10v4H7z',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5 9-10',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  home: 'M3 11 12 4l9 7M5 10v10h14V10',
  back: 'M19 12H5M11 6l-6 6 6 6',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  sort: 'M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  cutFree: 'M6 18c-2-3-2-8 2-11s9-3 11 0 1 7-3 8-6-1-7 2M4 20l2-2',
  cutGrid: 'M4 4h4M11 4h2M16 4h4v4M20 11v2M20 16v4h-4M13 20h-2M8 20H4v-4M4 13v-2M4 8V4',
  toFront: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  forward: 'M12 19V6M7 11l5-5 5 5',
  backward: 'M12 5v13M7 13l5 5 5-5',
  toBack: 'M12 4v11M7 10l5 5 5-5M5 20h14',
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
