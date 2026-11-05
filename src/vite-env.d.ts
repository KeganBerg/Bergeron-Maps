/// <reference types="vite/client" />

declare module 'virtual:material-symbols' {
  /** Material Symbols icon name → SVG path data in a 960-unit box (viewBox "0 -960 960 960"). */
  const icons: Record<string, string>;
  export default icons;
}
