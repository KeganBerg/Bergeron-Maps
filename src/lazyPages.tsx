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

/*
 * Pages only Bergeron Maps admins (All accounts) and company managers (Sites &
 * people) open. Employees opening a map on a phone never download them.
 */
const Admin = lazy(() => import('./cloud/AdminPage').then((m) => ({ default: m.AdminPage })));
const Team = lazy(() => import('./cloud/TeamPage').then((m) => ({ default: m.TeamPage })));
const loadingPage = <div className="page-message"><p>Loading…</p></div>;

export function AdminPage(props: ComponentProps<typeof Admin>) {
  return <Suspense fallback={loadingPage}><Admin {...props} /></Suspense>;
}
export function TeamPage(props: ComponentProps<typeof Team>) {
  return <Suspense fallback={loadingPage}><Team {...props} /></Suspense>;
}
/** Starts downloading the admin and manager pages once someone who can open them is signed in. */
export const preloadAdmin = () => void import('./cloud/AdminPage');
export const preloadTeam = () => void import('./cloud/TeamPage');
