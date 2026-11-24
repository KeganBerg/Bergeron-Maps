// Records each video's screen (out/<id>/screen.mp4), timed to its narration if the voice exists.
//   npx playwright test -c scripts/tutorials [video id]
import { test } from '@playwright/test';
import { ORIGIN, USERS, openStudio, shoot } from './studio';
import { VIDEOS } from './videos';

for (const video of VIDEOS) {
  test(video.id, async ({ browser }) => {
    const { page, studio, ctx, server } = await openStudio(browser, video.signedOut ? {} : { as: USERS.owner });
    video.setup?.(server);
    await page.goto(ORIGIN + (video.start ?? '/app/'));
    if (video.signedOut) await page.waitForLoadState('networkidle');
    else await page.getByText('Company sites').waitFor();
    await shoot(video, studio);
    await ctx.close();
  });
}
