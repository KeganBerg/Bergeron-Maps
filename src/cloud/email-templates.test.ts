import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The sign-in emails pasted into Supabase (docs/EMAIL.md). */
const files = ['magic-link.html', 'confirm-signup.html'];
const read = (f: string) => readFileSync(`supabase/email-templates/${f}`, 'utf8');

describe.each(files)('%s', (f) => {
  const html = read(f);
  it('links to the app with token_hash, so scanners cannot use the link up', () => {
    expect(html).toContain('href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email"');
    expect(html).not.toContain('{{ .ConfirmationURL }}');
  });
  it('includes the code for typing in', () => expect(html).toContain('{{ .Token }}'));
  it('uses the hosted PNG logo and wordmark (email apps block SVG) with alt text', () => {
    expect(html).toMatch(/<img src="https:\/\/bergeronmaps\.com\/img\/email\/lockup\.png"[^>]*alt="Bergeron Maps"/);
  });
  it('never types the wordmark or uses a monospace font', () => {
    expect(html).not.toContain('BERGERON MAPS');
    expect(html).not.toMatch(/monospace|Courier/i);
  });
  it('has no script, external CSS or web fonts', () => expect(html).not.toMatch(/<script|<link|@import|@font-face/i));
});
