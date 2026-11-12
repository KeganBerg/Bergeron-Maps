/* bergeronmaps.com: a few purposeful animations (GSAP), nothing else. */
(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  // Contact form → a prefilled email in the visitor's own mail app. Nothing is sent to a server.
  var form = document.getElementById('contact-form');
  var err = document.getElementById('form-error');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = new FormData(form);
    var name = String(f.get('name') || '').trim(), email = String(f.get('email') || '').trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      err.textContent = 'Please add your name and a valid email address.';
      err.classList.remove('hidden');
      return;
    }
    err.classList.add('hidden');
    var body = ['Name: ' + name, 'Company: ' + (f.get('company') || ''), 'Email: ' + email, 'Sites: ' + f.get('sites'), '', f.get('message') || ''].join('\n');
    location.href = 'mailto:bergeronmaps@gmail.com?subject=' + encodeURIComponent('Demo request: ' + (f.get('company') || name)) + '&body=' + encodeURIComponent(body);
  });

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hero = heroMap(reduced);
  productDemo(reduced);
  if (!window.gsap || reduced) return;

  heroIntro();

  // Section drawing draws in once when it scrolls into view.
  var sec = document.getElementById('section');
  var sl = sec.querySelectorAll('path, circle');
  sl.forEach(function (el) { var len = el.getTotalLength(); gsap.set(el, { strokeDasharray: len, strokeDashoffset: len }); });
  gsap.set(sec.querySelectorAll('text, .callout'), { opacity: 0 });
  var draw = gsap.timeline({ paused: true })
    .to(sl, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.out', stagger: { amount: 0.6 } })
    .to(sec.querySelectorAll('text, .callout'), { opacity: 1, duration: 0.5 }, '-=0.4');
  // Plays once when the top of the drawing passes 75% of the screen height.
  if (window.IntersectionObserver) {
    var seen = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { seen.disconnect(); draw.play(); }
    }, { rootMargin: '0px 0px -25% 0px' });
    seen.observe(sec);
  } else draw.play();

  /* ===== Product demo: the copy of the editor plays four short walkthroughs ===== */
  function productDemo(reduced) {
    var frame = document.getElementById('dm-frame'), am = document.getElementById('am');
    if (!frame || !am) return;
    var S = 1;
    var pins = [].slice.call(frame.querySelectorAll('.dm-dot[data-for]'));
    // Each numbered dot is pinned to the edge of the real control it points at.
    function pin() {
      pins.forEach(function (d) {
        var el = document.getElementById(d.getAttribute('data-for'));
        if (!el) return;
        var x = 0, y = 0, n = el;
        while (n && n !== am) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
        var right = d.getAttribute('data-edge') === 'right';
        var px = right ? x + el.offsetWidth : x + el.offsetWidth / 2, py = right ? y + el.offsetHeight / 2 : y + el.offsetHeight;
        d.style.left = (px / 14.4) + '%'; d.style.top = (py / 9) + '%';
      });
    }
    function fit() { S = frame.clientWidth / 1440; am.style.setProperty('--s', S); pin(); }
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(frame); else addEventListener('resize', fit);
    if (!window.gsap) return;

    var $ = function (id) { return document.getElementById(id); };
    var world = $('dm-world'), view = $('am-view'), cursor = $('am-cursor'), tap = $('am-tap');
    var tabs = [].slice.call(document.querySelectorAll('.dm-steps [role=tab]'));
    var dots = [].slice.call(document.querySelectorAll('.dm-dot'));
    var rowD = [].slice.call(world.querySelectorAll('.sp[data-row="D"]'));
    var c7 = world.querySelector('.sp[data-label="1C7"]');
    var live = $('dm-live');

    // Centre of any element, in the copy's own 1440x900 pixels.
    function at(el, dx, dy) {
      var f = am.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: (r.left - f.left + r.width / 2) / S + (dx || 0), y: (r.top - f.top + r.height / 2) / S + (dy || 0) };
    }
    function centre(sp) { var m = sp.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/); return { x: +m[1], y: +m[2] }; }
    function type(tl, el, text, dur) {
      var o = { n: 0 };
      tl.to(o, { n: text.length, duration: dur, ease: 'none', onUpdate: function () { el.textContent = text.slice(0, Math.round(o.n)); } });
    }
    function move(tl, p, dur, pos) { return tl.to(cursor, { x: p.x, y: p.y, duration: dur || 0.7, ease: 'power2.inOut' }, pos); }
    function click(tl) { return tl.to(cursor, { scale: 0.8, duration: 0.08, yoyo: true, repeat: 1, transformOrigin: '20% 10%' }); }

    // Everything back to the finished Level 1 map.
    function base() {
      gsap.set([rowD, '#dm-drop', '#dm-stairs', '#dm-elevator', '#dm-ramp'], { opacity: 1 });
      gsap.set('#dm-drop', { opacity: 0 });
      gsap.set([view], { opacity: 1 });
      gsap.set(['#am-tip', '#am-team', '#am-pubnote', '#am-ghost', '#am-res', '#am-info', tap], { opacity: 0 });
      gsap.set('#am-phone', { autoAlpha: 0, x: 60 });
      gsap.set(cursor, { opacity: 1, scale: 1 });
      $('am-draw').classList.remove('on'); $('am-search').classList.remove('on');
      $('am-sq').textContent = ''; $('am-sph').style.display = ''; $('am-lib').style.display = ''; $('am-results').style.display = 'none';
      [].forEach.call(document.querySelectorAll('.am-tile.hot'), function (t) { t.classList.remove('hot'); });
      $('am-pub').textContent = 'Publish';
      if (pins) pin(); $('am-pub').classList.remove('done');
      $('am-saved').querySelector('b').textContent = 'Saved';
      $('am-l1').classList.add('on'); $('am-l3').classList.remove('on'); $('am-l3').style.display = 'none';
      $('am-code').textContent = ''; $('am-vq').textContent = ''; $('am-vph').style.display = '';
      c7.classList.remove('hit'); gsap.set('#am-ring', { opacity: 0 });
      var b = world.getAttribute('data-box').split(' ').map(Number);
      $('am-vmap').setAttribute('viewBox', [b[0] - 20, b[1] - 20, b[2] + 40, b[3] + 40].join(' '));
    }

    var demos = [
      function drawRow(tl) {
        gsap.set(rowD, { opacity: 0 });
        gsap.set(cursor, { x: 760, y: 520 });
        var first = at(rowD[0]), last = at(rowD[rowD.length - 1]);
        move(tl, at($('am-draw'), 40), 0.8);
        click(tl).call(function () { $('am-draw').classList.add('on'); });
        move(tl, { x: first.x - 22, y: first.y + 30 }, 0.8);
        tl.to(cursor, { x: last.x + 22, duration: 1.8, ease: 'none' });
        tl.to(rowD, { opacity: 1, duration: 0.12, stagger: 1.8 / rowD.length }, '<');
        var tip = $('am-tip'), lc = centre(rowD[rowD.length - 1]);
        tl.call(function () { $('am-draw').classList.remove('on'); $('am-saved').querySelector('b').textContent = 'Saved'; });
        tl.set(tip, { attr: { transform: 'translate(' + (260 + 1.03 * (lc.x + 40)) + ' ' + (104 + 1.03 * lc.y - 17) + ')' } });
        tl.to(tip, { opacity: 1, duration: 0.3 }).to({}, { duration: 2 });
      },
      function addLandmarks(tl) {
        gsap.set(cursor, { x: 700, y: 400 });
        var drop = $('dm-drop'), stairsTile = document.querySelector('#am-results .am-stairs');
        move(tl, at($('am-search'), -40), 0.8);
        click(tl).call(function () { $('am-search').classList.add('on'); $('am-sph').style.display = 'none'; });
        type(tl, $('am-sq'), 'stair', 0.6);
        tl.call(function () { $('am-lib').style.display = 'none'; $('am-results').style.display = 'grid'; });
        tl.to({}, { duration: 0.25 });
        // Measure the result tile while the results are briefly shown, then put the library back.
        $('am-lib').style.display = 'none'; $('am-results').style.display = 'grid';
        var t = at(stairsTile), d = at(drop), g = $('am-ghost');
        $('am-lib').style.display = ''; $('am-results').style.display = 'none';
        g.innerHTML = drop.innerHTML;
        move(tl, t, 0.7);
        tl.call(function () { stairsTile.classList.add('hot'); });
        tl.set(g, { x: t.x - 26, y: t.y - 52, opacity: 0.85, scale: 0.45 });
        tl.to(cursor, { x: d.x, y: d.y, duration: 1, ease: 'power2.inOut' });
        tl.to(g, { x: d.x - 26, y: d.y - 52, scale: 1, duration: 1, ease: 'power2.inOut' }, '<');
        tl.set(g, { opacity: 0 }).to(drop, { opacity: 1, duration: 0.2 }, '<');
        tl.call(function () { stairsTile.classList.remove('hot'); }).to({}, { duration: 0.6 });
        var add = $('am-addfloor');
        tl.to(cursor, { x: function () { return at(add).x; }, y: function () { return at(add).y; }, duration: 0.9, ease: 'power2.inOut' });
        click(tl).call(function () {
          $('am-l3').style.display = 'inline-flex'; $('am-l3').classList.add('on'); $('am-l1').classList.remove('on');
        });
        tl.to(view, { opacity: 0, duration: 0.3 }, '<').to({}, { duration: 1.2 });
        tl.to(cursor, { x: function () { return at($('am-l1')).x; }, y: function () { return at($('am-l1')).y; }, duration: 0.9, ease: 'power2.inOut' });
        click(tl).call(function () { $('am-l1').classList.add('on'); $('am-l3').classList.remove('on'); });
        tl.to(view, { opacity: 1, duration: 0.3 }, '<').to({}, { duration: 1.4 });
      },
      function publish(tl) {
        gsap.set(cursor, { x: 900, y: 300 });
        $('am-saved').querySelector('b').textContent = 'Saved';
        move(tl, at($('am-pub')), 0.9);
        click(tl).call(function () { $('am-pub').textContent = 'Publishing…'; });
        tl.to({}, { duration: 0.7 }).call(function () { $('am-pub').innerHTML = '&#10003; Published'; $('am-pub').classList.add('done'); });
        tl.to('#am-pubnote', { opacity: 1, duration: 0.3 });
        tl.to(cursor, { x: 760, y: 560, duration: 0.8, ease: 'power2.inOut' });
        tl.fromTo('#am-team', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4 }, '-=0.3');
        type(tl, $('am-code'), '7KQ4XM', 0.7);
        tl.to({}, { duration: 2.4 });
      },
      function findOnPhone(tl) {
        gsap.set(cursor, { x: 1000, y: 300 });
        var cc = centre(c7);
        move(tl, at($('am-preview')), 0.8);
        click(tl);
        tl.to('#am-phone', { autoAlpha: 1, x: 0, duration: 0.5, ease: 'power2.out' }).to(cursor, { opacity: 0, duration: 0.2 }, '<');
        tl.call(function () { $('am-vph').style.display = 'none'; });
        type(tl, $('am-vq'), '1C7', 0.6);
        tl.to('#am-res', { opacity: 1, duration: 0.2 });
        tl.call(function () { var p = at($('am-res')); gsap.set(tap, { x: p.x, y: p.y }); });
        tl.to(tap, { opacity: 1, scale: 1.2, duration: 0.2, yoyo: true, repeat: 1 }, '+=0.4');
        tl.to('#am-res', { opacity: 0, duration: 0.15 });
        tl.call(function () { c7.classList.add('hit'); gsap.set('#am-ring', { attr: { x: cc.x - 29, y: cc.y - 51, width: 58, height: 102 }, opacity: 1 }); });
        tl.to('#am-vmap', { attr: { viewBox: (cc.x - 110) + ' ' + (cc.y - 150) + ' 220 300' }, duration: 1.1, ease: 'power2.inOut' });
        tl.fromTo('#am-info', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, '-=0.2');
        tl.to({}, { duration: 2.6 });
      },
    ];

    var cur = -1, tl = null, next = null, auto = true, visible = false;
    function select(i) {
      tabs.forEach(function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); gsap.set(t.querySelector('.dm-bar'), { scaleX: 0 }); });
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      live.textContent = tabs[i].textContent;
    }
    function play(i) {
      if (next) next.kill();
      if (tl) tl.kill();
      cur = i; select(i); base();
      tl = gsap.timeline({ paused: true, onComplete: function () { if (auto) next = gsap.delayedCall(0.8, function () { play((cur + 1) % demos.length); }); } });
      demos[i](tl);
      var bar = tabs[i].querySelector('.dm-bar');
      tl.eventCallback('onUpdate', function () { gsap.set(bar, { scaleX: tl.progress() }); });
      if (reduced) { tl.progress(1); gsap.set(cursor, { opacity: 0 }); gsap.set(bar, { scaleX: 1 }); return; }
      if (visible) tl.play();
    }
    function choose(i) { auto = !reduced; play(i); }
    tabs.forEach(function (t, i) { t.addEventListener('click', function () { choose(i); }); });
    dots.forEach(function (d) { d.addEventListener('click', function () { choose(+d.getAttribute('data-step')); }); });
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (cur < 0) { if (visible) play(0); return; }
      if (!tl) return;
      if (visible) { if (tl.progress() < 1) tl.play(); if (next) next.resume(); }
      else { tl.pause(); if (next) next.pause(); }
    }, { threshold: 0.35 }).observe(frame);
    base();
  }

  /* ===== Hero: blueprint draws, the real map wipes in over it, then the phone finds things ===== */
  function heroIntro() {
    var plan = document.getElementById('plan'), real = document.getElementById('hr-real');
    if (!plan || !real) return;
    var lines = plan.querySelectorAll('path, rect, circle');
    lines.forEach(function (el) { var l = el.getTotalLength ? el.getTotalLength() : 0; if (l) gsap.set(el, { strokeDasharray: l, strokeDashoffset: l }); });
    gsap.set(plan.querySelectorAll('text'), { opacity: 0 });
    gsap.set(real, { clipPath: 'inset(0 100% 0 0)' });
    gsap.timeline({ delay: 0.15, onComplete: function () { gsap.set(real, { clearProps: 'clipPath' }); if (hero) hero.start(); } })
      .to(lines, { strokeDashoffset: 0, duration: 1.3, ease: 'power2.inOut', stagger: { amount: 0.7 } })
      .to(plan.querySelectorAll('text'), { opacity: 1, duration: 0.4, stagger: { amount: 0.3 } }, '-=0.6')
      .to(real, { clipPath: 'inset(0 0% 0 0)', duration: 1.2, ease: 'power2.inOut' }, '+=0.3');
  }

  function heroMap(reduced) {
    var real = document.getElementById('hr-real'), world = document.getElementById('hr-world');
    if (!real || !world) return null;
    var hp = document.getElementById('hp'), wrap = document.getElementById('hp-wrap');
    function fitPhone() { hp.style.setProperty('--hs', wrap.clientWidth / 330); }
    fitPhone();
    if (window.ResizeObserver) new ResizeObserver(fitPhone).observe(wrap); else addEventListener('resize', fitPhone);

    var g = window.gsap && !reduced ? window.gsap : null;
    var items = [].slice.call(world.querySelectorAll('[data-find]'));
    var q = document.getElementById('hp-q'), res = document.getElementById('hp-res'), form = document.getElementById('hp-form');
    var pmap = document.getElementById('hp-map'), pring = document.getElementById('hp-ring'), ring = document.getElementById('hr-ring');
    var route = document.getElementById('hr-route'), it = document.getElementById('hp-it'), idt = document.getElementById('hp-id');
    var box = world.getAttribute('data-box').split(' ').map(Number);
    var lanes = world.getAttribute('data-lanes').split(',').map(Number), mainX = +world.getAttribute('data-main');
    var entry = items.filter(function (e) { return e.getAttribute('data-find') === 'Entrance'; })[0];
    var whole = [box[0] - 20, box[1] - 20, box[2] + 40, box[3] + 40];
    pmap.setAttribute('viewBox', whole.join(' '));
    var current = null, auto = !reduced, timer = null;

    function num(el, k) { return +el.getAttribute('data-' + k); }
    function setView(v, animate) {
      if (animate && g) g.to(pmap, { attr: { viewBox: v.join(' ') }, duration: 0.9, ease: 'power2.inOut' });
      else pmap.setAttribute('viewBox', v.join(' '));
    }
    function pathTo(el) {
      var tx = num(el, 'x'), ty = num(el, 'y');
      var ex = num(entry, 'x'), ey = num(entry, 'y');
      var lane = lanes.reduce(function (a, b) { return Math.abs(b - ty) < Math.abs(a - ty) ? b : a; });
      return 'M' + ex + ' ' + (ey - 10) + 'V' + lane + 'H' + tx + 'V' + (ty + (ty < lane ? num(el, 'h') / 2 : -num(el, 'h') / 2));
    }
    function select(el, how) {
      if (current) current.classList.remove('hit');
      current = el;
      var x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'w'), h = num(el, 'h');
      if (el.classList.contains('sp')) el.classList.add('hit');
      [ring, pring].forEach(function (r) { r.setAttribute('x', x - w / 2 - 7); r.setAttribute('y', y - h / 2 - 7); r.setAttribute('width', w + 14); r.setAttribute('height', h + 14); });
      it.textContent = el.getAttribute('data-find');
      var kind = el.getAttribute('data-kind');
      idt.textContent = 'Level 1';
      if (kind && kind !== el.getAttribute('data-find')) { var sep = document.createElement('i'); sep.className = 'sep'; sep.textContent = '\u00b7'; idt.appendChild(sep); idt.appendChild(document.createTextNode(kind)); }
      route.setAttribute('d', el === entry ? 'M0 0' : pathTo(el));
      var vw = 260, vh = 340;
      setView([x - vw / 2, y - vh / 2, vw, vh], true);
      if (g) {
        var len = route.getTotalLength();
        g.fromTo(route, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1, ease: 'power1.inOut' });
        g.fromTo([ring, pring], { opacity: 0 }, { opacity: 1, duration: 0.3, delay: 0.2 });
        g.fromTo('#hp-info', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, delay: 0.5 });
      }
      if (how !== 'type') { q.value = el.getAttribute('data-find'); }
      res.innerHTML = '';
    }
    function matches(text) {
      var t = text.trim().toLowerCase();
      if (!t) return [];
      return items.filter(function (e) { return e.getAttribute('data-find').toLowerCase().indexOf(t) >= 0 || e.getAttribute('data-kind').toLowerCase().indexOf(t) >= 0; })
        .sort(function (a, b) { var A = a.getAttribute('data-find').toLowerCase(), B = b.getAttribute('data-find').toLowerCase(); return (A === t ? -1 : 0) - (B === t ? -1 : 0) || (A.indexOf(t) - B.indexOf(t)) || A.length - B.length; })
        .slice(0, 5);
    }
    function list(text) {
      var m = matches(text);
      res.innerHTML = '';
      if (!text.trim()) return;
      if (!m.length) { var li = document.createElement('li'); li.className = 'none'; li.textContent = 'Nothing called “' + text.trim() + '” on this level.'; res.appendChild(li); return; }
      m.forEach(function (e, i) {
        var li = document.createElement('li'), b = document.createElement('button'), n = document.createElement('b'), s = document.createElement('span');
        b.type = 'button'; if (i === 0) b.className = 'on';
        n.textContent = e.getAttribute('data-find'); s.textContent = 'Level 1';
        b.appendChild(n); b.appendChild(s);
        b.addEventListener('click', function () { stop(); select(e); });
        li.appendChild(b); res.appendChild(li);
      });
    }
    function stop() { auto = false; if (timer) { clearTimeout(timer); timer = null; } if (g) g.killTweensOf(typer); }
    var typer = { n: 0 };
    var demo = ['1C12', 'Key box', 'EV charger 1', 'Parking office', '1A7'], step = 0;
    function next() {
      if (!auto) return;
      var text = demo[step++ % demo.length];
      var target = matches(text)[0];
      q.value = '';
      typer.n = 0;
      g.to(typer, { n: text.length, duration: 0.12 * text.length, ease: 'none',
        onUpdate: function () { q.value = text.slice(0, Math.round(typer.n)); list(q.value); },
        onComplete: function () { timer = setTimeout(function () { if (!auto) return; select(target); timer = setTimeout(next, 3200); }, 450); } });
    }

    items.forEach(function (e) {
      e.addEventListener('click', function () { stop(); select(e); });
    });
    q.addEventListener('input', function () { stop(); list(q.value); });
    q.addEventListener('focus', stop);
    form.addEventListener('submit', function (ev) { ev.preventDefault(); stop(); var m = matches(q.value)[0]; if (m) select(m, 'type'); });
    real.addEventListener('pointerdown', stop);

    // Initial state: the space from the headline example, found.
    var first = matches('1C12')[0];
    if (!g) { if (first) { select(first); q.value = ''; } return null; }
    window.gsap.set('#hp-info', { opacity: 0 });
    return { start: function () { if (auto) { timer = setTimeout(next, 600); } } };
  }
})();
