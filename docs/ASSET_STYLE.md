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

## Shapes: curves, bevels, cut-outs and merging

Ground surfaces, zones, roads, buildings (anything on the Structure layer with a fill) and parking spaces can be reshaped per object in the **Shape** section of the properties panel. The geometry lives in `src/model/shape.ts` and is drawn the same way in the editor, the viewer and previews.

- **Corners**: one curvature value in map pixels (slider and number), rounded or beveled. It is capped at half the piece's thickness so a piece never disappears.
- **Curved pieces**: an asset can declare an `outline` (`ellipse`, `half`, `quarter`, `arc` for a curved band, `L` for a corner piece) and a default `band` thickness. The drawing is clipped to that outline, and the border is drawn along it.
- **Cut-outs**: the free-draw and grid cut tools in the top bar subtract a shape from the selected object, or from every shapeable object under the cut when nothing is selected. Cuts are stored as fractions of the object's size, so they stretch with it.
- **Merging**: overlapping or nearby copies of the same ground, planting or walkway asset (hedges, landscaping and flower beds, rock beds, gravel, dirt, sidewalks and walkways), and any grass pieces together, are drawn as one shape with one outline. Zones and drains never merge. Overlapping pieces join with exact, sharp corners. Straight edges within 2.5 px of each other are lined up first so hand placement leaves no notches, and wedges or slits narrower than 6 px are filled. Pieces closer than the **Blend** distance (16 px by default) get a smooth bridge, which is rounded only in the gap. Textures (grass, gravel, dirt and rock dots, flowers) are anchored to the map, so they run on unbroken across pieces. Shrubs in landscaping beds are drawn per piece above the shared fill, and other assets draw their own detail with the border left off. A piece on its own keeps its normal drawing, and any piece can opt out with "Merge with nearby pieces".
- **Roads**: driving surfaces (straight and curved roads and lanes, one-way, two-way, entrance, exit, turning, service and drive-through lanes) merge with each other into one road. The asphalt is drawn once and the white edge lines follow the outside of the whole road, turning every corner of a junction, with no line across an open road end. Each piece's own paint (centre lines, arrows, words) stops where a crossing piece joins, so centre lines don't run through an intersection. Pieces in line end to end keep their paint, and where they overlap only the first one paints. Roads blend at 6 px by default, so roads near each other stay apart. A road end that stops just short of another road (or of the outside of a bend) is stretched to meet it. Where three or more arms meet (a T, a crossroads, or a road meeting a bend), the junction gets no paint inside and a white stop bar across each arm, and in-line pieces placed a few pixels off have their centre lines lined up so they continue straight across. A road carrying on, turning a corner or narrowing into a lane is not a junction.
- **Hedges**: merged hedges are drawn from the same shrub clumps as a single hedge, with one outline around all of them and the same leaf shading, so they still read as a row of bushes. Curved pieces have a curved-band outline, and their road width follows the Width setting.

## Building interiors and office assets

Buildings and rooms (anything with `enterable: true`, see `canHaveInterior`) can hold their own floor plan. The plan is stored as extra floors in the same map, each marked `interiorOf: <building object id>` (`src/model/interiors.ts`), so it is saved, versioned, published and counted in the site's map slots with its parent map. Interiors are one level deep: only buildings on site floors can be entered.

- **Editor**: select a building and press **Build the inside** (or **Open floor plan**), or double-click a building that already has one. The floor bar then shows the building's own floors and a back button. A new plan starts with **Outer walls** in the building's shape. Deleting a building deletes its plan (undo restores both); duplicating a site floor copies its buildings' plans.
- **Viewer**: buildings with a plan show a small door mark in their corner. Tap one and press **Go inside**; **Outside** returns to the same view. Search covers interiors and names the building.
- **Office assets** live in "Offices and interiors" (`src/assets/catalog/office.ts`), drawn at 5 px = 1 ft: walls, doors and windows, office rooms, cubicles (single, cluster of 4, and a row that adds cubicles as it is stretched), desks, chairs, computers, conference and round tables (chairs added as the table grows), printers, filing and storage cabinets, lounge furniture, kitchen items, whiteboards, screens, server racks and phone booths. General items that fit (reception desk, restrooms, stairs, elevators, break room...) are listed there through `OFFICE_SHARED` instead of being redrawn.
