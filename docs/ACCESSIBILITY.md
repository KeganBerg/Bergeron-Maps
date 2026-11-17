# Accessibility (WCAG 2.1 AA)

Audit of 2026-11-17. Covered: the map viewer, search, walking directions, the editor, sign-in, the home page and the marketing site, in all three themes (classic, night, signage), on desktop and on a phone. Method: an automated axe-core scan of every screen and state, contrast math on every theme color pair, and a keyboard and screen reader pass by hand.

## Fixed

| Area | Problem | WCAG | Fix |
|---|---|---|---|
| All dialogs | Tab could leave the dialog into the page behind it; focus was lost when it closed; a dialog re-ran its setup on every parent re-render, throwing focus back to the first field while typing | 2.4.3, 2.1.2 | Tab stays inside, focus returns to the button that opened it, setup runs once, title linked with `aria-labelledby` |
| Focus ring | Light blue ring (1.8:1 on white, 1.6:1 on signage beige) was hard to see; search boxes showed no ring at all | 2.4.7, 1.4.11 | Ring color per theme (blue, darker blue, yellow), at least 3.8:1 on every background; white on the navy signage header; search boxes show the ring around the box |
| Floor buttons | The selected floor's text was too faint on some floor colors: dark on purple 1.9:1 in night, white on orange 3.7:1 in signage | 1.4.3 | Text is white or near-black, whichever reads better on that floor's color (4.5:1 or more on all 8) |
| Editor floor tabs | Floors could not be reached with Tab at all; the options button was nested inside the tab | 2.1.1, 4.1.2 | Each floor is a real button; the options menu takes focus, arrow keys move through it, Escape closes it and returns focus |
| Editor sidebar | Hide-sidebar button sat inside the tab list | 4.1.2 | Moved out of the tab list |
| Viewer | Map drawing had no text alternative; no page heading or landmarks | 1.1.1, 1.3.1 | Map labelled as an image pointing to search; map name is the page heading; search is a search landmark |
| Viewer search | Result count wasn't read out; no keyboard way into the results; picking a result dropped focus to the page | 4.1.3, 2.1.1, 2.4.3 | Results count, the selected place, the start question and the route summary are read out by screen readers; Down arrow enters the list, Escape goes back; focus moves to the place's card |
| Directions | Pressing Directions, picking a start or closing dropped focus to the page | 2.4.3 | Focus moves into the directions panel, and back to the Directions button on close |
| Phones | Back, Refresh, Share and Close buttons in the viewer were 32px | 2.5.5 (AAA, best practice) | 44px on touch screens; floor buttons and panel buttons at least 44px tall |
| Home | Empty slot buttons were named differently from what they show | 2.5.3 | The name now starts with the visible text |

The marketing site and sign-in page passed the automated scan and the keyboard pass with no changes needed (page landmarks, visible focus, reduced motion respected, form errors announced).

`e2e/accessibility.spec.ts` guards these: keyboard search, directions focus, floor contrast in all themes, editor floor tabs and menu, and dialog focus.

## Open choices (not changed, because they change the look or need a decision)

1. **Field and button borders are faint.** Input borders are 1.5 to 1.8:1 against the panel (WCAG 1.4.11 asks for 3:1 for the edge that shows where a field is). Darkening `--border-strong` in each theme fixes it but makes every button and field outline noticeably darker.
2. **The yellow highlight ring on the map is faint in the light themes.** The amber ring around a found space is about 2:1 on the light map background in classic and signage. A dark outline inside the yellow ring would fix it without changing the color.
3. **The editor is mouse and touch only for drawing.** Selecting, moving (arrow keys), deleting and the menus work from the keyboard, but placing a new object or drawing a row needs a pointer. A full keyboard drawing mode is a large feature; most customers only need the viewer to be accessible, since that's what employees and visitors use.
4. **A text list of the map.** Screen reader users can find any space by search, but can't browse the map. A "List view" (every space and place on the floor, grouped by row) would close that gap and is often asked for by schools.
5. **Accessibility statement / VPAT.** Schools and public buyers often ask for one. This file can be the start of it once the choices above are decided.
