"""Draws the demo hand sketch the trace video uploads: a pencil drawing of a small
lot on paper, made here so no real site is shown. Run: python3 make-sketch.py"""
import math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

random.seed(7)
W, H = 1500, 1000
img = Image.new('RGB', (W, H), (246, 243, 234))
px = img.load()
# Paper: faint grain and a soft shadow towards one corner, like a phone photo.
for y in range(H):
    for x in range(W):
        n = random.randint(-5, 5)
        shade = int(14 * (x / W) * (y / H))
        r, g, b = px[x, y]
        px[x, y] = (r + n - shade, g + n - shade, b + n - shade - 2)
d = ImageDraw.Draw(img)
INK = (70, 72, 80)

def wobble_line(a, b, width=3):
    """A hand-drawn line: slightly off straight, drawn twice like a pencil."""
    for k in range(2):
        pts = []
        steps = max(4, int(math.dist(a, b) / 40))
        for i in range(steps + 1):
            t = i / steps
            j = 0 if i in (0, steps) else random.uniform(-2.2, 2.2)
            pts.append((a[0] + (b[0] - a[0]) * t + j + k, a[1] + (b[1] - a[1]) * t + j))
        d.line(pts, fill=INK, width=width - k, joint='curve')

def row(x0, y0, count, pitch, depth, angle_deg=0):
    """A row of spaces: front and back lines, a tick between each space."""
    r = math.radians(angle_deg)
    ux, uy = math.cos(r), math.sin(r)
    nx, ny = -uy, ux
    L = count * pitch
    p = lambda s, t: (x0 + ux * s + nx * t, y0 + uy * s + ny * t)
    wobble_line(p(0, 0), p(L, 0))
    wobble_line(p(0, depth), p(L, depth))
    for i in range(count + 1):
        wobble_line(p(i * pitch, 0), p(i * pitch, depth), 2)

# Lot edge.
wobble_line((120, 90), (1380, 90)); wobble_line((1380, 90), (1380, 900))
wobble_line((1380, 900), (420, 900)); wobble_line((120, 90), (120, 620))
# Two straight rows facing a lane, and an angled row along the right side.
row(260, 140, 14, 45, 90)
row(260, 380, 14, 45, 90)
row(1000, 560, 6, 45, 90, -30)
# Curved entrance lane in the bottom-left corner.
for off in (0, 110):
    pts = []
    for i in range(24):
        a = math.radians(180 + 90 * i / 23)
        rr = 300 - off
        pts.append((420 + rr * math.cos(a) + random.uniform(-1.5, 1.5), 900 + rr * math.sin(a) + random.uniform(-1.5, 1.5)))
    d.line(pts, fill=INK, width=3, joint='curve')
# An arrow for the way in.
wobble_line((205, 860), (205, 760)); wobble_line((205, 760), (185, 785)); wobble_line((205, 760), (225, 785))
img = img.filter(ImageFilter.GaussianBlur(0.6))
out = Path(__file__).with_name('assets') / 'sample-lot-sketch.jpg'
img.save(out, quality=88)
print(out)
