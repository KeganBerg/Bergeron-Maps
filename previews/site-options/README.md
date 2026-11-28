# Website design options (for review)

Six directions in two rounds for the bergeronmaps.com home page, built so Kegan can pick one.
They are not part of the live site: nothing in `site/` uses them, and the deploy never ships this folder.

| Option | Idea |
| --- | --- |
| A, The map is the page | The first screen is the sample map, full width. The page searches by itself and the camera flies to each result, with the walking route. Visitors can type or click. |
| B, Level colors | The page is signed like a garage. The hero fills with the found floor's colour, a level sign shows the space, and the app's side view moves an elevator to that floor. Each section below is a "level" with an elevator panel on the side. |
| C, Sketch to map | A pad of graph paper. The site is drawn in pencil, then a handle sweeps across and the real map takes over. Visitors drag the handle to compare. |
| D, Floor stack | Round 2. The four floors float as a 3D stack of real 2D maps. A search pulls one level out, the camera comes down flat onto it and the route draws. |
| E, Symbol storm | Round 2. The app's symbol library fills the screen, pours into the map's frame, and the site builds itself: roads, rows of spaces, then landmarks. |
| F, Through the letters | Round 2. "Find it." in giant letters shows a drifting map through them, then the camera flies through the i and the map fills the screen. |

Every map and drawing comes from the app's own code (the same drawings `scripts/site-demo.ts` puts on the live home page), so nothing shows what the app can't do.

Edit the pages in `src/`, then build them:

```
npx vite-node scripts/site-options.ts
```

The built pages (`option-a.html` and so on) are self-contained, so they open straight from disk.
