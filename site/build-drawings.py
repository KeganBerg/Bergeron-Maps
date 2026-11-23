# Generates the line drawings on the landing page and injects them into index.html
# between <!--PLAN-->…<!--/PLAN--> markers. (The SECTION drawing comes from scripts/site-demo.ts.)
# Run: python3 site/build-drawings.py  (npm run build:site runs it too)
import pathlib, re

INK = "currentColor"


def plan():
    """Plan of a fictional garage floor, drawn like an architect's sheet."""
    W, H = 1200, 600
    o = []
    # slab: double wall line
    o.append('<rect x="40" y="40" width="1080" height="470" fill="none" stroke-width="3"/>')
    o.append('<rect x="48" y="48" width="1064" height="454" fill="none" stroke-width="1"/>')
    # columns
    for cx in range(160, 1100, 160):
        for cy in (156, 394):
            o.append(f'<rect class="col" x="{cx-6}" y="{cy-6}" width="12" height="12" fill="{INK}" stroke="none"/>')
    sw = 50  # stall width
    x0 = 170
    n = 16

    def row(prefix, y, h, label_y, found=None):
        for i in range(n):
            x = x0 + i * sw
            cls = "stall found" if found == i + 1 else "stall"
            rc = ' class="stall-found-box"' if found == i + 1 else ''
            o.append(f'<g class="{cls}"><path d="M{x} {y}v{h}" /><rect{rc} x="{x}" y="{min(y, y+h)}" width="{sw}" height="{abs(h)}" fill="transparent" stroke="none"/>'
                     f'<text x="{x + sw/2}" y="{label_y}">{prefix}{i+1}</text></g>')
        x = x0 + n * sw
        o.append(f'<path class="stall-end" d="M{x} {y}v{h}"/>')

    row("A", 48, 96, 128)              # along north wall
    row("B", 296, -96, 222)            # middle bay, facing north aisle
    row("C", 296, 96, 382, found=12)  # middle bay, facing south aisle
    row("D", 502, -96, 432)            # along south wall
    o.append(f'<path d="M{x0} 296h{n*sw}" stroke-width="1.5"/>')  # back-to-back divider
    # aisle centre lines + direction arrows
    for y in (172, 420):
        o.append(f'<path class="aisle" d="M110 {y}H1000" stroke-dasharray="10 10" stroke-width="1"/>')
    for x in (260, 560, 860):
        o.append(f'<path d="M{x} 172l14 -7v14z" fill="{INK}" stroke="none"/>')
        o.append(f'<path d="M{x+14} 420l-14 -7v14z" fill="{INK}" stroke="none"/>')
    # ramp (hatched) at the east end
    o.append('<rect x="1010" y="196" width="100" height="200" fill="url(#hatch)" stroke-width="1.5"/>')
    o.append('<path d="M1060 370V222m-10 14 10-14 10 14" stroke-width="2"/>')
    o.append('<text class="note" x="1060" y="412">RAMP UP · P3</text>')
    # stair + elevator core at the west end
    o.append('<rect x="56" y="200" width="70" height="96" fill="none" stroke-width="1.5"/>')
    for k in range(9):
        o.append(f'<path d="M56 {206+k*10}h70" stroke-width=".8"/>')
    o.append('<rect x="56" y="302" width="70" height="56" fill="none" stroke-width="1.5"/><path d="M56 302l70 56M126 302l-70 56" stroke-width=".8"/>')
    o.append('<text class="note" x="91" y="376">STAIR · ELEV</text>')
    # entry + valet stand
    o.append('<path d="M0 470H40" stroke-width="0"/>')
    o.append('<path class="entry" d="M-30 452H52m-14-10 14 10-14 10" stroke-width="2.5"/>')
    o.append('<text class="note" x="6" y="438" text-anchor="start">ENTRY</text>')
    o.append('<rect x="70" y="440" width="44" height="26" fill="none" stroke-width="1.5"/><text class="note" x="92" y="457">VALET</text>')
    # route from entry to the found space (drawn by JS)
    o.append('<path class="route" d="M52 452H140V420H745V372" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
    # dimension line
    o.append('<path d="M170 22H970M170 16v12M970 16v12" stroke-width="1"/>')
    o.append('<text class="note" x="570" y="16">16 SPACES @ 9\'-0" = 144\'-0"</text>')
    # north arrow + scale bar
    o.append('<g transform="translate(1150 560)"><circle r="16" fill="none" stroke-width="1"/><path d="M0 -12 6 8 0 3-6 8z" fill="currentColor" stroke="none"/><text class="note" y="-22">N</text></g>')
    o.append('<g transform="translate(40 560)"><path d="M0 0h200M0-6v12M50-4v8M100-6v12M200-6v12" stroke-width="1"/><text class="note" x="0" y="22" text-anchor="start">0</text><text class="note" x="100" y="22">25</text><text class="note" x="200" y="22">50 FT</text></g>')
    defs = ('<defs><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            '<path d="M0 0v10" stroke="currentColor" stroke-width=".8"/></pattern></defs>')
    return (f'<svg id="plan" viewBox="-40 0 {W+40} {H}" class="drawing block h-auto w-full" fill="none" stroke="{INK}" '
            f'role="img" aria-label="Plan drawing of a garage floor with space C12 found and the route to it">{defs}{"".join(o)}</svg>')


# The multi-floor side view is drawn by scripts/site-demo.ts with the app's own SideView, so it always matches the app.


p = pathlib.Path(__file__).with_name("index.html")
html = p.read_text()
p.write_text(html)
print("drawings ok")
