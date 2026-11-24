import { USERS, type Video, addGarage } from './studio';

export const video: Video = {
  id: 'v5-team',
  number: 5,
  title: 'Get your team on the map',
  // The map from the earlier videos, published.
  setup: (server) => addGarage(server, true),
  beats: [
    {
      say: 'In this video you’ll get your team onto the map. Employees join with a site code. Managers get access by email.',
    },
    {
      say: 'Open Sites and people.',
      caption: 'Open Sites & people.',
      do: async (s) => {
        await s.pause(500);
        await s.click(
          s.page
            .getByRole('link', { name: 'Sites & people' })
            .or(s.page.getByRole('button', { name: 'Sites & people' })),
          1000,
        );
        await s.page.getByText('Give someone access').waitFor();
      },
    },
    {
      say: 'Every site has a six-character code, like this one for Sample Garage. Give it to your employees. They sign in, type the code, and they can view that site’s published maps. They can’t change anything.',
      do: async (s) => {
        await s.pause(1500);
        await s.moveTo(s.page.locator('.code-chip').first(), 1000);
      },
    },
    {
      say: 'If a code gets passed around too widely, choose New code. The old one stops working, and people who already joined keep their access.',
      do: async (s) => {
        await s.pause(1500);
        await s.moveTo(s.page.getByRole('button', { name: 'New code' }).first(), 900);
      },
    },
    {
      say: 'For managers, use Give someone access. Type their work email.',
      do: async (s) => {
        await s.type(s.page.getByPlaceholder('name@company.com'), 'night.manager@company.com', 70);
      },
    },
    {
      say: 'Pick their access. A site manager can edit and publish maps at their own site. A regional manager covers every site. An employee can only view.',
      do: async (s) => {
        await s.moveTo(s.page.getByRole('combobox').first(), 900);
        await s.pause(1500);
        await s.page.getByRole('combobox').first().selectOption({ label: 'Site manager' });
      },
    },
    {
      say: 'Pick the site, and choose Give access.',
      do: async (s) => {
        await s.moveTo(s.page.getByRole('combobox').nth(1), 800);
        await s.page.getByRole('combobox').nth(1).selectOption({ label: 'Sample Garage' });
        await s.pause(700);
        await s.click(s.page.getByRole('button', { name: 'Give access' }), 800);
      },
    },
    {
      say: 'The app doesn’t email them for you. Choose Copy invite message and send it yourself. It has the link and tells them how to sign in.',
      do: async (s) => {
        await s.pause(1000);
        await s.click(s.page.getByTestId('copy-invite'), 900);
      },
    },
    {
      say: 'Everyone with access is listed under People. If someone leaves, choose Remove. They lose access right away.',
      do: async (s) => {
        const people = s.page.getByRole('heading', { name: 'People', exact: true });
        await people.scrollIntoViewIfNeeded();
        await s.moveTo(people, 900);
        await s.pause(1800);
        await s.moveTo(s.page.getByRole('button', { name: 'Remove' }).first(), 900);
      },
    },
    {
      say: 'Here’s what joining looks like for a new employee. After they sign in, they type the code under Join a site, and choose Join site.',
      do: async (s) => {
        // Become the new employee: sign out, then sign in with their email.
        await s.click(s.page.getByTestId('account-menu'), 900);
        await s.click(s.page.getByTestId('sign-out'), 700);
        await s.page.getByTestId('signin-email').waitFor();
        await s.page.getByTestId('signin-email').fill(USERS.newcomer.email);
        await s.page.getByTestId('signin-send').click();
        await s.page.getByTestId('signin-code').fill('123456');
        await s.page.getByTestId('signin-code-send').click();
        await s.page.getByTestId('join-code').waitFor();
        await s.pause(2500);
        await s.type(s.page.getByTestId('join-code'), 'K7M2QX', 220);
        await s.pause(600);
        await s.click(s.page.getByRole('button', { name: 'Join site' }), 800);
      },
    },
    {
      say: 'Sample Garage now shows up with its published map. They open it, search for a space, and get directions.',
      do: async (s) => {
        await s.page.getByTestId('view-Main garage').waitFor();
        await s.pause(1500);
        await s.click(s.page.getByTestId('view-Main garage'), 900);
        await s.page.getByTestId('viewer-search').waitFor();
        await s.pause(800);
        await s.type(s.page.getByTestId('viewer-search'), '1B5', 200);
        await s.pause(500);
        await s.click(s.page.locator('[data-testid="search-results"] li:first-child button'), 700);
        await s.pause(900);
        await s.click(s.page.getByTestId('directions'), 800);
        await s.pause(700);
        await s.click(s.page.getByTestId('dir-start').first(), 800);
      },
    },
    {
      say: 'That’s it. Your map is built, published, and your team is on it.',
    },
  ],
};
