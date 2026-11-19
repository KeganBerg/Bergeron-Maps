/* Error-tracking addresses. No browser code here: the build config reads it too. */

/** Where a Sentry DSN (https://<key>@<host>/<project>) takes reports. */
export function sentryTarget(dsn: string): string | null {
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!u.username || !project) return null;
    return `${u.protocol}//${u.host}/api/${project}/envelope/?sentry_version=7&sentry_key=${u.username}`;
  } catch {
    return null;
  }
}

/** The error-tracking host, for the page's content security policy. */
export function sentryOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}
