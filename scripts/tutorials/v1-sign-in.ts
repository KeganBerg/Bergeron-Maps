import { USERS, type Video } from './studio';

export const video: Video = {
  id: 'v1-sign-in',
  number: 1,
  title: 'Sign in and find your site',
  next: 'Build a lot in four answers',
  signedOut: true,
  start: '/',
  beats: [
    {
      say: 'In this video you’ll sign in to Bergeron Maps and open your site. It takes about two minutes, and there’s no password to set up.',
    },
    {
      say: 'Go to bergeron maps dot com and choose Sign in, at the top of the page.',
      caption: 'Go to bergeronmaps.com and choose Sign in, at the top of the page.',
      do: async (s) => {
        await s.pause(1800);
        await s.click(s.page.getByRole('link', { name: 'Sign in' }).first(), 1200);
        await s.page.getByTestId('signin-email').waitFor();
      },
    },
    {
      say: 'Type your work email, the one your account was set up with. Then choose Email me a sign-in link.',
      do: async (s) => {
        await s.type(s.page.getByTestId('signin-email'), USERS.owner.email, 110);
        await s.pause(1200);
        await s.click(s.page.getByTestId('signin-send'));
      },
    },
    {
      say: 'We send you an email with a sign-in link and a six-digit code. Open the link on this device, or type the code here. Both work for an hour.',
      do: async (s) => {
        await s.pause(3500);
        await s.type(s.page.getByTestId('signin-code'), '123456', 220);
      },
    },
    {
      say: 'Choose Sign in.',
      do: async (s) => {
        await s.click(s.page.getByTestId('signin-code-send'), 500);
      },
    },
    {
      say: 'You’re in. This is the Maps page. It lists every site in your company.',
      do: async (s) => {
        await s.page.getByText('Company sites').waitFor();
        await s.pause(800);
        await s.moveTo(s.page.getByText('Company sites'), 900);
      },
    },
    {
      say: 'Here’s our example site, Sample Garage. Each site has five slots for maps, and the line next to its name shows how many are used and published.',
      do: async (s) => {
        await s.moveTo(s.page.getByRole('heading', { name: 'Sample Garage' }), 900);
        await s.pause(3500);
        await s.moveTo(s.page.getByText('0 of 5 slots used').first(), 900);
      },
    },
    {
      say: 'If you manage just one site, you’ll see only that site here.',
    },
    {
      say: 'Sample Garage has no maps yet. Building the first one is the next video.',
      do: async (s) => {
        await s.moveTo(s.page.getByText('Add the first map').first(), 900);
      },
    },
    {
      say: 'You stay signed in on this device. If you’re ever signed out, just ask for a new link the same way.',
    },
  ],
};
