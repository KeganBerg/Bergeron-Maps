/* bergeronmaps.com motion: Lenis smooth scroll + GSAP ScrollTrigger / SplitText. */
(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  // Contact form → prefilled email
  document.getElementById('contact-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = new FormData(e.target);
    var body = ['Name: ' + f.get('name'), 'Company: ' + f.get('company'), 'Email: ' + f.get('email'), 'Sites: ' + f.get('sites'), '', f.get('message')].join('\n');
    location.href = 'mailto:bergeronmaps@gmail.com?subject=' + encodeURIComponent('Demo request: ' + (f.get('company') || f.get('name'))) + '&body=' + encodeURIComponent(body);
  });

  // Nav gets a backdrop once you scroll
  var nav = document.getElementById('nav');
  var onScroll = function () { nav.classList.toggle('bg-ink/80', scrollY > 24); nav.classList.toggle('backdrop-blur-xl', scrollY > 24); nav.classList.toggle('border-b', scrollY > 24); };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Card spotlight follows the mouse
  document.querySelectorAll('.spot').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', e.clientX - r.left + 'px');
      el.style.setProperty('--my', e.clientY - r.top + 'px');
    });
  });

  // Fill the quick-builder preview rows
  document.querySelectorAll('.build-row').forEach(function (row) {
    for (var i = 0; i < 12; i++) { var s = document.createElement('i'); s.className = 'block h-9 flex-1 rounded-[3px] border border-white/40'; row.appendChild(s); }
  });

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var typed = document.getElementById('typed');
  if (reduce || !window.gsap) {
    typed.textContent = 'B16';
    document.querySelectorAll('[data-reveal]').forEach(function (el) { el.style.opacity = 1; });
    return;
  }

  gsap.registerPlugin(ScrollTrigger, SplitText);

  // Smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync
  var lenis = new Lenis({ lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length > 1 && document.querySelector(id)) { e.preventDefault(); lenis.scrollTo(id, { offset: -64, duration: 1.4 }); }
    });
  });

  // ---- Hero entrance ----
  var split = SplitText.create('#hero-title', { type: 'words,chars', mask: 'words' });
  var tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from(split.words, { yPercent: 110, duration: 1.3, stagger: 0.06 })
    .from('[data-hero]', { y: 24, opacity: 0, duration: 1, stagger: 0.1 }, '-=1.0')
    .from('#mock-window', { y: 80, rotateX: 18, opacity: 0, duration: 1.6 }, '-=0.9')
    .from('#mock .stall rect', { scaleY: 0, transformOrigin: '50% 100%', duration: 0.5, stagger: 0.015, ease: 'power3.out' }, '-=1.1')
    .from('#mock .stall text, #mock .lm', { opacity: 0, duration: 0.4, stagger: 0.01 }, '-=0.6')
    .from('#mock-phone', { y: 60, opacity: 0, duration: 1.1 }, '-=0.5');

  // Phone types B16, the space lights up, the route draws, the pin drops
  var route = document.querySelector('#mock .route');
  var len = route.getTotalLength();
  gsap.set(route, { strokeDasharray: len, strokeDashoffset: len });
  gsap.set('#mock .pin', { opacity: 0, y: -30 });
  gsap.set('#result', { opacity: 0, y: 8 });
  var query = { n: 0 };
  tl.to(query, { n: 3, duration: 0.7, ease: 'none', onUpdate: function () { typed.textContent = 'B16'.slice(0, Math.round(query.n)); } }, '+=0.1')
    .to('#mock .stall-b16 rect', { fill: '#f2b705', fillOpacity: 1, stroke: '#f2b705', duration: 0.4 })
    .to('#mock .stall-b16 text', { fill: '#070707', duration: 0.3 }, '<')
    .to('#result', { opacity: 1, y: 0, duration: 0.6 }, '<')
    .to(route, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, '<')
    .to('#mock .pin', { opacity: 1, y: 0, duration: 0.8, ease: 'bounce.out' }, '-=0.3');
  gsap.to('#mock .pin circle:first-child', { attr: { r: 30 }, opacity: 0, duration: 1.6, repeat: -1, ease: 'power1.out', delay: 5 });

  // The mockup tilts flat as you scroll past it
  gsap.to('#mock-window', { rotateX: 0, scale: 1.02, ease: 'none', scrollTrigger: { trigger: '#mock', start: 'top 80%', end: 'bottom 40%', scrub: true } });
  gsap.to('#mock-phone', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: '#mock', start: 'top 60%', end: 'bottom top', scrub: true } });

  // ---- Statement: words light up as you read ----
  var words = SplitText.create('#statement', { type: 'words' }).words;
  gsap.fromTo(words, { opacity: 0.14 }, { opacity: 1, stagger: 0.05, ease: 'none', scrollTrigger: { trigger: '#statement', start: 'top 80%', end: 'bottom 45%', scrub: true } });

  // ---- How it works: pinned on desktop, steps switch as you scroll ----
  var steps = document.querySelectorAll('.step');
  var stages = document.querySelectorAll('.stage');
  var setStep = function (i) {
    steps.forEach(function (s, j) { s.classList.toggle('bg-ink-2', i === j); s.classList.toggle('!border-line', i === j); s.style.opacity = i === j ? 1 : 0.4; });
    stages.forEach(function (s, j) { gsap.to(s, { opacity: i === j ? 1 : 0, y: i === j ? 0 : (j < i ? -24 : 24), scale: i === j ? 1 : 0.97, duration: 0.6, ease: 'power3.out', overwrite: true }); s.style.pointerEvents = i === j ? 'auto' : 'none'; });
    if (i === 0) gsap.fromTo('.build-row i', { opacity: 0, scaleY: 0.3 }, { opacity: 1, scaleY: 1, duration: 0.4, stagger: 0.012, ease: 'power2.out', overwrite: true });
    if (i === 1) gsap.fromTo('.team', { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.1, overwrite: true });
    if (i === 2) gsap.fromTo('.find', { scale: 0.6 }, { scale: 1, duration: 0.6, ease: 'back.out(3)', overwrite: true });
  };
  gsap.set(stages, { opacity: 0 });
  var current = -1;
  var go = function (i) { if (i !== current) { current = i; setStep(i); } };
  go(0);
  ScrollTrigger.matchMedia({
    '(min-width: 1024px)': function () {
      ScrollTrigger.create({
        trigger: '#how-pin', start: 'top top', end: '+=1800', pin: true,
        onUpdate: function (self) { go(Math.min(2, Math.floor(self.progress * 3))); },
      });
    },
    '(max-width: 1023px)': function () {
      steps.forEach(function (s, i) { ScrollTrigger.create({ trigger: s, start: 'top 65%', end: 'bottom 35%', onToggle: function (self) { if (self.isActive) go(i); } }); });
    },
  });

  // ---- Generic reveals ----
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%', once: true,
    onEnter: function (els) { gsap.fromTo(els, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 1, stagger: 0.08, ease: 'expo.out' }); },
  });

  // Magnetic primary button
  document.querySelectorAll('.magnetic').forEach(function (b) {
    b.addEventListener('pointermove', function (e) { var r = b.getBoundingClientRect(); gsap.to(b, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4 }); });
    b.addEventListener('pointerleave', function () { gsap.to(b, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' }); });
  });
})();
