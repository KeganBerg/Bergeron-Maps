import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// Logs and results go in scripts/orca/out/, wherever the script is run from.
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
fs.mkdirSync('out', { recursive: true });
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const marks = [];
let orca, browser, log;
export async function open(viewport) {
  browser = await chromium.launch({ headless: false, args: ['--force-renderer-accessibility', '--window-position=0,0', '--window-size=1400,900', '--no-first-run'] });
  const ctx = await browser.newContext({ viewport: viewport ?? null });
  return await ctx.newPage();
}
export async function startOrca(name) {
  log = `out/orca-${name}.log`; try { fs.unlinkSync(log) } catch {}
  orca = spawn('/usr/bin/python3.12', ['/usr/bin/orca', '--replace', '--debug-file', log], { stdio: 'ignore', env: process.env });
  await sleep(6000);
  focusWin();
  await sleep(800);
}
export function focusWin() { try { execSync('xdotool search --onlyvisible --class "chrom" | tail -1 | xargs -I{} xdotool windowactivate --sync {} windowfocus {}', { stdio: 'ignore' }); } catch {} }
export function mark(label) { marks.push([Date.now(), label]); }
export async function key(k, wait = 900) { execSync(`xdotool key --clearmodifiers ${k}`); await sleep(wait); }
export async function keys(list, wait = 900) { for (const k of list) await key(k, wait); }
export async function type(s, wait = 1200) { execSync(`xdotool type --delay 80 ${JSON.stringify(s)}`); await sleep(wait); }
export async function finish(outFile) {
  await sleep(1500);
  orca.kill('SIGTERM'); await sleep(500); await browser.close();
  const raw = fs.readFileSync(log, 'utf8').replace(/\n(?!\d\d:\d\d:\d\d\.)/g, ' ').split('\n');
  const lines = raw.filter(l => /SPEECH OUTPUT: /.test(l)).map(l => {
    const m = l.match(/^(\d+):(\d+):(\d+\.\d+) - SPEECH OUTPUT: '(.*?)'( \{|\s*$)/); if (!m) return null;
    const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); return [d.getTime() + parseFloat(m[3]) * 1000, m[4]];
  }).filter(Boolean);
  let out = ''; let mi = -1;
  const all = [...marks.map(([t, l]) => [t, l, 'M']), ...lines.map(([t, s]) => [t, s, 'S'])].sort((a, b) => a[0] - b[0]);
  for (const [, s, k] of all) out += k === 'M' ? `\n### ${s}\n` : `  > ${s}\n`;
  fs.writeFileSync(outFile, out); console.log(out);
}
