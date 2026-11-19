import { open, startOrca, mark, key, keys, type, finish, sleep } from './lib.mjs';
import { seed } from './seed.mjs';
const page = await open();
const id = await seed(page);
await page.goto(`http://localhost:5174/#/view/${id}`); await sleep(2500);
await startOrca('search');
try {
mark('Tab x4 to search box'); await keys(['Tab','Tab','Tab','Tab']);
mark('type "zzz"'); await type('zzz', 2500);
mark('clear, type "1"'); await key('ctrl+a', 300); await key('BackSpace', 800); await type('1', 2500);
mark('Down, Enter (pick)'); await key('Down', 1000); await key('Return', 2500);
mark('type in search while card open: shift+Tab back to search? use CDP focus+type "2B"');
await page.getByTestId('viewer-search').focus(); await sleep(1200); await page.getByTestId('viewer-search').fill(''); await page.keyboard.type('2B', { delay: 120 }); await sleep(2500);
mark('Escape, Escape'); await key('Escape', 1500); 
mark('pick a result then Close button'); await page.getByTestId('viewer-search').fill('2B5'); await page.keyboard.press('Enter'); await sleep(2500);
await page.getByRole('button', { name: 'Close', exact: true }).focus(); await sleep(1200); await key('Return', 2000);
mark('Directions route with floors: 2B5 from Entrance, then route step for Floor 2');
await page.getByTestId('viewer-search').fill('2B5'); await page.keyboard.press('Enter'); await sleep(2000);
await page.getByTestId('directions').focus(); await key('Return', 2000);
await page.getByTestId('dir-start').first().focus(); await key('Return', 3000);
await page.getByTestId('route-step').nth(0).focus(); await sleep(1500);
await page.getByTestId('route-step').nth(2).focus(); await sleep(1500); await key('Return', 2500);
} catch (e) { mark('ERROR ' + e.message.split('\n')[0]); }
await finish('out/search.txt');
