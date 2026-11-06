# Builds favicon.svg from Barlow Condensed 800 "BM" (bold letters stay readable at 16px).
# Usage: python3 scripts/build-favicon.py site/fonts/barlow-condensed-800.woff2 40 13 > site/favicon.svg
# Needs: pip install fonttools brotli. PNG/ICO sizes are rendered from the SVG.
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
f=TTFont(sys.argv[1]); gs=f.getGlyphSet(); cmap=f.getBestCmap()
upm=f['head'].unitsPerEm
names=[cmap[ord(c)] for c in "BM"]
# layout with tight tracking
gap=float(sys.argv[2]) if len(sys.argv)>2 else 30
x=0; parts=[]
bp=BoundsPen(gs)
for n in names:
    g=gs[n]; b=BoundsPen(gs); g.draw(b); xmin,ymin,xmax,ymax=b.bounds
    parts.append((n,x-xmin,(xmin,ymin,xmax,ymax))); x+= (xmax-xmin)+gap
W=x-gap
ymin=min(p[2][1] for p in parts); ymax=max(p[2][3] for p in parts); H=ymax-ymin
S=100  # canvas
pad=float(sys.argv[3]) if len(sys.argv)>3 else 12
scale=min((S-2*pad)/W,(S-2*pad)/H)
ox=(S-W*scale)/2; oy=(S+H*scale)/2  # baseline-ish: flip y
d=""
for n,dx,_ in parts:
    pen=SVGPathPen(gs, ntos=lambda v: ("%.2f"%v).rstrip('0').rstrip('.'))
    tp=TransformPen(pen,(scale,0,0,-scale,ox+dx*scale,oy+ymin*scale))
    gs[n].draw(tp); d+=pen.getCommands()
print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#0b0b0b"/><path fill="#fff" d="{d}"/></svg>')
print(W,H,scale,file=sys.stderr)
