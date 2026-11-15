import { lazy, Suspense, type ComponentProps } from 'react';

/**
 * Pages most visitors never open load on first use, so the map viewer (what
 * employees and public links open, often on a phone) downloads less code.
 * While a page's code arrives, the same placeholder the page itself shows
 * while it loads is on screen, so nothing looks different.
 */
const Editor = lazy(() => import('./editor/EditorPage').then((m) => ({ default: m.EditorPage })));

export function EditorPage(props: ComponentProps<typeof Editor>) {
  return (
    <Suspense fallback={<div className="page-message"><p>Opening map…</p></div>}>
      <Editor {...props} />
    </Suspense>
  );
}

/** Starts downloading the editor ahead of time (when someone is likely to open it next). */
export const preloadEditor = () => void import('./editor/EditorPage');
