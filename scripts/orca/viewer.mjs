import { open, startOrca, mark, key, keys, finish, sleep } from './lib.mjs';
const page = await open();
await page.goto('http://localhost:5174/');
const { id } = await page.evaluate(async () => {
  const { createQuickLot } = await import('/src/model/quickLot.ts');
  const { repository } = await import('/src/storage/indexedDbRepository.ts');
  const doc = createQuickLot('North Garage', { floors: 3, rows: 4, spacesPerRow: 14, accessible: 2 });
  await repository.createMap(doc); await repository.publishMap(doc.id); return { id: doc.id };
});
await page.goto('about:blank');
await startOrca('viewer');
mark('page load');
await page.goto(`http://localhost:5174/#/view/${id}`); await sleep(4000);
mark('H x4 (headings)'); await keys(['h','h','h','h']);
mark('Down x25 (browse whole page from top)'); await key('ctrl+Home'); await keys(Array(25).fill('Down'), 500);
mark('Tab through controls from top x16'); await key('ctrl+Home'); await keys(Array(16).fill('Tab'), 700);
await finish('out/viewer.txt');
