import { type Video } from './studio';

// Screen points on the editor canvas (1280 x 720 window) for the lot this video builds:
// the same four answers always give the same layout, so these stay put.
const ROW_D = { x: 741, y: 552 };
const SPACE_D6 = { x: 741, y: 552 };

export const video: Video = {
  id: 'v2-build-a-lot',
  number: 2,
  title: 'Build a lot in four answers',
  next: 'Trace your sketch or site plan',
  beats: [
    {
      say: 'In this video you’ll build a parking map by entering four numbers. Then you’ll change it to match your site.',
    },
    {
      say: 'On the Maps page, find your site and choose Add the first map. If the site already has a map, use Add map instead.',
      do: async (s) => {
        await s.pause(2200);
        await s.click(s.page.getByText('Add the first map').first(), 1000);
        await s.page.getByTestId('map-name-input').waitFor();
      },
    },
    {
      say: 'Give the map a name your team will recognize, like Main garage.',
      do: async (s) => {
        await s.type(s.page.getByTestId('map-name-input'), 'Main garage', 110);
      },
    },
    {
      say: 'Build it for me is already selected. Now enter the four numbers.',
      do: async (s) => {
        await s.moveTo(s.page.getByTestId('mode-quick'), 900);
      },
    },
    {
      say: 'Floors. Use one for a surface lot. Our garage has two.',
      do: async (s) => {
        await s.pause(1200);
        await s.type(s.page.getByTestId('quick-floors'), '2', 200);
      },
    },
    {
      say: 'Rows per floor. Rows are lettered A, B, C, and so on. We have four.',
      do: async (s) => {
        await s.pause(1200);
        await s.type(s.page.getByTestId('quick-rows'), '4', 200);
      },
    },
    {
      say: 'Spaces per row. They’re numbered one, two, three. We have twelve.',
      do: async (s) => {
        await s.pause(1200);
        await s.type(s.page.getByTestId('quick-spacesPerRow'), '12', 200);
      },
    },
    {
      say: 'And accessible spaces. They go at the start of row A.',
      do: async (s) => {
        await s.pause(1000);
        await s.type(s.page.getByTestId('quick-accessible'), '4', 200);
      },
    },
    {
      say: 'The preview updates as you type. Lanes, the entrance, ramps and stairs are added for you. Check each floor with the tabs under the preview.',
      do: async (s) => {
        await s.moveTo(s.page.getByTestId('quick-preview'), 900);
        await s.pause(3500);
        await s.click(s.page.getByRole('dialog').getByRole('button', { name: 'Floor 2' }), 800);
        await s.pause(1800);
        await s.click(s.page.getByRole('dialog').getByRole('button', { name: 'Floor 1' }), 600);
      },
    },
    {
      say: 'The button says how many spaces you’ll get. Choose Create map.',
      do: async (s) => {
        await s.pause(1200);
        await s.click(s.page.getByTestId('create-map'), 900);
        await s.page.getByTestId('canvas').waitFor();
      },
    },
    {
      say: 'Here’s your map in the editor. Each space number starts with the floor, then the row letter, then the space. So this one is 1 A 1.',
      caption:
        'Here’s your map in the editor. Each space number starts with the floor, then the row letter, then the space. So this one is 1A1.',
      do: async (s) => {
        await s.pause(3200);
        await s.moveTo({ x: 581, y: 210 }, 1000);
      },
    },
    {
      say: 'Now change the map to match your site. Click a row, and its settings open on the left. If this row has ten spaces, change Spaces to ten.',
      do: async (s) => {
        await s.pause(1800);
        await s.click(ROW_D, 1000);
        await s.pause(2500);
        await s.type(s.page.getByLabel('Spaces', { exact: true }), '10', 300);
        await s.page.keyboard.press('Tab');
      },
    },
    {
      say: 'To change one space, double-click it. Here we make space 1 D 6 a reserved space.',
      caption: 'To change one space, double-click it. Here we make space 1D6 a reserved space.',
      do: async (s) => {
        await s.moveTo(SPACE_D6, 900);
        await s.page.mouse.dblclick(SPACE_D6.x, SPACE_D6.y);
        await s.pause(1800);
        await s.click(s.page.getByTestId('space-variant'), 800);
        await s.page.getByTestId('space-variant').selectOption({ label: 'Reserved' });
      },
    },
    {
      say: 'Switch floors with the tabs at the bottom.',
      do: async (s) => {
        await s.page.keyboard.press('Escape');
        await s.click(s.page.getByRole('button', { name: 'Floor 2' }).last(), 900);
      },
    },
    {
      say: 'Everything saves as you go. You’ll see Saved at the top. Your team won’t see any of this until you publish.',
      do: async (s) => {
        await s.pause(1500);
        await s.moveTo(s.page.getByText('Saved', { exact: true }), 1000);
      },
    },
  ],
};
