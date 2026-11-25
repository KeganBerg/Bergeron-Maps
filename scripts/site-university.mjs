// Bergeron Maps University (bergeronmaps.com/university/): the training hub for everyone at a
// customer's sites. One hub page (the videos, common questions and how to get help) and one page
// per video. Written by scripts/site-pages.mjs, which hands over the shared header and footer.
//
// The videos are made by scripts/tutorials/ (see its README). Each one's .mp4, .vtt captions and
// .png thumbnail are copied into site/university/videos/ under the video's slug. The length and
// the words on each page are read from those files, so a re-cut video only needs its files copied.
//
// Write for people who are not technical and may not speak English as a first language: short
// sentences, everyday words, the button names exactly as the app shows them.
import { readFileSync } from 'node:fs';

/** The getting-started series, in the order to watch it. */
export const COURSE = [
  {
    slug: 'sign-in-and-find-your-site',
    title: 'Sign in and find your site',
    summary: 'Sign in with your work email and open the Maps page.',
    learn: ['Sign in with a link or a code from your email. There is no password.', 'Find your site on the Maps page.', 'Stay signed in on your own device.'],
  },
  {
    slug: 'build-a-lot-in-four-answers',
    title: 'Build a lot in four answers',
    summary: 'Answer four questions and the builder draws your rows, lanes and ramps.',
    learn: ['Start a map with Build it for me.', 'Set the floors, rows, spaces per row and accessible spaces.', 'Change a row or a single space so the map matches your site.'],
  },
  {
    slug: 'trace-your-sketch-or-site-plan',
    title: 'Trace your sketch or site plan',
    summary: 'Put a photo of your sketch under the map and draw over it.',
    learn: ['Upload a photo of a paper sketch, a site plan or an aerial photo.', 'Draw rows of spaces over it, straight or at an angle.', 'Fit a curved lane to your sketch.'],
  },
  {
    slug: 'publish-and-preview',
    title: 'Publish and preview',
    summary: 'See the map the way your team will, then publish it.',
    learn: ['Use Preview to see what your employees will see.', 'Publish, so your team can use the map.', 'Publish changes later. Your team keeps the old version until you do.'],
  },
  {
    slug: 'get-your-team-on-the-map',
    title: 'Get your team on the map',
    summary: 'Give employees the site code and give managers access by email address.',
    learn: ['Share the six-character site code with employees.', 'Give a manager access with their work email.', 'Remove someone who leaves.'],
  },
];

/** Common questions, in groups. Every answer must be true in the app today (docs/SITE_CLAIMS.md). */
export const FAQ = [
  ['Signing in', [
    ['Do I need a password?', 'No. Type your work email on the sign-in page. We email you a sign-in link and a six-digit code. Open the link, or type the code. Both work for one hour.'],
    ['I did not get the sign-in email.', 'Wait a minute, then look in your spam or junk folder. Check that you typed the email your account was set up with. You can ask for a new email on the same page.'],
    ['Do I need to install an app?', 'No. Bergeron Maps works in the web browser on a phone, tablet or computer. Go to bergeronmaps.com and choose Sign in.'],
  ]],
  ['Building your map', [
    ['What is the fastest way to start a map?', 'Choose Build it for me when you add a map. Answer four questions: floors, rows per floor, spaces per row and accessible spaces. Then change anything that is different at your site.'],
    ['Can I use my paper drawing?', 'Yes. Take a photo of it with your phone. In the editor, open the Layers tab and choose Upload site plan or aerial photo. Then draw over it.'],
    ['Do I need to save?', 'No. The map saves as you work. You see Saved at the top of the editor.'],
    ['I made a mistake. Can I go back?', 'Yes. Use Undo for a recent change. Saved versions of the map let you go back to an earlier point.'],
  ]],
  ['Publishing', [
    ['Why can my team not see my changes?', 'Your changes stay in draft until you choose Publish changes. Your team keeps seeing the last published map until then.'],
    ['How do I check the map before my team sees it?', 'Choose Preview in the editor. It shows exactly what your employees will see.'],
  ]],
  ['Your team', [
    ['How do employees get on the map?', 'Give them your site code. It has six characters. They sign in, type the code under Join a site, and choose Join site. Employees can look at the map but cannot change it.'],
    ['How do I add a manager?', 'Open Sites & people and choose Give someone access. Type their work email, pick their access and the site. The app does not send them an email, so copy the message it gives you and send it yourself.'],
    ['Someone left the company. What do I do?', 'Open Sites & people, find them under People, and choose Remove. They lose access at once.'],
    ['Our site code was shared too widely.', 'Open Sites & people and choose New code. The old code stops working. People who already joined keep their access.'],
  ]],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SUPPORT = 'bergeronmaps@gmail.com';
const file = (slug, ext) => `site/university/videos/${slug}.${ext}`;

/** Seconds of video, from the mp4's movie header (mvhd box): timescale and duration. */
export function mp4Seconds(buf) {
  const at = buf.indexOf('mvhd');
  if (at < 0) throw new Error('no mvhd box in the video');
  const v1 = buf[at + 4] === 1; // version 1 uses 64-bit times
  const scale = buf.readUInt32BE(at + (v1 ? 24 : 16));
  const dur = v1 ? Number(buf.readBigUInt64BE(at + 28)) : buf.readUInt32BE(at + 20);
  return dur / scale;
}

export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** The narration as paragraphs, from the captions: cue text only, joined, split at sentence ends. */
export function transcript(vtt) {
  const text = vtt.split(/\r?\n\r?\n/).slice(1)
    .map((cue) => cue.split(/\r?\n/).filter((l) => l && !l.includes('-->') && !/^\d+$/.test(l)).join(' '))
    .join(' ').replace(/\s+/g, ' ').trim();
  const sentences = text.match(/[^.!?]+[.!?]+["”’]?/g) ?? [text];
  const paras = [];
  for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(' ').trim());
  return paras;
}

function videos() {
  return COURSE.map((v, i) => ({ ...v, number: i + 1, seconds: mp4Seconds(readFileSync(file(v.slug, 'mp4'))) }));
}

function head({ url, title, desc, image }) {
  return `<meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Bergeron Maps" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${image}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0b0b0b" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />`;
}

function page({ p, url, title, desc, image, body, shell }) {
  return `<!doctype html>
<html lang="en">
<head>
  ${head({ url, title, desc, image })}
  ${shell.icons(p)}
  <link rel="stylesheet" href="${p}styles.css" />
</head>
<body>
  <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-sign focus:px-3 focus:py-2 focus:text-ink">Skip to content</a>
  <!-- Generated by scripts/site-university.mjs. Edit the script, not this file. -->

  ${shell.header(p, '')}

  <main id="main">
${body}
  </main>

  ${shell.footer(p)}

  <script src="${p}nav.js" defer></script>
</body>
</html>
`;
}

const help = `<section id="help" class="bg-ink text-white">
      <div class="wrap grid gap-10 py-20 lg:grid-cols-12 lg:py-24">
        <div class="lg:col-span-5">
          <h2 class="h2">Get help</h2>
          <p class="mt-6 text-lg text-white/75">Can't find the answer here? Email us and a person on our team will help you.</p>
          <a class="btn btn-sign mt-8" href="mailto:${SUPPORT}?subject=Help%20with%20Bergeron%20Maps">Email ${SUPPORT}</a>
        </div>
        <div class="lg:col-span-6 lg:col-start-7">
          <h3 class="text-xl font-semibold">To help us answer quickly, tell us:</h3>
          <ul class="mt-5 list-disc space-y-2 pl-5 text-lg text-white/75">
            <li>Your company and site name.</li>
            <li>What you were trying to do, and what happened.</li>
            <li>A screenshot, if you can take one.</li>
          </ul>
          <p class="mt-8 text-white/60">Problems using a map with a screen reader or keyboard: see <a class="underline hover:text-white" href="../accessibility/">Accessibility</a>.</p>
        </div>
      </div>
    </section>`;

function card(v) {
  return `<li>
            <a class="group block h-full border border-ink/15 bg-white hover:border-ink/50" href="${v.slug}/">
              <img class="aspect-video w-full border-b border-ink/10 object-cover" src="videos/${v.slug}.png" width="1920" height="1080" alt="" loading="lazy" />
              <div class="p-5">
                <p class="text-sm text-ink/60">Video ${v.number}, ${clock(v.seconds)}</p>
                <h3 class="mt-1 text-xl font-semibold group-hover:underline">${esc(v.title)}</h3>
                <p class="mt-2 text-ink/70">${esc(v.summary)}</p>
              </div>
            </a>
          </li>`;
}

function faqBlock() {
  return FAQ.map(([group, items]) => `<div>
            <h3 class="text-xl font-semibold">${esc(group)}</h3>
            <div class="mt-4 divide-y divide-ink/15 border-y border-ink/15">
              ${items.map(([q, a]) => `<details class="faq py-4"><summary class="cursor-pointer text-lg font-semibold">${esc(q)}</summary><p class="mt-3 max-w-3xl text-lg text-ink/75">${esc(a)}</p></details>`).join('\n              ')}
            </div>
          </div>`).join('\n          ');
}

/** The hub: bergeronmaps.com/university/ */
export function hubPage(site, shell) {
  const vs = videos();
  const total = Math.round(vs.reduce((n, v) => n + v.seconds, 0) / 60);
  const body = `    <section class="bg-ink text-white">
      <div class="wrap pb-14 pt-16 lg:pt-24">
        <p class="label text-white/60">Training and support</p>
        <h1 class="mt-5 max-w-4xl text-[clamp(2.4rem,5.6vw,4.6rem)] font-bold leading-[1.02] tracking-[-0.02em]">Bergeron Maps University</h1>
        <p class="mt-7 max-w-2xl text-lg leading-relaxed text-white/75">Short videos and simple answers. Learn how to build your map, publish it and get your team on it. For managers and employees at every site that uses Bergeron Maps.</p>
        <div class="mt-9 flex flex-wrap gap-3">
          <a class="btn btn-sign" href="${vs[0].slug}/">Start with video 1</a>
          <a class="btn btn-line" href="#questions">Common questions</a>
          <a class="btn btn-line" href="#help">Get help</a>
        </div>
      </div>
    </section>

    <section id="videos" class="bg-paper text-ink">
      <div class="wrap py-20 lg:py-24">
        <h2 class="h2">Getting started</h2>
        <p class="mt-5 max-w-2xl text-lg text-ink/75">${vs.length} short videos, about ${total} minutes in all. Watch them in order. Each one shows the real app, with the words on screen.</p>
        <ol class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          ${vs.map(card).join('\n          ')}
        </ol>
      </div>
    </section>

    <section id="questions" class="border-t border-ink/10 bg-paper text-ink">
      <div class="wrap py-20 lg:py-24">
        <h2 class="h2">Common questions</h2>
        <div class="mt-12 grid gap-12 lg:grid-cols-2">
          ${faqBlock()}
        </div>
      </div>
    </section>

    ${help}`;
  return page({
    p: '../', url: `${site}university/`, shell, body,
    title: 'Bergeron Maps University | Training videos and help',
    desc: 'Short training videos, common questions and support for everyone who builds or uses a Bergeron Maps site map.',
    image: `${site}university/videos/${vs[0].slug}.png`,
  });
}

/** One video: bergeronmaps.com/university/<slug>/ */
export function videoPages(site, shell) {
  const vs = videos();
  return vs.map((v, i) => {
    const prev = vs[i - 1], next = vs[i + 1];
    const words = transcript(readFileSync(file(v.slug, 'vtt'), 'utf8'));
    const body = `    <section class="bg-ink text-white">
      <div class="wrap pb-12 pt-10 lg:pt-14">
        <a class="text-white/70 underline hover:text-white" href="../">Bergeron Maps University</a>
        <h1 class="mt-5 max-w-4xl text-[clamp(2rem,4.4vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.02em]">${esc(v.title)}</h1>
        <p class="mt-4 text-lg text-white/70">Video ${v.number} of ${vs.length}, ${clock(v.seconds)}</p>
        <video class="mt-8 aspect-video w-full max-w-5xl bg-black" controls preload="metadata" playsinline poster="../videos/${v.slug}.png" width="1920" height="1080">
          <source src="../videos/${v.slug}.mp4" type="video/mp4" />
          Your browser can't play this video. <a href="../videos/${v.slug}.mp4">Download it</a>.
        </video>
      </div>
    </section>

    <section class="bg-paper text-ink">
      <div class="wrap grid gap-12 py-16 lg:grid-cols-12 lg:py-20">
        <div class="lg:col-span-5">
          <h2 class="text-2xl font-semibold">In this video</h2>
          <ul class="mt-5 list-disc space-y-2 pl-5 text-lg text-ink/80">
            ${v.learn.map((t) => `<li>${esc(t)}</li>`).join('\n            ')}
          </ul>
          <nav class="mt-10 flex flex-col gap-3" aria-label="More videos">
            ${next ? `<a class="btn btn-ink self-start" href="../${next.slug}/">Next video: ${esc(next.title)}</a>` : `<a class="btn btn-ink self-start" href="../#questions">Common questions</a>`}
            ${prev ? `<a class="underline" href="../${prev.slug}/">Previous video: ${esc(prev.title)}</a>` : ''}
            <a class="underline" href="../">All videos</a>
          </nav>
        </div>
        <div class="lg:col-span-6 lg:col-start-7">
          <h2 class="text-2xl font-semibold">What the video says</h2>
          <p class="mt-2 text-ink/60">Read along, or use your browser to translate this page.</p>
          <div class="mt-5 space-y-4 text-lg text-ink/80">
            ${words.map((t) => `<p>${esc(t)}</p>`).join('\n            ')}
          </div>
        </div>
      </div>
    </section>

    ${help.replace(/\.\.\/accessibility\//, '../../accessibility/')}`;
    return {
      slug: v.slug,
      html: page({
        p: '../../', url: `${site}university/${v.slug}/`, shell, body,
        title: `${v.title} | Bergeron Maps University`,
        desc: `Video ${v.number} of ${vs.length}: ${v.summary}`,
        image: `${site}university/videos/${v.slug}.png`,
      }),
    };
  });
}
