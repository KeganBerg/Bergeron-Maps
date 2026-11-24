// The app as the tutorials show it: built for /app/ (as on bergeronmaps.com) and pointed at
// the stand-in Supabase server. Build it with the command in README.md here.
import { mergeConfig } from 'vite';
import base from '../../vite.config';

export default mergeConfig(base, {
  root: new URL('../..', import.meta.url).pathname,
  base: '/app/',
});
