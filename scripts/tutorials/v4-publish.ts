import { type Video, addGarage } from './studio';

export const video: Video = {
  id: 'v4-publish',
  number: 4,
  title: 'Publish and preview',
  next: 'Get your team on the map',
  // The map built in video 2, not yet published.
  setup: (server) => addGarage(server, false),
  beats: [
    {
      say: 'In this video you’ll check your map the way your team will see it, then publish it so they can use it.',
    },
    {
      say: 'Open your map from the Maps page.',
      do: async (s) => {
        await s.pause(800);
        await s.click(s.page.getByText('Main garage').first(), 1000);
        await s.page.getByTestId('canvas').waitFor();
      },
    },
    {
      say: 'Everything you do in the editor saves as a draft. Your team doesn’t see it until you publish. The Publish button shows where things stand.',
      do: async (s) => {
        await s.pause(2500);
        await s.moveTo(s.page.getByTestId('publish'), 1000);
      },
    },
    {
      say: 'First, choose Preview. This is exactly what your employees will see.',
      do: async (s) => {
        await s.click(s.page.getByTestId('preview'), 1000);
        await s.page.getByTestId('viewer-search').waitFor();
      },
    },
    {
      say: 'Try it the way they would. Search for a space, like 1 B 5, and the map shows where it is.',
      caption: 'Try it the way they would. Search for a space, like 1B5, and the map shows where it is.',
      do: async (s) => {
        await s.pause(1500);
        await s.type(s.page.getByTestId('viewer-search'), '1B5', 250);
        await s.pause(900);
        await s.click(s.page.locator('[data-testid="search-results"] li:first-child button'), 800);
      },
    },
    {
      say: 'Check the other floors with the tabs at the bottom.',
      do: async (s) => {
        await s.pause(500);
        await s.click(s.page.getByRole('button', { name: 'Floor 2' }).last(), 1000);
      },
    },
    {
      say: 'If something needs fixing, choose Back to editing.',
      do: async (s) => {
        await s.click(
          s.page
            .getByRole('button', { name: 'Back to editing' })
            .or(s.page.getByRole('link', { name: 'Back to editing' })),
          1000,
        );
        await s.page.getByTestId('canvas').waitFor();
      },
    },
    {
      say: 'When it looks right, choose Publish. Your team now sees this version.',
      do: async (s) => {
        await s.pause(1200);
        await s.click(s.page.getByTestId('publish'), 900);
        await s.page.locator('[data-testid="publish"][data-state="current"]').waitFor();
      },
    },
    {
      say: 'If you change the map later, the button says Publish changes. Your team keeps seeing the last published version until you publish again.',
      do: async (s) => {
        await s.pause(2000);
        // A small change: rename space 1A12 to "Visitor".
        await s.moveTo({ x: 933, y: 203 }, 900);
        await s.page.mouse.dblclick(933, 203);
        await s.pause(700);
        await s.type(s.page.getByLabel('Space number'), 'Visitor', 120);
        await s.page.keyboard.press('Enter');
        await s.page.keyboard.press('Escape');
        await s.pause(700);
        await s.moveTo(s.page.getByTestId('publish'), 900);
      },
    },
    {
      say: 'Choose Publish changes when you’re ready.',
      do: async (s) => {
        await s.click(s.page.getByTestId('publish'), 700);
        await s.page.locator('[data-testid="publish"][data-state="current"]').waitFor();
      },
    },
    {
      say: 'Back on the Maps page, the map shows as published.',
      do: async (s) => {
        await s.click(s.page.getByRole('button', { name: 'All maps' }), 900);
        await s.page.getByText('Company sites').waitFor();
        await s.pause(800);
        await s.moveTo(s.page.getByText('Published', { exact: true }).first(), 900);
      },
    },
    {
      say: 'Each site holds up to five maps, and two of them can be published at a time. For example, your everyday layout and an event layout.',
      do: async (s) => {
        await s.moveTo(s.page.getByText(/of 5 slots used/).first(), 1000);
      },
    },
  ],
};
