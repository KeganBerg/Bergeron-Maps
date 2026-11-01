# Bergeron Maps asset style standard

Every base asset in the library follows this standard. The code version lives in
`src/assets/style.ts` (palette and helpers) and `src/assets/draw.ts` (shared
recipes for zones, rooms, buildings, bays, signs, pins, vehicles, lanes and
pavement arrows). New assets should be built from those recipes so they match.

## The look

A simplified architectural site plan with recognizable real-world objects:
clean, cartoon-realistic, professional. Not childish, not flat generic icons,
not photorealistic.

- **Top-down first.** Spaces, roads, buildings, vehicles, trees, columns,
  booths and equipment are drawn from above so they place accurately and still
  read when rotated. Signs are the exception: they show their familiar face on
  a short post, the way site plans show them.
- **One outline weight.** Raised objects get a 1 to 1.5 px outline in ink
  (`#27313d`). Ground paint (spaces, lanes, zones, markings) has no outline
  unless it is a real painted line.
- **One shadow.** Raised objects (vehicles, booths, trees, equipment, signs)
  cast a single soft offset shadow (`rgba(16,24,40,0.16)`). Flat ground
  surfaces never do.
- **Real-world colors, used consistently.** Asphalt gray with white and yellow
  paint, concrete beige-gray, grass and foliage greens, standard sign colors
  (red stop and prohibition, yellow warning, green guide and exits, blue
  information and accessibility). The full palette is `P` in `style.ts`.
- **Places carry a badge.** Rooms, zones, bays and buildings show one white
  round badge with a line symbol and their name under it, so a "Finance office"
  and a "Parts department" are told apart at a glance.
- **Scale.** 5 map pixels = 1 foot. A standard stall is 45 × 90 (9 × 18 ft),
  a driving lane 60 wide, a two-lane road 120, a sedan 31 × 80.

## Behavior rules

- **Icons keep their proportions.** Fixed designs (vehicles, signs, booths,
  arrows) scale uniformly and center in their box; they never stretch.
- **Areas are drawn at their real size.** Roads, walls, zones, rooms and
  markings are generated for the object's actual width and height, so lane
  lines, hatching and joints stay evenly spaced at any length.
- **Text fits.** Space numbers shrink to fit the stall or break onto two lines
  ("F6" over "116"). Sign lettering is sized to the sign face.
- **Everything is restylable.** Each object with a fill has a fill color, a
  fill opacity (0 to 100%), a border color and a border thickness in pixels,
  where 0 hides the border. Line objects have a line color and thickness.
  "Reset" returns to the library defaults.
- **Legible in light and dark themes.** Space colors follow the theme unless
  the user picks their own.

## Adding an asset

1. Name the real-world object and look at real examples of it from above.
2. Pick the closest recipe in `draw.ts`, or draw it with the `P` palette,
   `FS(c)` for the restylable surface and the standard shadow.
3. Give it a real-world default size at 5 px per foot.
4. Add it to its category file in `src/assets/catalog/`.
5. Check it at default size, stretched, and at small zoom (the library test
   renders every asset both ways and fails on invalid SVG).
6. Compare it next to its neighbors in the library before merging.
