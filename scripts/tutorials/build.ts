// Puts each tutorial together: title card, the recorded screen with the narration laid at
// each step's start, burned-in captions, and a closing card. Also writes a .vtt caption file
// (for YouTube) and a thumbnail. Run after record.rec.ts:
//   npx vite-node scripts/tutorials/build.ts [video id ...]   (output: out/final/)
// With --durations it only measures the narration (out/<id>/durations.json), which
// record.rec.ts reads to keep each step on screen as long as its line lasts.
import { chromium, type Browser } from 'playwright';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Video } from './studio';
import { VIDEOS } from './videos';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(HERE, 'out');
const FINAL = process.env.FINAL || join(OUT, 'final');
const BRAND = join(HERE, '../../src/assets/brand');
const TOTAL = 5;
const CARD_SECONDS = 3.5;
const PACE = 1.08;
const FONT = 'Inter';

const run = (args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const seconds = (file: string) =>
  Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString(),
  );

interface Line {
  say: string;
  caption: string;
}
interface Cue {
  start: number;
  end: number;
  text: string;
}

/**
 * Each generated line, with the silence the voice service leaves at both ends cut off and a short fade
 * so it starts and stops cleanly. Left in, that silence plus the pause between steps made a dead gap
 * after every line that sounded like the audio had dropped out.
 */
function trimmedVoice(id: string, i: number) {
  const name = `${String(i).padStart(2, '0')}.wav`;
  const out = join(OUT, id, 'voice-trimmed', name);
  mkdirSync(dirname(out), { recursive: true });
  const trimEnd = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04';
  const fade = 'afade=t=in:d=0.03';
  // A little quicker than the voice service reads, but still easy to follow for people whose
  // first language isn't English (atempo keeps the pitch).
  const pace = `atempo=${PACE}`;
  run([
    '-i',
    join(OUT, id, 'voice', name),
    '-af',
    `${trimEnd},${fade},areverse,${trimEnd},${fade},areverse,${pace}`,
    out,
  ]);
  return out;
}

/** Measures the mixed voice's loudness (ffmpeg prints the report on stderr, after its log). */
function measure(voices: string[], delays: string[], mixed: string, target: string) {
  // The measuring run has no screen input, so each voice is one input earlier than in the real run.
  const shifted = delays.map((d) => d.replace(/^\[(\d+):a\]/, (_, n: string) => `[${Number(n) - 1}:a]`));
  const args = [
    ...voices.flatMap((v) => ['-i', v]),
    '-filter_complex',
    `${shifted.join(';')};${mixed},loudnorm=${target}:print_format=json`,
    '-f',
    'null',
    '-',
  ];
  const log = spawnSync('ffmpeg', ['-hide_banner', ...args]).stderr.toString();
  return log.slice(log.lastIndexOf('{'));
}

/** How long each line of narration lasts, written for record.rec.ts to time the screen to. */
function writeDurations(id: string) {
  const lines = JSON.parse(readFileSync(join(OUT, id, 'lines.json'), 'utf8')) as Line[];
  const durations = lines.map((_, i) => seconds(trimmedVoice(id, i)));
  writeFileSync(join(OUT, id, 'durations.json'), JSON.stringify(durations));
  return durations;
}

/** Splits a caption into pieces of at most two short lines, at sentence or clause breaks. */
function pieces(text: string, max = 84) {
  // A sentence ends at . ! or ? followed by a space, so "bergeronmaps.com" stays whole.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    if (s.length <= max) {
      out.push(s);
      continue;
    }
    let rest = s;
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max));
      out.push(rest.slice(0, rest[cut] === ',' ? cut + 1 : cut).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
  }
  // Join short neighbours so captions don't flash by.
  const joined: string[] = [];
  for (const p of out) {
    const last = joined[joined.length - 1];
    if (last && last.length + p.length + 1 <= max && last.length < 30) joined[joined.length - 1] = `${last} ${p}`;
    else joined.push(p);
  }
  return joined;
}

/** Caption cues: each line's text spread over its narration, in proportion to length. */
function cues(lines: Line[], starts: number[], durations: number[], offset: number) {
  const list: Cue[] = [];
  lines.forEach((l, i) => {
    const parts = pieces(l.caption);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let t = offset + starts[i];
    for (const p of parts) {
      const d = (durations[i] * p.length) / total;
      list.push({ start: t, end: t + d, text: p });
      t += d;
    }
  });
  return list;
}

const stamp = (t: number, sep: '.' | ',') => {
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  const [whole, frac] = s.toFixed(sep === '.' ? 3 : 2).split('.');
  return `${sep === '.' ? String(h).padStart(2, '0') : h}:${String(m).padStart(2, '0')}:${whole.padStart(2, '0')}.${frac}`;
};

function ass(list: Cue[]) {
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${FONT},44,&H00FFFFFF,&H00FFFFFF,&H40251B0B,&H40251B0B,0,0,0,0,100,100,0,0,3,14,0,2,240,240,56,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  return (
    head +
    list
      .map(
        (c) => `Dialogue: 0,${stamp(c.start, ',')},${stamp(c.end, ',')},Caption,,0,0,0,,${c.text.replace(/\n/g, ' ')}`,
      )
      .join('\n') +
    '\n'
  );
}

function vtt(list: Cue[]) {
  return (
    'WEBVTT\n\n' +
    list.map((c, i) => `${i + 1}\n${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')
  );
}

/** The title and closing cards, drawn as plain pages with the traced logo. */
async function cards(browser: Browser, video: Video) {
  const svg = (f: string) =>
    readFileSync(join(BRAND, f), 'utf8').replace('<svg ', '<svg style="color:#fff;height:100%;width:auto" ');
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const card = async (body: string, file: string) => {
    await page.setContent(`<!doctype html><html><head><style>
      body { margin: 0; width: 1920px; height: 1080px; background: #0b2545; color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; display: flex; }
      .wrap { margin: auto 0; padding: 0 180px; }
      .logo { display: flex; align-items: center; gap: 28px; height: 56px; margin-bottom: 96px; }
      .rule { width: 2px; height: 56px; background: rgba(255,255,255,.35); }
      .wm { height: 30px; }
      .small { font-size: 36px; font-weight: 400; color: rgba(255,255,255,.72); margin: 0 0 20px; }
      h1 { font-size: 96px; font-weight: 700; line-height: 1.1; margin: 0; max-width: 1500px; }
    </style></head><body><div class="wrap">
      <div class="logo">${svg('monogram.svg')}<span class="rule"></span><span class="wm">${svg('wordmark.svg')}</span></div>
      ${body}</div></body></html>`);
    await page.screenshot({ path: file });
  };
  const dir = join(OUT, video.id);
  await card(
    `<p class="small">How-to video ${video.number} of ${TOTAL}</p><h1>${video.title}</h1>`,
    join(dir, 'card-start.png'),
  );
  await card(
    video.next
      ? `<p class="small">Next video</p><h1>${video.next}</h1>`
      : `<p class="small">You’re all set</p><h1>Your map is built, published, and your team is on it.</h1>`,
    join(dir, 'card-end.png'),
  );
  await page.close();
}

async function build(browser: Browser, video: Video) {
  const dir = join(OUT, video.id);
  const lines = JSON.parse(readFileSync(join(dir, 'lines.json'), 'utf8')) as Line[];
  const starts = JSON.parse(readFileSync(join(dir, 'starts.json'), 'utf8'));
  const durations = JSON.parse(readFileSync(join(dir, 'durations.json'), 'utf8'));
  await cards(browser, video);

  // The screen with its captions and voice.
  writeFileSync(join(dir, 'captions.ass'), ass(cues(lines, starts, durations, 0)));
  const voices = lines.map((_, i) => join(dir, 'voice-trimmed', `${String(i).padStart(2, '0')}.wav`));
  const delays = voices.map(
    (_, i) =>
      `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(starts[i] * 1000)}:all=1[a${i}]`,
  );
  const mixed = `${voices.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voices.length}:normalize=0:dropout_transition=0`;
  // Loudness in two passes: measure, then apply one fixed gain. A single-pass loudnorm turns the
  // volume up during every pause and the next line comes in too loud, a pumping that sounds like buffering.
  const target = 'I=-16:TP=-1.5:LRA=11';
  const measured = JSON.parse(measure(voices, delays, mixed, target));
  const mix = `${mixed},loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true[voice]`;
  run([
    '-i',
    join(dir, 'screen.mp4'),
    ...voices.flatMap((v) => ['-i', v]),
    '-filter_complex',
    `[0:v]subtitles=${join(dir, 'captions.ass')}:fontsdir=/usr/share/fonts[v];${delays.join(';')};${mix}`,
    '-map',
    '[v]',
    '-map',
    '[voice]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-shortest',
    join(dir, 'main.mp4'),
  ]);

  // Cards before and after, faded in and out, with silence.
  const cardClip = (png: string, out: string) =>
    run([
      '-loop',
      '1',
      '-t',
      String(CARD_SECONDS),
      '-framerate',
      '30',
      '-i',
      png,
      '-f',
      'lavfi',
      '-t',
      String(CARD_SECONDS),
      '-i',
      'anullsrc=r=48000:cl=stereo',
      '-vf',
      `fade=in:st=0:d=0.4,fade=out:st=${CARD_SECONDS - 0.4}:d=0.4,format=yuv420p`,
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-shortest',
      out,
    ]);
  cardClip(join(dir, 'card-start.png'), join(dir, 'start.mp4'));
  cardClip(join(dir, 'card-end.png'), join(dir, 'end.mp4'));
  mkdirSync(FINAL, { recursive: true });
  const name = `${String(video.number).padStart(2, '0')}-${video.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, '')}`;
  run([
    '-i',
    join(dir, 'start.mp4'),
    '-i',
    join(dir, 'main.mp4'),
    '-i',
    join(dir, 'end.mp4'),
    '-filter_complex',
    '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]',
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    join(FINAL, `${name}.mp4`),
  ]);
  writeFileSync(join(FINAL, `${name}.vtt`), vtt(cues(lines, starts, durations, CARD_SECONDS)));
  execFileSync('cp', [join(dir, 'card-start.png'), join(FINAL, `${name}-thumbnail.png`)]);
  console.log(name, seconds(join(FINAL, `${name}.mp4`)).toFixed(1), 's');
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const chosen = VIDEOS.filter((v) => !only.length || only.includes(v.id));
if (process.argv.includes('--durations')) {
  for (const v of chosen)
    console.log(
      v.id,
      writeDurations(v.id)
        .map((d) => d.toFixed(1))
        .join(' '),
    );
} else {
  const browser = await chromium.launch();
  for (const v of chosen) await build(browser, v);
  await browser.close();
}
