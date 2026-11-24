// Lists every line the narrator says, one file per video, for making the voice:
//   npx vite-node scripts/tutorials/narration.ts   (writes out/<id>/lines.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT } from './studio';
import { VIDEOS } from './videos';

for (const v of VIDEOS) {
  mkdirSync(join(OUT, v.id), { recursive: true });
  writeFileSync(
    join(OUT, v.id, 'lines.json'),
    JSON.stringify(
      v.beats.map((b) => ({ say: b.say, caption: b.caption ?? b.say })),
      null,
      2,
    ),
  );
  console.log(
    v.id,
    v.beats.length,
    'lines',
    v.beats.reduce((n, b) => n + b.say.length, 0),
    'characters',
  );
}
