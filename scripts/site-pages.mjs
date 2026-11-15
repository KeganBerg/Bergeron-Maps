// Builds the shared header and footer of bergeronmaps.com and the industry pages.
//  - site/index.html: the header and footer between <!--NAV-->…<!--/NAV--> and <!--FOOT-->…<!--/FOOT--> are rewritten.
//  - site/industries/<slug>/index.html: one page per industry, written from INDUSTRIES below.
//  - site/sitemap.xml
// Runs in `npm run build:site`. Screenshots come from the real app (scripts/industry-shots/).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SITE = 'https://bergeronmaps.com/';
const home = readFileSync('site/index.html', 'utf8');
// The BM mark (with the <symbol> the product demo reuses) is kept from the current header.
// The wordmark beside it hides below 480px, so the divider does too.
const MARK = home.match(/<svg class="h-\[18px\][\s\S]*?<\/svg>/)[0].replace(/max-\[359px\]/g, 'max-[479px]');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const INDUSTRIES = [
  {
    slug: 'schools', name: 'School & Education', short: 'Schools', scene: 'school',
    pitch: 'Campus safety, parking organization and facility visibility.',
    title: 'A campus everyone can find their way around.',
    intro: 'New students, substitute teachers and parents at pickup all need to find something on campus. Give them one clear map of every building, office and lot, kept current by your own staff.',
    sample: { project: 'Sample High School', sheet: 'Campus', count: 'Visitor, faculty and student parking', find: 'F10' },
    why: 'What it changes on campus',
    whySub: 'Fewer lost visitors at the front office, fewer cars in the wrong lot, and a map you can actually keep up to date.',
    points: [
      ['Parking that sorts itself out', 'Student, faculty, staff and visitor lots each get their own section and numbered spaces. Assigned spots are easy to hand out and easy to check.'],
      ['Every door has a name', "Building A, the nurse's office, room 214, the gym lobby. Label them once and nobody has to guess which entrance is which."],
      ['Directions for visitors', 'A parent or a sub can search for a room and see where it is on their phone. There is no app to download.'],
      ['One map for the whole school', 'When the front office, custodians and coaches point at the same drawing, announcements and work orders get a lot less confusing.'],
      ['Room for more campuses', 'Running a district? Each campus is its own site, and buildings open up to show their floor plans.'],
      ['Changes take minutes', 'Moved the bus line or closed a lot for construction? Edit the map, publish it, and the old version is gone.'],
    ],
    note: 'Bergeron Maps is a facility map. It shows where things are; it is not an emergency notification or security system.',
    incTitle: 'What your campus gets.',
    included: [
      ['Search by room or building', 'Type "library" or "room 214" and the map jumps there.'],
      ['Numbered parking', 'Draw a row of spaces and the numbers fill in.'],
      ['Floor plans inside buildings', 'Tap a building to open its classrooms and offices.'],
      ['Always the current map', 'Students, staff and administrators always see the latest published map.'],
      ['Access by role', 'Administrators make changes. Everyone else can look but not edit.'],
    ],
    cta: "Send us your campus layout, even a rough sketch, and we'll build the first map with you.",
  },
  {
    slug: 'dealerships', name: 'Dealerships', short: 'Dealerships', scene: 'dealership',
    pitch: 'Faster customer-to-key times, less training and more profit.',
    title: 'Get the customer to the keys faster.',
    intro: "Every minute a porter spends walking rows is a minute your customer waits in the showroom, and you're paying for both. A searchable lot map gives that time back.",
    sample: { project: 'Sample Dealership', sheet: 'Main lot', count: 'New, used, service, customer, overflow', find: 'U19' },
    why: 'Where the time comes back',
    whySub: "Most dealerships don't have a lot problem. They have a \"where did that car go\" problem.",
    points: [
      ['Faster customer-to-key', 'A salesperson types the spot, say U19, and walks straight to it instead of circling the used lot.'],
      ['New hires get up to speed', 'Porters and lot attendants learn the layout from the map on day one, not from three weeks of following someone around.'],
      ['Zones that move with inventory', 'A truckload arrives, overflow fills up, a sale takes over the front row. Your lot manager redraws the zones and publishes.'],
      ['A place for everything', "New, used, service, customer and overflow parking each get their own section, so a trade-in doesn't end up in a customer space."],
      ['Fewer radio calls', 'Less "anyone seen the white Tahoe?" on the radio, and fewer trips back to the key box to ask around.'],
      ['Better days for sales and service', 'Advisors and salespeople spend their time with customers, and customers spend less of theirs waiting at the desk.'],
    ],
    calc: { title: 'A few minutes per vehicle adds up.', lead: 'Shave a few minutes off every vehicle pull and it turns into real labor hours by the end of the month. Try it with your own numbers.', unit: 'vehicle lookups', perDay: 60, minutes: 3, wage: 18 },
    incTitle: 'What your lot gets.',
    included: [
      ['Search by spot', 'Type a space like U19 and the map highlights it.'],
      ['Automatic numbering', 'Lay out a row and every space is numbered for you.'],
      ['Lot and showroom together', 'The service drive and the inside of the showroom live on the same map.'],
      ['One version for everyone', 'Sales, service and lot staff always see the latest published map.'],
      ['Managers edit, staff look up', 'Only the people you choose can move zones around.'],
    ],
    cta: "Tell us about your lot and we'll map it with you, row by row.",
  },
  {
    slug: 'valet', name: 'Valet', short: 'Valet', scene: 'valet',
    pitch: 'Fewer labor hours, faster training and live site management.',
    title: 'Every valet knows the site from the first shift.',
    intro: 'New attendants usually learn a garage by shadowing someone for a few shifts. With a clear map on their phone they can start parking cars sooner, and your site manager can change it whenever the layout does.',
    sample: { project: 'Sample Garage', sheet: 'Floor 1 to Floor 3', count: '216 spaces on 3 floors', find: '3C9' },
    why: 'Why valet teams use it',
    whySub: 'Less time explaining the garage, fewer cars in the wrong spot, and more time running keys.',
    points: [
      ['Shorter training', 'A new attendant can study the map before their first shift and pull it up on their phone during it.'],
      ['Find any space fast', 'Type 3C9 and the map opens on Floor 3, with walking directions from the entrance, the stairs or the elevator.'],
      ['Fewer wrong-level parks', 'Each level has its own color and every row is labeled, so 2B and 3B stop getting mixed up.'],
      ['Your manager edits it', "A layout change doesn't mean starting over. The site manager moves a row or renames a section in a few minutes."],
      ['The whole crew sees it', 'Changes stay in draft until they hit publish. After that, every attendant on the site has the new map.'],
      ['Event nights', 'Block off a section for a concert or a wedding, then put it back the next morning.'],
      ['Same standard at every site', 'Ten locations can share the same symbols and numbering, so people can cover a shift somewhere else.'],
      ['Less wasted labor', 'Less time explaining the layout, less time looking for cars, and fewer moves to fix a bad park.'],
    ],
    roles: [
      ['Regional managers', 'See and edit every site in their region.'],
      ['Site managers', 'Edit and publish maps for their own sites only.'],
      ['Valets and attendants', 'View the published map for the site they work at. They join with a six-character site code.'],
      ['Done for you', 'Send us a walkthrough or a sketch and we will build the map.'],
    ],
    calc: { title: 'Minutes per retrieval become hours every month.', lead: "Retrievals are where the minutes pile up. Plug in your site's numbers to see what a couple of minutes each is worth.", unit: 'retrievals', perDay: 150, minutes: 2, wage: 16 },
    incTitle: 'What your sites get.',
    included: [
      ['Search by space', 'Attendants type a space number and go.'],
      ['Walking directions', 'Step by step from the entrance, stairs or elevator.'],
      ['Color-coded levels', 'Every floor of the garage gets its own color.'],
      ['Current for the crew', 'Attendants and site managers always see the latest published map.'],
      ['Site codes', 'Attendants join with a six-character code and only see their site.'],
    ],
    cta: "Tell us about your site and we'll build the first map with you.",
  },
  {
    slug: 'warehouses', name: 'Warehouses', short: 'Warehouses', scene: 'warehouse',
    pitch: 'Faster location identification, less training and smoother operations.',
    title: 'Every rack, aisle and dock, on one map.',
    intro: "Pickers shouldn't have to memorize the building. Put every rack, aisle, dock and staging lane on one map they can search, and keep it current as the layout shifts.",
    sample: { project: 'Sample Distribution Center', sheet: 'Main floor', count: '6 racks, 96 locations, 8 docks', find: 'C-07' },
    why: 'What changes on the floor',
    whySub: 'Less walking around looking, quicker onboarding, and fewer picks pulled from the wrong bay.',
    points: [
      ['Locations you can search', 'A picker types C-07 and sees which rack, which aisle and which side.'],
      ['Less hunting', "Inventory, pallet jacks, the returns cage. If it has a place, it's on the map."],
      ['Faster onboarding', "Temps and new hires get a map instead of a half-hour walkthrough they'll forget by lunch."],
      ['Clear work areas', 'Receiving, staging, shipping and storage are drawn out, so pallets land where they belong.'],
      ['Re-slotting without the confusion', 'When racks move or a zone changes, a lead updates the map and publishes it the same day.'],
      ['Same naming in every building', 'Use one location format across all your warehouses so people can cover another site.'],
      ['Leads and the floor in sync', 'When a lead says "aisle 2, rack D", everyone is looking at the same drawing.'],
    ],
    incTitle: 'What your warehouse gets.',
    included: [
      ['Search by location', 'Type a bay like C-07 and it lights up.'],
      ['Automatic bay numbering', 'Draw a rack row and every bay is numbered: A-01, A-02 and on.'],
      ['Docks and zones', 'Receiving, shipping and staging, drawn as clear zones.'],
      ['One current map', 'Pickers, receiving and leads always see the latest published map.'],
      ['Leads edit, the floor views', 'Only leads and managers can change the layout.'],
    ],
    cta: "Send us a floor plan or a sketch of your building and we'll map it with you.",
  },
  {
    slug: 'other', name: 'Other Industries', short: 'Other industries', scene: 'office',
    pitch: 'If you manage a physical facility, Bergeron Maps can help.',
    title: 'If you manage a physical facility, we can map it.',
    intro: 'We started with parking, but the same tools map buildings, floors, rooms and work areas. If your team ever has to ask "where is that?", it can probably help.',
    sample: { project: 'Sample Office Building', sheet: 'Floor 2', count: 'Offices, meeting rooms, shared spaces', find: 'Conference room' },
    why: 'Places it already fits',
    whySub: "A few examples. If yours isn't on the list, ask us.",
    points: [
      ['Hospitals', 'Departments, patient and visitor parking, and the way from the garage to the right wing.'],
      ['Hotels', 'Guest and valet parking, back-of-house areas, ballrooms and service entrances.'],
      ['Office buildings', 'Which department is on which floor, who sits where, and where the meeting rooms are.'],
      ['Event venues', 'Parking zones, gates, vendor load-in and staging, set up fresh for each event.'],
      ['Manufacturing', 'Workstations, production lines and where each piece of equipment lives.'],
      ['Shopping centers', 'Store locations, parking fields and the doors between them.'],
      ['Airports', 'Parking sections, shuttle stops and terminal facilities.'],
      ['Government facilities', 'Buildings, public and staff parking, and which office is in which building.'],
      ['Sports facilities', 'Fields, courts, locker rooms, gates and game-day parking.'],
    ],
    unique: true,
    incTitle: 'The same platform, for your space.',
    included: [
      ['Search anything', 'Rooms, spaces, desks, doors, equipment.'],
      ['Floors and interiors', 'Buildings open up to their own floor plans.'],
      ['Hundreds of symbols', 'Use the ready-made ones or pick your own icon.'],
      ['Publish when ready', 'Your team always sees the latest published map.'],
      ['You choose who edits', 'Everyone else just looks things up.'],
    ],
    cta: "Tell us what you need mapped, even if it's unusual, and we'll build the first map with you.",
  },
];

const caret = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

function header(p, current) {
  const ind = INDUSTRIES.map((i) => `<a href="${p}industries/${i.slug}/"${current === i.slug ? ' aria-current="page"' : ''}>${esc(i.name)}</a>`).join('');
  const homeLink = p ? `${p}` : '#top';
  return `<header class="site-head relative z-30 border-b border-white/15 bg-ink text-white">
    <div class="wrap flex h-16 items-center gap-4 sm:gap-8">
      <a href="${homeLink}" class="flex items-center gap-3" aria-label="Bergeron Maps home">
        ${MARK}
        <span class="whitespace-nowrap font-sign text-[16px] tracking-[0.12em] max-[479px]:sr-only sm:text-[19px] sm:tracking-[0.16em]">BERGERON MAPS</span>
      </a>
      <nav class="ml-auto hidden items-center gap-8 text-[15px] text-white/70 lg:flex" aria-label="Main">
        <div class="nav-drop" data-menu>
          <button type="button" class="flex items-center gap-1 hover:text-white${current ? ' text-white' : ''}" aria-expanded="false" aria-controls="ind-menu">Industries ${caret}</button>
          <div class="nav-menu" id="ind-menu">${ind}</div>
        </div>
        <a class="hover:text-white" href="${p}#how">How it works</a>
        <a class="hover:text-white" href="${p}#platform">Platform</a>
        <a class="hover:text-white" href="${p}#about">About</a>
      </nav>
      <div class="ml-auto flex items-center gap-3 sm:gap-5 lg:ml-0">
        <a href="${p}app/" class="hidden whitespace-nowrap text-[15px] text-white/70 hover:text-white sm:inline">Sign in</a>
        <a href="${p}#contact" class="btn btn-sign whitespace-nowrap !px-3 text-[14px] sm:!px-5 sm:text-[15px]" data-cta>Get your map now</a>
        <button type="button" class="nav-burger lg:hidden" aria-expanded="false" aria-controls="mnav" aria-label="Menu"><span></span><span></span><span></span></button>
      </div>
    </div>
    <nav class="mnav lg:hidden" id="mnav" aria-label="Menu">
      <div class="wrap py-4">
        <p class="label text-white/50">Industries</p>
        <div class="mnav-ind">${ind}</div>
        <div class="mnav-main">
          <a href="${p}#how">How it works</a><a href="${p}#platform">Platform</a><a href="${p}#about">About</a><a href="${p}#contact">Contact us</a><a href="${p}app/">Sign in</a>
        </div>
      </div>
    </nav>
  </header>`;
}

function footer(p) {
  const ind = INDUSTRIES.map((i) => `<a class="inline-block py-1 hover:text-white" href="${p}industries/${i.slug}/">${esc(i.name)}</a>`).join('\n        ');
  return `<footer class="border-t border-white/15 bg-ink text-white/60">
    <div class="wrap grid gap-8 py-12 text-sm md:grid-cols-12">
      <div class="md:col-span-4"><div class="font-sign text-lg tracking-[0.16em] text-white">BERGERON MAPS</div><p class="mt-2">© <span data-year>2026</span> Bergeron Maps</p><p class="mt-4 max-w-xs">This site sets no cookies and uses no trackers or analytics. Fonts and scripts are served from this site only.</p></div>
      <nav class="flex flex-col gap-2 md:col-span-3 md:col-start-6" aria-label="Industries">
        <div class="label text-white/60">Industries</div>
        ${ind}
      </nav>
      <nav class="flex flex-col gap-2 md:col-span-3 md:col-start-10" aria-label="Footer">
        <div class="label text-white/60">Company</div>
        <a class="inline-block py-1 hover:text-white" href="${p}#contact">Get your map now</a>
        <a class="inline-block py-1 hover:text-white" href="${p}app/">Sign in</a>
        <a class="inline-block py-1 hover:text-white" href="mailto:bergeronmaps@gmail.com">bergeronmaps@gmail.com</a>
        <a class="inline-block py-1 hover:text-white" href="${p}.well-known/security.txt">Report a security issue</a>
      </nav>
    </div>
  </footer>`;
}

const HEAD_ICONS = (p) => `<link rel="icon" href="${p}favicon.ico" sizes="48x48" />
  <link rel="icon" href="${p}favicon-32.png" type="image/png" sizes="32x32" />
  <link rel="icon" href="${p}favicon-16.png" type="image/png" sizes="16x16" />
  <link rel="apple-touch-icon" href="${p}apple-touch-icon.png" />
  <link rel="preload" href="${p}fonts/archivo.woff2" as="font" type="font/woff2" crossorigin />`;


function calcBlock(c) {
  return `
    <section class="border-t border-ink/15 bg-paper text-ink">
      <div class="wrap grid gap-12 py-20 lg:grid-cols-12 lg:py-28">
        <div class="lg:col-span-5">
          <h2 class="h2">${esc(c.title)}</h2>
          <p class="mt-6 text-lg text-ink/70">${esc(c.lead)}</p>
        </div>
        <form class="calc lg:col-span-6 lg:col-start-7" data-calc>
          <div class="grid gap-6 sm:grid-cols-3">
            <label class="calc-l">${esc(c.unit[0].toUpperCase() + c.unit.slice(1))} per day<input class="calc-f" type="number" inputmode="numeric" min="0" max="100000" name="n" value="${c.perDay}" /></label>
            <label class="calc-l">Minutes saved on each<input class="calc-f" type="number" inputmode="decimal" min="0" max="120" step="0.5" name="m" value="${c.minutes}" /></label>
            <label class="calc-l">Hourly labor cost ($)<input class="calc-f" type="number" inputmode="decimal" min="0" max="1000" name="w" value="${c.wage}" /></label>
          </div>
          <dl class="mt-8 grid border-y border-ink/15 sm:grid-cols-2" aria-live="polite">
            <div class="py-5 sm:pr-5"><dt class="label">Labor hours a month</dt><dd class="calc-out" data-out="h">0</dd></div>
            <div class="border-t border-ink/15 py-5 sm:border-l sm:border-t-0 sm:pl-5"><dt class="label">Labor cost a month</dt><dd class="calc-out" data-out="d">$0</dd></div>
          </dl>
          <p class="mt-3 text-sm text-ink/60">Example figures, based on 30 days a month. Your results depend on your site and team.</p>
        </form>
      </div>
    </section>`;
}

function industryPage(ind) {
  const p = '../../';
  const url = `${SITE}industries/${ind.slug}/`;
  const ask = `${p}?industry=${ind.slug}#contact`;
  const pts = ind.points.map(([t, d]) => `<div class="grid gap-2 py-5 sm:grid-cols-3"><dt class="font-semibold">${esc(t)}</dt><dd class="text-ink/70 sm:col-span-2">${esc(d)}</dd></div>`).join('\n          ');
  const others = INDUSTRIES.filter((i) => i !== ind).map((i) => `<a href="${p}industries/${i.slug}/">${esc(i.name)}</a>`).join('');
  const s = ind.sample;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(ind.name)} · Bergeron Maps</title>
  <meta name="description" content="${esc(ind.pitch + ' ' + ind.intro)}" />
  <meta property="og:title" content="${esc(ind.name)} · Bergeron Maps" />
  <meta property="og:description" content="${esc(ind.pitch)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Bergeron Maps" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}img/industries/${ind.scene}-editor.webp" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0b0b0b" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' mailto:; upgrade-insecure-requests" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  ${HEAD_ICONS(p)}
  <link rel="stylesheet" href="${p}styles.css" />
</head>
<body>
  <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-sign focus:px-3 focus:py-2 focus:text-ink">Skip to content</a>
  <!-- Generated by scripts/site-pages.mjs. Edit the script, not this file. -->

  ${header(p, ind.slug)}

  <main id="main">
    <section class="bg-ink text-white">
      <div class="wrap grid gap-10 pb-14 pt-16 lg:grid-cols-12 lg:pt-24">
        <div class="lg:col-span-7">
          <p class="label text-white/60"><a class="hover:text-white" href="${p}#industries">Industries</a><i class="sep">/</i>${esc(ind.name)}</p>
          <h1 class="mt-5 text-[clamp(2.4rem,5.6vw,4.6rem)] font-[780] leading-[0.98] tracking-[-0.035em]">${esc(ind.title)}</h1>
        </div>
        <div class="flex flex-col justify-end gap-7 lg:col-span-5">
          <p class="text-lg font-semibold text-sign">${esc(ind.pitch)}</p>
          <p class="-mt-3 text-lg leading-relaxed text-white/75">${esc(ind.intro)}</p>
          <div class="flex flex-wrap gap-3">
            <a href="${ask}" class="btn btn-sign">Get your map now</a>
            <a href="${p}#how" class="btn btn-line">See how it works</a>
          </div>
        </div>
      </div>

      <div class="wrap pb-20">
        <figure class="relative border border-white/25">
          <div class="grid items-center gap-6 p-3 sm:p-6 lg:grid-cols-[minmax(0,1fr)_250px] lg:gap-8 lg:p-8">
            <img class="shot" src="${p}img/industries/${ind.scene}-editor.webp" width="2000" height="1222" alt="The Bergeron Maps editor showing ${esc(s.project.toLowerCase().replace('sample ', 'a sample '))}" />
            <img class="shot shot-phone mx-auto w-full max-w-[250px]" src="${p}img/industries/${ind.scene}-phone.webp" width="780" height="1560" loading="lazy" alt="The same map on a phone, with ${esc(s.find)} found by search" />
          </div>
          <figcaption class="titleblock grid grid-cols-2 border-t border-white/25 text-white/70 sm:grid-cols-4">
            <div><span>Project</span>${esc(s.project)}</div>
            <div><span>Sheet</span>${esc(s.sheet)}</div>
            <div class="hidden sm:block"><span>On this map</span>${esc(s.count)}</div>
            <div class="hidden sm:block"><span>Phone</span>Searched for ${esc(s.find)}</div>
          </figcaption>
        </figure>
        <p class="mt-3 text-sm text-white/60">Screenshots of the real app with a sample site. Not a real client.</p>
      </div>
    </section>

    <section class="bg-paper text-ink">
      <div class="wrap grid gap-12 py-24 lg:grid-cols-12 lg:py-32">
        <div class="lg:col-span-5">
          <h2 class="h2">${esc(ind.why)}</h2>
          <p class="mt-6 text-lg text-ink/70">${esc(ind.whySub)}</p>
          ${ind.note ? `<p class="mt-6 border-l-2 border-sign pl-4 text-ink/70">${esc(ind.note)}</p>` : ''}
          ${ind.unique ? `<div class="mt-10 flex flex-wrap gap-3"><a href="${ask}" class="btn btn-ink">Get your map now</a><a href="mailto:bergeronmaps@gmail.com" class="btn border border-ink/40 hover:border-ink">Contact us</a></div>` : ''}
        </div>
        <dl class="divide-y divide-ink/15 border-y border-ink/15 lg:col-span-6 lg:col-start-7">
          ${pts}
        </dl>
      </div>
    </section>
${ind.calc ? calcBlock(ind.calc) : ''}${ind.roles ? `
    <section class="border-t border-ink/15 bg-paper text-ink">
      <div class="wrap grid gap-12 py-20 lg:grid-cols-12 lg:py-28">
        <div class="lg:col-span-5">
          <h2 class="h2">Your site managers keep the map current.</h2>
          <p class="mt-6 text-lg text-ink/70">No more redrawing the site every time operations change. Access is set by role, and maps stay with the site, not the person who made them.</p>
        </div>
        <dl class="divide-y divide-ink/15 border-y border-ink/15 lg:col-span-6 lg:col-start-7">
          ${ind.roles.map(([t, d]) => `<div class="grid gap-2 py-5 sm:grid-cols-3"><dt class="font-semibold">${esc(t)}</dt><dd class="text-ink/70 sm:col-span-2">${esc(d)}</dd></div>`).join('\n          ')}
        </dl>
      </div>
    </section>` : ''}

    <section class="bg-ink text-white">
      <div class="wrap py-20 lg:py-24">
        <div class="grid gap-6 lg:grid-cols-12">
          <h2 class="h2 lg:col-span-6">${esc(ind.incTitle)}</h2>
          <p class="text-lg text-white/70 lg:col-span-5 lg:col-start-8 lg:self-end"><a class="underline decoration-sign decoration-2 underline-offset-4 hover:text-white" href="${p}#platform">See the full feature list</a></p>
        </div>
        <ul class="inc mt-12 grid border-t border-white/25 sm:grid-cols-2 lg:grid-cols-5">
          ${ind.included.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('\n          ')}
        </ul>
      </div>
    </section>

    <section class="bg-sign text-ink">
      <div class="wrap grid gap-10 py-20 lg:grid-cols-12 lg:py-24">
        <div class="lg:col-span-7">
          <h2 class="h2">Get your map now.</h2>
          <p class="mt-6 max-w-xl text-lg">${esc(ind.cta)}</p>
        </div>
        <div class="flex flex-col justify-end gap-4 lg:col-span-4 lg:col-start-9">
          <div class="flex flex-wrap gap-3"><a href="${ask}" class="btn btn-ink">Get your map now</a><a href="mailto:bergeronmaps@gmail.com" class="btn border border-ink/50 hover:border-ink">Contact us</a></div>
          <p class="text-sm text-ink/70">Other industries: <span class="others">${others}</span></p>
        </div>
      </div>
    </section>
  </main>

  ${footer(p)}

  <script src="${p}nav.js" defer></script>
</body>
</html>
`;
}

const cards = INDUSTRIES.map((i, n) => `<li><a class="ind-card" href="industries/${i.slug}/">
            <img src="img/industries/${i.scene}-phone.webp" width="780" height="1560" loading="lazy" alt="" />
            <span class="label">0${n + 1}</span><b>${esc(i.name)}</b><span class="ind-pitch">${esc(i.pitch)}</span><span class="ind-more">Learn more <i aria-hidden="true">&rarr;</i></span>
          </a></li>`).join('\n          ');

// Home page: shared header and footer, and the industry cards.
let out = home
  .replace(/<!--IND-CARDS-->[\s\S]*?(<!--\/IND-CARDS-->|(?=\n\s*<\/ul>))/, `<!--IND-CARDS-->\n          ${cards}\n          <!--/IND-CARDS-->`)
  .replace(/<!--NAV-->[\s\S]*?<!--\/NAV-->/, `<!--NAV-->\n  ${header('', '')}\n  <!--/NAV-->`)
  .replace(/<!--FOOT-->[\s\S]*?<!--\/FOOT-->/, `<!--FOOT-->\n  ${footer('')}\n  <!--/FOOT-->`);
if (!out.includes('<!--NAV-->') || !out.includes('<!--FOOT-->')) throw new Error('site/index.html needs <!--NAV--> and <!--FOOT--> markers');
writeFileSync('site/index.html', out);

for (const ind of INDUSTRIES) {
  mkdirSync(`site/industries/${ind.slug}`, { recursive: true });
  writeFileSync(`site/industries/${ind.slug}/index.html`, industryPage(ind));
}

writeFileSync('site/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc></url>
${INDUSTRIES.map((i) => `  <url><loc>${SITE}industries/${i.slug}/</loc></url>`).join('\n')}
</urlset>
`);
console.log('site pages:', INDUSTRIES.map((i) => i.slug).join(', '));
