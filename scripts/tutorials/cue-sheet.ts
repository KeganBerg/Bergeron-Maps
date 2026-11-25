// Writes a recording script for a person to voice the videos themselves: for each line, the time
// in the finished video to start speaking, what is on screen at that moment, how long the line
// has, and the words. Also writes each video without its voice (out/final/NN-slug-silent.mp4), to
// play while recording: the captions show the words at the right moment, like a prompter.
//   npx vite-node scripts/tutorials/cue-sheet.ts
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEOS } from './videos';

const OUT = join(fileURLToPath(new URL('.', import.meta.url)), 'out');
const CARD_SECONDS = 3.5;
const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

const parts: string[] = [];
for (const video of VIDEOS) {
  const dir = join(OUT, video.id);
  const starts = JSON.parse(readFileSync(join(dir, 'starts.json'), 'utf8')) as number[];
  const durations = JSON.parse(readFileSync(join(dir, 'durations.json'), 'utf8')) as number[];
  const name = `${String(video.number).padStart(2, '0')}-${video.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, '')}`;
  const final = join(OUT, 'final', `${name}.mp4`);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    final,
    '-an',
    '-c:v',
    'copy',
    join(OUT, 'final', `${name}-silent.mp4`),
  ]);
  parts.push(`## Video ${video.number}: ${video.title}\n`);
  video.beats.forEach((beat, i) => {
    const at = starts[i] + CARD_SECONDS;
    const room = (starts[i + 1] ?? starts[i] + durations[i] + 0.9) - starts[i];
    parts.push(
      `**Line ${i + 1}, at ${clock(at)}** (about ${durations[i].toFixed(0)} s to say it, ${room.toFixed(0)} s before the next line)\n\n` +
        `When: ${beat.cue ?? 'As the caption appears.'}\n\n` +
        `Say: "${beat.caption ?? beat.say}"\n`,
    );
  });
}
writeFileSync(join(OUT, 'final', 'recording-script.md'), parts.join('\n'));
console.log('wrote recording-script.md and the silent videos');
