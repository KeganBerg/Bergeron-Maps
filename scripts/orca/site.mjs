import { open, startOrca, mark, key, keys, finish, sleep } from './lib.mjs';
const page = await open();
await page.route(/formsubmit\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: 'true' }) }));
await page.goto('about:blank');
await startOrca('site');
try {
mark('load home'); await page.goto('http://localhost:8099/'); await sleep(5000);
mark('H x2'); await key('ctrl+Home', 600); await keys(['h','h'], 900);
mark('hero search: type "EV" and Enter (CDP)'); await page.locator('#hp-q').focus(); await page.locator('#hp-q').fill(''); await sleep(1000); await page.keyboard.type('EV', { delay: 100 }); await sleep(1500); await page.keyboard.press('Enter'); await sleep(2500);

mark('product demo: pick tab 2 with keyboard');
await page.evaluate(() => document.querySelectorAll('[role=tab]')[1]?.focus()); await sleep(1200); await key('Return', 2500);
mark('contact form send'); await page.evaluate(() => document.querySelector('#contact-form')?.scrollIntoView()); await sleep(600);
await page.evaluate(() => { const f = document.querySelector('#contact-form'); for (const el of f.querySelectorAll('input, textarea, select')) { if (el.type==='email') el.value='a@example.com'; else if (el.tagName==='SELECT') el.selectedIndex=1; else if (el.type!=='checkbox' && el.type!=='hidden') el.value='Test value'; el.dispatchEvent(new Event('input',{bubbles:true})); } f.querySelector('button[type=submit], button').focus(); }); await sleep(1500);
await key('Return', 4000);
mark('dealership calculator: change hours field'); await page.goto('http://localhost:8099/industries/dealerships/'); await sleep(4000);
await page.locator('input[name=n]').focus(); await sleep(1000); await page.locator('input[name=n]').fill('100'); await sleep(2500); await page.keyboard.type('0'); await sleep(2500);
} catch (e) { mark('ERROR ' + e.message.split('\n')[0]); }
await finish('out/site.txt');
