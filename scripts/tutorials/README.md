# Tutorial videos

The how-to videos are recordings of the real app, not mock-ups. Playwright drives the built app the way a
person would, signed in to a stand-in Supabase server (`e2e/online/mock-supabase.ts`) that holds only demo
data ("Company", "Sample Garage", "Sample Lot"). A narrator voice is laid over the recording, with captions
burned in and a title card at each end.

## Files

- `studio.ts`: opens a browser tab on bergeronmaps.com with the app behind it, the drawn pointer, and
  `shoot()`, which keeps each step on screen for as long as its narration lasts.
- `v1-sign-in.ts` to `v5-team.ts`: one video each, written as beats. A beat is what the narrator says
  (`say`), an optional caption when it should read differently (space "1A1" is said "1 A 1"), and what
  happens on screen meanwhile (`do`).
- `recorder.mjs`: records the page in real time (a screencast) and draws the pointer.
- `videos.ts`: the list of videos, in order.
- `record.rec.ts`: the Playwright test that records each video.
- `narration.ts`: writes `out/<id>/lines.json`, the lines to send to the voice service.
- `build.ts`: lays the voice and captions over the recording and adds the title and end cards.
- `make-sketch.py`: draws `assets/sample-lot-sketch.jpg`, the hand sketch traced in video 3.

Everything made goes in `out/`, which git ignores.

## Making the videos

1. Build the app as it is served on bergeronmaps.com/app/, pointed at the stand-in server:

   ```sh
   VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=mock-anon-key \
     npx vite build --config scripts/tutorials/vite.config.mjs --outDir scripts/tutorials/out/app --emptyOutDir
   ```

2. Write the narration lines: `npx vite-node scripts/tutorials/narration.ts`.
3. Make the voice for each line and save it as `out/<id>/voice/00.wav`, `01.wav`, and so on. The launch set
   used Higgsfield's `seed_audio` model with the "Holden" preset voice (about 36 credits for all five videos).
   Any text-to-speech that gives a WAV per line works.
4. Measure each line: `npx vite-node scripts/tutorials/build.ts --durations <id>`. Without this step a
   recording guesses about 2.6 words a second, which is fine for checking a flow.
5. Record: `npx playwright test -c scripts/tutorials -g "<id>" --trace off` (two to four minutes each).
6. Build: `npx vite-node scripts/tutorials/build.ts <id>`. The finished video, its captions (`.vtt`) and a
   thumbnail land in `out/final/`.

Changing what the narrator says means making that line's voice again and repeating steps 4 to 6. Changing
only what happens on screen needs steps 5 and 6.

## When the app changes

The videos find buttons by their words, so renaming a button breaks a recording loudly rather than quietly.
Video 3 places points on the sketch through the drawing library's own transform (`pictureToScreen`), so it
follows any change to zoom or layout.
