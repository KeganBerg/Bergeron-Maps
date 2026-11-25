import { useCallback, useRef } from 'react';

/**
 * Calm layout motion for the admin pages (Sites and people, All accounts, Maps, My Locations).
 *
 * Put `ref={useMotion()}` on a container. From then on, without any other code:
 * - its children fade and rise in (6px, 220ms) when they appear, a few at a time when several do;
 * - removed children fade out where they were instead of vanishing;
 * - children that shift because something above them changed slide to their new place;
 * - the container's own height eases to its new size, so whatever sits below it glides too.
 *
 * What is already there when a page opens doesn't move: the page as a whole fades in once
 * (`.home-main` in styles.css), so switching pages in the side bar is one calm step instead of
 * every card and row rising in on its own.
 *
 * It only uses opacity, transform and a short height change, eased out, the way established SaaS
 * products move. Nothing plays for people who ask their device for less motion, nor where the
 * browser has no Web Animations (tests in jsdom). A container inside another one handles its own
 * changes, so the outer one doesn't animate the same change twice.
 */

export const MOTION = {
  /** Appear, move and resize. */
  duration: 220,
  /** Leaving is a little quicker than arriving. */
  exit: 150,
  /** Between items that appear together. */
  stagger: 30,
  /** Later items in a batch start together, so a long list never takes long. */
  maxStagger: 6,
  rise: 6,
  /** A standard ease-out: quick start, gentle settle. */
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const canAnimate = () =>
  typeof window !== 'undefined' && typeof MutationObserver !== 'undefined' && typeof Element.prototype.animate === 'function' && !prefersReducedMotion();

interface Box { top: number; left: number; width: number; height: number }

/** Where an element sits in the page's layout, ignoring any transform an animation is applying. */
function layoutOffset(el: HTMLElement): { top: number; left: number } {
  let top = 0;
  let left = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    top += n.offsetTop;
    left += n.offsetLeft;
  }
  return { top, left };
}

const MARK = 'motion';

export interface MotionOptions {
  /** Also bring in the children that are there when the container first shows. Default false (see the top of this file). */
  appear?: boolean;
}

/** Turns on layout motion for one container. See the top of this file. */
export function attachMotion(container: HTMLElement, { appear = false }: MotionOptions = {}): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  container.dataset[MARK] = '';
  // Leaving children are drawn in place with absolute positioning, so the container holds them.
  const setPosition = getComputedStyle(container).position === 'static';
  if (setPosition) container.style.position = 'relative';
  // Leaving copies sit behind everything else in the container (z-index -1), so cards and rows moving
  // into their place cover them instead of overlapping. isolate keeps them above the container's own background.
  const setIsolation = getComputedStyle(container).isolation !== 'isolate';
  if (setIsolation) container.style.isolation = 'isolate';
  const boxes = new Map<Element, Box>();
  let height = container.offsetHeight;
  const heightAnim: { current: Animation | null } = { current: null };

  const kids = () => Array.from(container.children).filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute('data-motion-exit'));
  const remember = () => {
    const base = layoutOffset(container);
    boxes.clear();
    for (const k of kids()) {
      const o = layoutOffset(k);
      boxes.set(k, { top: o.top - base.top, left: o.left - base.left, width: k.offsetWidth, height: k.offsetHeight });
    }
    if (!heightAnim.current) height = container.offsetHeight;
  };

  const enter = (el: HTMLElement, i: number, rise = true) => {
    el.animate(
      [{ opacity: 0, transform: rise ? `translateY(${MOTION.rise}px)` : 'none' }, { opacity: 1, transform: 'none' }],
      { duration: MOTION.duration, easing: MOTION.easing, delay: Math.min(i, MOTION.maxStagger) * MOTION.stagger, fill: 'backwards' },
    );
  };

  /** A copy of a removed child fades out where it was. The copy can't be clicked, read aloud or found by tests. */
  const leave = (el: HTMLElement, box: Box) => {
    const ghost = el.cloneNode(true) as HTMLElement;
    for (const n of [ghost, ...Array.from(ghost.querySelectorAll('*'))]) {
      for (const a of ['id', 'data-testid', 'role', 'aria-live', 'name', 'for']) n.removeAttribute(a);
    }
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-motion-exit', '');
    ghost.inert = true;
    Object.assign(ghost.style, {
      position: 'absolute', top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px`,
      margin: '0', pointerEvents: 'none', boxSizing: 'border-box', zIndex: '-1',
    });
    container.appendChild(ghost);
    const a = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.exit, easing: MOTION.easing, fill: 'forwards' });
    const done = () => ghost.remove();
    a.onfinish = done;
    a.oncancel = done;
  };

  const onChange = (records: MutationRecord[]) => {
    // Changes inside a nested motion container are that container's to animate.
    const mine = records.filter((r) => {
      const t = r.target instanceof Element ? r.target : r.target.parentElement;
      if (!t) return false;
      const nodes = [...r.addedNodes, ...r.removedNodes];
      if (nodes.length && nodes.every((n) => n instanceof Element && n.hasAttribute('data-motion-exit'))) return false;
      return t.closest('[data-motion]') === container;
    });
    if (!mine.length) return;
    if (!canAnimate() || !container.isConnected) return remember();

    const before = new Map(boxes);
    const fromHeight = heightAnim.current ? container.getBoundingClientRect().height : height;
    heightAnim.current?.cancel();
    heightAnim.current = null;

    const added = new Set<HTMLElement>();
    const deepAdded = new Set<HTMLElement>();
    for (const r of mine) {
      for (const n of r.addedNodes) {
        if (!(n instanceof HTMLElement) || n.hasAttribute('data-motion-exit')) continue;
        if (n.parentElement === container) added.add(n);
        else deepAdded.add(n);
      }
      if (r.target === container) {
        for (const n of r.removedNodes) {
          const box = n instanceof HTMLElement ? before.get(n) : undefined;
          if (box && n instanceof HTMLElement && !n.isConnected) leave(n, box);
        }
      }
    }

    remember();
    let i = 0;
    for (const k of kids()) {
      if (added.has(k)) { enter(k, i++); continue; }
      const was = before.get(k);
      const now = boxes.get(k);
      if (!was || !now) continue;
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      k.getAnimations().forEach((a) => a.cancel());
      k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOTION.duration, easing: MOTION.easing });
    }
    // Something new deeper down (a form opening in a row, a line of text) only fades, so text never jumps sideways.
    let j = 0;
    for (const n of deepAdded) if (n.isConnected && !n.closest('[data-motion-exit]')) enter(n, j++, false);

    const toHeight = container.offsetHeight;
    height = toHeight;
    if (Math.abs(toHeight - fromHeight) >= 1) {
      const a = container.animate([{ height: `${fromHeight}px`, overflow: 'hidden' }, { height: `${toHeight}px`, overflow: 'hidden' }],
        { duration: MOTION.duration, easing: MOTION.easing });
      heightAnim.current = a;
      a.onfinish = () => { if (heightAnim.current === a) { heightAnim.current = null; remember(); } };
    }
  };

  const mo = new MutationObserver(onChange);
  mo.observe(container, { childList: true, subtree: true, characterData: true });
  // Keep the remembered places current when the window or fonts change the layout.
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!heightAnim.current) remember(); }) : null;
  ro?.observe(container);
  remember();
  if (appear && canAnimate()) kids().forEach((k, i) => enter(k, i));

  return () => {
    mo.disconnect();
    ro?.disconnect();
    delete container.dataset[MARK];
    if (setPosition) container.style.position = '';
    if (setIsolation) container.style.isolation = '';
  };
}

/** `ref={useMotion()}` on any container: see the top of this file. */
export function useMotion<T extends HTMLElement = HTMLElement>(options?: MotionOptions) {
  const cleanup = useRef<(() => void) | null>(null);
  const opts = useRef(options);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = el ? attachMotion(el, opts.current) : null;
  }, []);
}

/**
 * For containers rendered in a loop (one list per company card): `const motion = useMotionGroup();`
 * then `ref={motion(`${company.id}-sites`)}`. Each key gets its own stable ref.
 */
export function useMotionGroup<T extends HTMLElement = HTMLElement>(options?: MotionOptions) {
  const refs = useRef(new Map<string, (el: T | null) => void>());
  const opts = useRef(options);
  return useCallback((key: string) => {
    let ref = refs.current.get(key);
    if (!ref) {
      let cleanup: (() => void) | null = null;
      ref = (el: T | null) => {
        cleanup?.();
        cleanup = el ? attachMotion(el, opts.current) : null;
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);
}
