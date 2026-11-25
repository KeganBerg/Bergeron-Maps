import { fileURLToPath } from 'node:url';
import { curveHandles, pictureToScreen, type Studio, type Video } from './studio';

/** Whether the curved piece's end 0 went to the top end of the sketched lane. */
let flipped = false;

const SKETCH = fileURLToPath(new URL('assets/sample-lot-sketch.jpg', import.meta.url));

/** Draws a row along a sketched row: from its front-left corner to its front-right corner (sketch pixels). */
async function drawRow(s: Studio, from: [number, number], to: [number, number], prefix: string) {
  await s.click(s.page.getByText('Draw a row of spaces'), 800);
  await s.pause(500);
  await s.drag(await pictureToScreen(s.page, from), await pictureToScreen(s.page, to), 1600);
  await s.page.getByTestId('row-count').waitFor();
  await s.pause(700);
  await s.type(s.page.getByTestId('row-prefix'), prefix, 150);
  await s.pause(500);
  await s.click(s.page.getByTestId('create-row'), 800);
}

export const video: Video = {
  id: 'v3-trace-sketch',
  number: 3,
  title: 'Trace your sketch or site plan',
  next: 'Publish and preview',
  beats: [
    {
      cue: 'The title card has just faded to the Maps page. Nothing moves yet.',
      say: 'In this video you’ll put a picture of your site under your map. It can be a hand sketch, a site plan, or an aerial photo. Then you’ll trace over it.',
    },
    {
      cue: 'The pointer goes to Add the first map under Sample Lot.',
      say: 'Start a new map at your site. This time pick Start blank, then Create blank map.',
      do: async (s) => {
        await s.pause(1500);
        await s.click(s.page.getByText('Add the first map').nth(1), 1000);
        await s.type(s.page.getByTestId('map-name-input'), 'Front lot', 100);
        await s.click(s.page.getByTestId('mode-blank'), 800);
        await s.pause(700);
        await s.click(s.page.getByTestId('create-map'), 800);
        await s.page.getByTestId('canvas').waitFor();
      },
    },
    {
      cue: 'The empty editor is open. The pointer goes to the Layers tab.',
      say: 'Open the Layers tab and choose Upload site plan or aerial photo. A phone photo of a paper sketch works fine.',
      do: async (s) => {
        await s.click(s.page.getByText('Layers', { exact: true }).first(), 900);
        await s.pause(1500);
        const upload = s.page.getByText('Upload site plan or aerial photo');
        await s.moveTo(upload, 800);
        await s.pause(400);
        const [chooser] = await Promise.all([s.page.waitForEvent('filechooser'), upload.click()]);
        await s.pause(1200);
        await chooser.setFiles(SKETCH);
      },
    },
    {
      cue: 'The sketch has just appeared. The pointer goes to the Fit button.',
      say: 'The picture goes on its own layer and is locked, so it won’t move while you draw. Choose Fit to see all of it.',
      do: async (s) => {
        await s.pause(3000);
        await s.click(s.page.getByTestId('fit'), 1000);
      },
    },
    {
      cue: 'The pointer goes to the Opacity slider and drags it.',
      say: 'If the picture is hard to draw over, make it lighter with the Opacity slider.',
      do: async (s) => {
        const slider = s.page.getByLabel('Opacity');
        const box = (await slider.boundingBox())!;
        await s.drag(
          { x: box.x + box.width * 0.55, y: box.y + box.height / 2 },
          { x: box.x + box.width * 0.3, y: box.y + box.height / 2 },
          900,
        );
      },
    },
    {
      cue: 'The pointer goes to the Add tab, then Draw a row of spaces.',
      say: 'Now go back to Add and choose Draw a row of spaces. Drag along the front of a row in your sketch. The app counts how many spaces fit.',
      do: async (s) => {
        await s.click(s.page.getByText('Add', { exact: true }).first(), 900);
        await s.pause(800);
        await s.click(s.page.getByText('Draw a row of spaces'), 800);
        await s.pause(1500);
        await s.drag(await pictureToScreen(s.page, [260, 140]), await pictureToScreen(s.page, [890, 140]), 1800);
        await s.page.getByTestId('row-count').waitFor();
      },
    },
    {
      cue: 'The Add a row box is open. The pointer moves to the number of spaces.',
      say: 'Check the number of spaces. Then type the row letter in Prefix, and choose Create.',
      do: async (s) => {
        await s.pause(1000);
        await s.moveTo(s.page.getByTestId('row-count'), 700);
        await s.pause(900);
        await s.type(s.page.getByTestId('row-prefix'), 'A', 250);
        await s.pause(1500);
        await s.click(s.page.getByTestId('create-row'), 800);
      },
    },
    {
      cue: 'The box has closed and row A is on the map. The pointer goes back to Draw a row of spaces.',
      say: 'Do the same for the next row. Drag along the front of the row, type its letter, and choose Create.',
      do: async (s) => {
        await drawRow(s, [260, 380], [890, 380], 'B');
      },
    },
    {
      cue: 'Row B is on the map. The pointer goes back to Draw a row of spaces.',
      say: 'Rows can also be at an angle. Drag along the angled row, and the row turns to match.',
      do: async (s) => {
        await drawRow(s, [1000, 560], [1234, 425], 'C');
      },
    },
    {
      cue: 'Row C is on the map. The word curved starts typing in the search box.',
      say: 'For a curved lane, search the library for curved, and add a curved driving lane.',
      do: async (s) => {
        await s.type(s.page.getByPlaceholder(/Search .* objects/), 'curved', 120);
        await s.pause(900);
        await s.click(s.page.getByTestId('asset-curved-lane'), 900);
      },
    },
    {
      cue: 'The curved lane has just been added. The pointer moves to its first end.',
      say: 'Now drag each end of the curved lane to the ends of the lane in your sketch. You can move them again at any time.',
      do: async (s) => {
        await s.pause(800);
        // Take whichever end of the new piece is nearer each end of the sketched lane.
        const a = await pictureToScreen(s.page, [175, 900]);
        const b = await pictureToScreen(s.page, [420, 655]);
        let h = await curveHandles(s.page);
        const flip = Math.hypot(h[0].x - a.x, h[0].y - a.y) > Math.hypot(h[3].x - a.x, h[3].y - a.y);
        await s.drag(flip ? h[3] : h[0], a, 1300);
        await s.pause(500);
        h = await curveHandles(s.page);
        await s.drag(flip ? h[0] : h[3], b, 1300);
        flipped = flip;
      },
    },
    {
      cue: 'Both ends are placed. The pointer moves to the first bend handle.',
      say: 'Then drag the two bend handles until the curve follows the lane in your sketch. The map updates as you drag.',
      do: async (s) => {
        await s.pause(600);
        let h = await curveHandles(s.page);
        await s.drag(flipped ? h[2] : h[1], await pictureToScreen(s.page, [175, 765]), 1100);
        await s.pause(400);
        h = await curveHandles(s.page);
        await s.drag(flipped ? h[1] : h[2], await pictureToScreen(s.page, [285, 655]), 1100);
      },
    },
    {
      cue: 'The curve is in place. The pointer goes to the Layers tab. Last line.',
      say: 'When you’re done, hide the picture from the Layers tab to see your map on its own. Everything you traced stays.',
      do: async (s) => {
        await s.click({ x: 1150, y: 640 }, 700);
        await s.click(s.page.getByText('Layers', { exact: true }).first(), 900);
        await s.pause(1000);
        await s.click(s.page.locator('.bg-section').getByRole('button', { name: 'Hide' }), 900);
        await s.pause(600);
        await s.page.keyboard.press('Escape');
      },
    },
  ],
};
