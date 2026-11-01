# Generates the hero product mockup SVG and injects it into index.html between the MAP markers.
# Run: python3 site/build-map.py   (only needed when changing the mockup)
import re, pathlib

W = 52
X0 = 80
rows = []
for i in range(12):
    n = 10 + i
    x = X0 + i * W
    cls = "stall stall-b16" if n == 16 else "stall"
    rows.append(f'<g class="{cls}"><rect x="{x}" y="60" width="{W}" height="92" fill="#ffffff" fill-opacity=".02" /><text x="{x + W/2}" y="138" fill="#e7e7ea" stroke="none">B{n}</text></g>')
for i in range(12):
    n = 10 + i
    x = X0 + i * W
    rows.append(f'<g class="stall"><rect x="{x}" y="288" width="{W}" height="92" fill="#ffffff" fill-opacity=".02" /><text x="{x + W/2}" y="312" fill="#e7e7ea" stroke="none">C{n}</text></g>')

svg = f'''<svg viewBox="0 0 800 440" class="block w-full" role="img" aria-label="A garage level map with space B16 highlighted">
  <defs>
    <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#ffffff" fill-opacity=".06"/></pattern>
  </defs>
  <rect width="800" height="440" fill="url(#dots)"/>
  <g class="stalls" fill="none" stroke="#e7e7ea" stroke-opacity=".55" stroke-width="1.5" font-family="Geist, sans-serif" font-size="13" font-weight="600" text-anchor="middle">
    {"".join(rows)}
  </g>
  <path d="M60 220H760" stroke="#f2b705" stroke-opacity=".35" stroke-width="2" stroke-dasharray="14 12"/>
  <g class="lm" font-family="Geist, sans-serif" font-size="11" font-weight="700">
    <rect x="16" y="196" width="40" height="48" rx="6" fill="#18a957"/><text x="36" y="224" fill="#fff" text-anchor="middle">IN</text>
    <rect x="712" y="196" width="72" height="48" rx="6" fill="#2f7df6"/><text x="748" y="218" fill="#fff" text-anchor="middle">RAMP</text><text x="748" y="233" fill="#fff" fill-opacity=".8" text-anchor="middle">to P3 ↑</text>
    <rect x="16" y="300" width="48" height="40" rx="6" fill="#f2b705"/><text x="40" y="324" fill="#070707" text-anchor="middle">VALET</text>
  </g>
  <path class="route" d="M56 220H418V160" fill="none" stroke="#f2b705" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <g class="pin"><circle cx="418" cy="106" r="22" fill="#f2b705" fill-opacity=".18"/><circle cx="418" cy="106" r="8" fill="#f2b705"/></g>
</svg>'''

p = pathlib.Path(__file__).with_name("index.html")
html = p.read_text()
html = re.sub(r"<!--MAP-->.*?<!--/MAP-->", "<!--MAP-->" + svg + "<!--/MAP-->", html, flags=re.S)
p.write_text(html)
print("ok")
