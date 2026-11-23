import { writeFileSync, mkdirSync } from 'node:fs';
import { buildSite, count, type SiteName } from './sites';
import { serializeMapFile, parseMapFile } from '../../src/storage/mapFile';
import { findRoute, startPlaces } from '../../src/model/route';
import { searchMap } from '../../src/model/search';
import { migrateDocument } from '../../src/model/migrate';

const out = process.argv[2] ?? 'loadtest-out';
mkdirSync(out, { recursive: true });
const t = <T>(f: () => T): [T, number] => { const a = performance.now(); const r = f(); return [r, Math.round(performance.now() - a)]; };
for (const name of ['tower', 'sprawl', 'campus'] as SiteName[]) {
  const [doc, build] = t(() => buildSite(name));
  const [text, ser] = t(() => serializeMapFile(doc));
  writeFileSync(`${out}/${name}.bmap.json`, text);
  const [, parse] = t(() => parseMapFile(text));
  const [, mig] = t(() => migrateDocument(JSON.parse(JSON.stringify(doc))));
  const [, search] = t(() => searchMap(doc, '2B14'));
  const starts = startPlaces(doc);
  const top = doc.floors[doc.floors.length - 1];
  const far = [...top.objects].filter((o) => o.kind === 'space').pop()!;
  const from = starts[0];
  const place = (floorId: string, o: { id: string; x: number; y: number }) => ({ floorId, objectId: o.id, x: o.x, y: o.y });
  let route: unknown, routeMs = -1, route2 = -1;
  try {
    [route, routeMs] = t(() => findRoute(doc, place(from.floor.id, from.obj) as never, place(top.id, far) as never));
    [, route2] = t(() => findRoute(doc, place(from.floor.id, from.obj) as never, place(top.id, far) as never, { avoidStairs: true } as never));
  } catch (e) { route = String(e); }
  console.log(JSON.stringify({ name, ...count(doc), mb: +(text.length / 1048576).toFixed(2), build, ser, parse, mig, search,
    routeMs, routeAvoidStairs: route2, routeOk: (route as { ok?: boolean })?.ok ?? route }));
}
