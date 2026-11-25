import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Bergeron Maps University (site/university/, written by scripts/site-university.mjs).
 * Checks the generated pages against the video files, so a video can't be listed without its
 * files, or copied in without a page, and the purchase page keeps telling buyers it's included.
 */
const DIR = join('site', 'university');
const lessons = readdirSync(DIR).filter((n) => n !== 'videos' && statSync(join(DIR, n)).isDirectory());
const hub = readFileSync(join(DIR, 'index.html'), 'utf8');

describe('Bergeron Maps University', () => {
  it('has the getting-started videos', () => {
    expect(lessons.length).toBeGreaterThanOrEqual(5);
  });

  it.each(lessons)('%s has its video, captions, thumbnail and a card on the hub', (slug) => {
    for (const ext of ['mp4', 'vtt', 'png']) expect(existsSync(join(DIR, 'videos', `${slug}.${ext}`)), ext).toBe(true);
    expect(hub).toContain(`href="${slug}/"`);
    const html = readFileSync(join(DIR, slug, 'index.html'), 'utf8');
    expect(html).toContain(`src="../videos/${slug}.mp4"`);
    // The words of the video are on the page, read from its captions.
    const firstLine = readFileSync(join(DIR, 'videos', `${slug}.vtt`), 'utf8').split('\n').find((l) => /[a-z]{3}/i.test(l) && !l.startsWith('WEBVTT'));
    expect(html).toContain(firstLine!.trim().replace(/&/g, '&amp;'));
  });

  it('every video file belongs to a page', () => {
    const slugs = new Set(readdirSync(join(DIR, 'videos')).map((f) => f.replace(/\.(mp4|vtt|png)$/, '')));
    expect([...slugs].sort()).toEqual([...lessons].sort());
  });

  it('the video pages allow video in their security policy', () => {
    for (const slug of lessons) expect(readFileSync(join(DIR, slug, 'index.html'), 'utf8')).toContain("media-src 'self'");
  });

  it('the purchase page says every location includes it, and links to it', () => {
    const buy = readFileSync(join('site', 'get-your-map', 'index.html'), 'utf8');
    expect(buy).toContain('Bergeron Maps University, included');
    expect(buy).toContain('href="/university/"');
  });
});
