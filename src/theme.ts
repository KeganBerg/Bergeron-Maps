/**
 * Visual themes. The app chrome is styled by CSS variables under
 * :root[data-theme=…] in styles.css; the map canvas (drawn by Konva, not CSS)
 * reads its colors from MAP_PALETTE below.
 */
export type ThemeName = 'classic' | 'night' | 'signage';
export const THEMES: ThemeName[] = ['classic', 'night', 'signage'];

export interface MapPalette {
  spaceFill: string;
  spaceStroke: string;
  label: string;
  highlightFill: string;
  highlightLabel: string;
  ring: string;
  selection: string;
  font: string;
}

const PALETTES: Record<ThemeName, MapPalette> = {
  classic: {
    spaceFill: '#ffffff', spaceStroke: '#1f2937', label: '#111827', highlightFill: '#fde68a', highlightLabel: '#111827',
    ring: '#f59e0b', selection: '#2563eb', font: 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  night: {
    spaceFill: '#383a40', spaceStroke: '#f4f1e8', label: '#ffffff', highlightFill: '#ffc629', highlightLabel: '#17181a',
    ring: '#ffc629', selection: '#ffc629', font: '"Barlow Condensed", "IBM Plex Sans", sans-serif',
  },
  signage: {
    spaceFill: '#ffffff', spaceStroke: '#0b2545', label: '#0b2545', highlightFill: '#f2b705', highlightLabel: '#0b2545',
    ring: '#f2b705', selection: '#0b2545', font: 'Overpass, "Segoe UI", sans-serif',
  },
};

/** Real garages color-code their levels; floors get the same treatment. */
export const FLOOR_COLORS = ['#c8102e', '#d4650f', '#007a33', '#0057b8', '#6a1b9a', '#00838f', '#8d6e63', '#455a64'];
export const floorColor = (index: number) => FLOOR_COLORS[index % FLOOR_COLORS.length];

const luminance = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** White or near-black, whichever reads better on the floor's color (at least 4.5:1 for every floor color). */
export const floorTextColor = (index: number) => {
  const l = luminance(floorColor(index));
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / (luminance('#17181a') + 0.05)) ? '#ffffff' : '#17181a';
};
/** The CSS variables a floor button or tab needs: its color and readable text on it. */
export const floorVars = (index: number) => ({ ['--floor-color' as string]: floorColor(index), ['--on-floor' as string]: floorTextColor(index) });

function readTheme(): ThemeName {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('theme') as ThemeName | null;
    if (fromUrl && THEMES.includes(fromUrl)) {
      localStorage.setItem('bm.theme', fromUrl);
      return fromUrl;
    }
    const saved = localStorage.getItem('bm.theme') as ThemeName | null;
    if (saved && THEMES.includes(saved)) return saved;
  } catch {
    /* default below */
  }
  return 'signage';
}

export const THEME: ThemeName = typeof window === 'undefined' ? 'signage' : readTheme();
export const MAP_PALETTE: MapPalette = PALETTES[THEME];

export function applyTheme() {
  document.documentElement.dataset.theme = THEME;
}
