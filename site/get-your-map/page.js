// Get Your Map Now: the purchase page (site/get-your-map/index.html).
// Step 1 picks the plan and shows the price live; step 2 takes the buyer's details and posts them to
// POST /api/checkout (worker/stripe.js), which answers a Stripe Checkout link; Stripe sends the buyer
// back here with ?checkout=done or ?checkout=canceled. Prices here are for display only: Stripe
// charges the prices stored in Stripe. Talk to Alex goes through POST /api/contact like the home page form.
(function () {
  'use strict';
  var SETUP = 2500, MONTHLY = 500, MAX = 20, ASSISTED_FROM = 5, TERMS = ['6', '12'];
  var KINDS = { valet: 'Valet', dealership: 'Dealership', school: 'School', warehouse: 'Warehouse', office: 'Other' };
  var KEY = 'gymn-order';

  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var setText = function (sel, text) { all(sel).forEach(function (el) { el.textContent = text; }); };
  var money = function (v) { return '$' + v.toLocaleString('en-US'); };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var monthlyStarts = new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  var state = { n: 1, term: '12', kind: 'valet' };

  // Saved between the details step and Stripe, so a canceled payment comes back with its choices.
  function save(extra) {
    try { sessionStorage.setItem(KEY, JSON.stringify(Object.assign({}, state, extra || {}))); } catch { /* private mode */ }
  }
  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
  }
  function apply(o) {
    if (!o) return;
    var n = parseInt(o.n, 10);
    if (n >= 1 && n <= MAX) state.n = n;
    if (TERMS.indexOf(String(o.term)) >= 0) state.term = String(o.term);
    if (KINDS[o.kind]) state.kind = o.kind;
  }

  function label() { return 'Setup, ' + state.n + (state.n === 1 ? ' location' : ' locations × $2,500'); }
  function render() {
    $('locs').textContent = state.n;
    $('minus').disabled = state.n <= 1;
    $('plus').disabled = state.n >= MAX;
    var assisted = state.n >= ASSISTED_FROM;
    $('assisted').hidden = !assisted;
    all('.o-assist').forEach(function (el) { el.hidden = !assisted; });
    setText('.o-n', label());
    setText('.o-setup', money(SETUP * state.n));
    setText('.o-today', money(SETUP * state.n));
    setText('.o-month', money(MONTHLY * state.n) + ' a month');
    setText('.o-date', monthlyStarts);
    setText('.o-term', state.term);
    all('input[name=term]').forEach(function (r) { r.checked = r.value === state.term; });
    all('#biz .tile').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-kind') === state.kind)); });
    // The hero shows the chosen site type's sample map on each device (data-shot: editor, tablet, phone).
    all('.devices img').forEach(function (img) {
      var src = '/img/industries/' + state.kind + '-' + img.getAttribute('data-shot') + '.webp';
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  }

  function show(step) {
    ['s1', 's2', 's4'].forEach(function (id) { $(id).hidden = id !== 's' + step; });
    for (var i = 1; i <= 4; i++) $('st' + i).className = i === step ? 'on' : i < step ? 'past' : '';
    var bar = document.querySelector('.stepbar');
    if (window.scrollY > bar.offsetTop) window.scrollTo(0, bar.offsetTop);
  }

  function quoteLink() {
    return location.origin + '/get-your-map/?n=' + state.n + '&term=' + state.term + '&site=' + state.kind;
  }
  function quoteText() {
    return [
      'Bergeron Maps quote',
      '',
      label() + ': ' + money(SETUP * state.n) + ' (one-time setup fee, non-refundable)',
      'Due today: ' + money(SETUP * state.n),
      'Then ' + money(MONTHLY * state.n) + ' a month from ' + monthlyStarts + ', on a ' + state.term + '-month term',
      state.n >= ASSISTED_FROM ? 'Assisted setup included: we help build your first maps.' : '',
      '',
      'Open this order, ready to pay:',
      quoteLink(),
    ].filter(function (l, i, a) { return l !== '' || a[i - 1] !== ''; }).join('\n');
  }

  function fail(el, msg) { el.textContent = msg; el.hidden = false; }

  function start() {
    // Choices can come from a quote link (?n=3&term=6&site=valet) or from before a canceled payment.
    var q = new URLSearchParams(location.search);
    var saved = load();
    apply(saved);
    apply({ n: q.get('n'), term: q.get('term'), kind: q.get('site') });
    if (saved) { $('co').value = saved.company || ''; $('nm').value = saved.name || ''; $('em').value = saved.email || ''; $('ref').value = saved.ref || ''; }
    render();

    $('plus').onclick = function () { if (state.n < MAX) { state.n++; render(); } };
    $('minus').onclick = function () { if (state.n > 1) { state.n--; render(); } };
    all('input[name=term]').forEach(function (r) { r.onchange = function () { if (r.checked) { state.term = r.value; render(); } }; });
    all('#biz .tile').forEach(function (b) { b.onclick = function () { state.kind = b.getAttribute('data-kind'); render(); }; });

    // Email this quote: opens the buyer's own email app with the quote filled in, or copies the link.
    function openQuote(open) {
      $('quote-box').hidden = !open; $('quote').hidden = open;
      $('quote').setAttribute('aria-expanded', String(open));
      if (open) { $('quote-form').hidden = false; $('quote-done').hidden = true; $('q-err').hidden = true; $('q-em').focus(); } else $('quote').focus();
    }
    function quoteDone(title, text) {
      $('q-done-title').textContent = title; $('q-done-text').textContent = text;
      $('quote-form').hidden = true; $('quote-done').hidden = false; $('quote-done').focus();
    }
    $('quote').onclick = function () { openQuote(true); };
    $('q-cancel').onclick = function () { openQuote(false); };
    $('quote-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var to = $('q-em').value.trim();
      if (!EMAIL.test(to)) { $('q-em').setAttribute('aria-invalid', 'true'); return fail($('q-err'), 'Enter an email address, like name@company.com.'); }
      $('q-em').removeAttribute('aria-invalid');
      location.href = 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@') + '?subject=' + encodeURIComponent('Your Bergeron Maps quote') + '&body=' + encodeURIComponent(quoteText());
      quoteDone('Quote ready to send', 'Your email app opened with the quote to ' + to + '. Press Send there. The link inside keeps these choices.');
    });
    $('q-copy').onclick = function () {
      var link = quoteLink();
      var ok = function () { quoteDone('Link copied', 'Paste it anywhere. It opens this order with the same choices.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, function () { fail($('q-err'), link); });
      else fail($('q-err'), link);
    };
    $('q-again').onclick = function () { $('q-em').value = ''; $('quote-form').hidden = false; $('quote-done').hidden = true; $('q-em').focus(); };

    // Talk to Alex: the same lead email as the home page form.
    $('talk').onclick = function (e) {
      e.preventDefault();
      $('talk-box').hidden = false; $('talk-form').hidden = false; $('talk-done').hidden = true;
      if (!$('t-n').value) $('t-n').value = state.n >= MAX ? '' : String(state.n);
      $('t-nm').focus();
    };
    $('t-cancel').onclick = function () { $('talk-box').hidden = true; $('talk').focus(); };
    $('talk-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('t-nm').value.trim(), email = $('t-em').value.trim();
      if (!name || !EMAIL.test(email)) return fail($('t-err'), 'Add your name and a work email so Alex can reply.');
      $('t-err').hidden = true; $('t-send').disabled = true;
      fetch('/api/contact', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          Name: name, 'Work email': email, Company: $('t-co').value.trim(), Industry: KINDS[state.kind],
          'Number of sites': $('t-n').value.trim(),
          'Anything else': 'Asked to talk to Alex from the Get Your Map Now page (' + state.term + '-month term selected).',
          Page: location.href,
        }),
      }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (out) {
        $('t-send').disabled = false;
        if (!out.success) return fail($('t-err'), "That didn't send. Please email bergeronmaps@gmail.com instead.");
        $('t-to').textContent = email; $('talk-form').hidden = true; $('talk-done').hidden = false; $('talk-done').focus();
      }, function () { $('t-send').disabled = false; fail($('t-err'), "That didn't send. Check your connection and try again."); });
    });

    $('go2').onclick = function () { show(2); $('co').focus(); };
    $('back1').onclick = function () { show(1); };
    $('f2').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('f2-err'), company = $('co').value.trim(), name = $('nm').value.trim(), email = $('em').value.trim(), ref = $('ref').value.trim();
      ['co', 'nm', 'em'].forEach(function (id) { $(id).removeAttribute('aria-invalid'); });
      if (!company) { $('co').setAttribute('aria-invalid', 'true'); $('co').focus(); return fail(err, 'Add your company name.'); }
      if (!name) { $('nm').setAttribute('aria-invalid', 'true'); $('nm').focus(); return fail(err, 'Add your name.'); }
      if (!EMAIL.test(email)) { $('em').setAttribute('aria-invalid', 'true'); $('em').focus(); return fail(err, 'Enter a work email, like name@company.com.'); }
      err.hidden = true;
      save({ company: company, name: name, email: email, ref: ref });
      var btn = $('pay');
      btn.disabled = true; btn.textContent = 'Opening secure payment…';
      var body = { company: company, name: name, email: email, locations: state.n, term: Number(state.term), returnPath: '/get-your-map/' };
      if (ref) body.referralCode = ref;
      fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (out) {
          if (out.success && out.url) { show(3); location.href = out.url; return; }
          btn.disabled = false; btn.textContent = 'Continue to secure payment';
          var msg = out.error === 'Not open yet' || out.error === 'Not set up'
            ? 'Online payment isn’t open yet. Email bergeronmaps@gmail.com and we’ll set up your order.'
            : (out.error || 'Something went wrong.') + '.';
          fail(err, msg.replace(/\.\.$/, '.'));
        }, function () {
          btn.disabled = false; btn.textContent = 'Continue to secure payment';
          fail(err, 'We couldn’t reach the payment service. Check your connection and try again.');
        });
    });

    // Back from Stripe.
    var back = q.get('checkout');
    if (back === 'done') {
      $('s4-assisted').hidden = state.n < ASSISTED_FROM;
      // Straight into the app, with the address they paid with already filled in on sign-in.
      if (saved && EMAIL.test(saved.email || '')) {
        $('s4-email').textContent = saved.email;
        $('s4-go').setAttribute('href', '/app/?email=' + encodeURIComponent(saved.email));
      }
      setText('.s4-date', monthlyStarts);
      try { sessionStorage.removeItem(KEY); } catch { /* private mode */ }
      show(4);
      $('s4-title').focus();
    } else if (back === 'canceled') {
      $('canceled').hidden = false;
    }
    if (back) history.replaceState(null, '', location.pathname);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
