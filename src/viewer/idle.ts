/** Runs soon, when the browser has nothing else to do (or after half a second at most). */
export const whenIdle = (fn: () => void): number =>
  typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 500 }) : window.setTimeout(fn, 100);
export const cancelIdle = (id: number) => {
  if (!id) return;
  if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id);
  else window.clearTimeout(id);
};
