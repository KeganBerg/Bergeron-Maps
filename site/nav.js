/* bergeronmaps.com, every page: the Industries menu, the phone menu, the footer year and the savings calculator. */
(function () {
  [].forEach.call(document.querySelectorAll('[data-year]'), function (el) { el.textContent = new Date().getFullYear(); });

  // Industries menu: opens on hover with a mouse (CSS), and on click, Enter or Space for touch and keyboards.
  var drop = document.querySelector('[data-menu]');
  var dropBtn = drop && drop.querySelector('button');
  function setDrop(open) { if (!drop) return; drop.classList.toggle('open', open); dropBtn.setAttribute('aria-expanded', String(open)); }
  if (drop) {
    dropBtn.addEventListener('click', function () { setDrop(!drop.classList.contains('open')); });
    drop.addEventListener('focusout', function (e) { if (!drop.contains(e.relatedTarget)) setDrop(false); });
    drop.addEventListener('mouseleave', function () { setDrop(false); });
  }

  // Phone and tablet menu.
  var burger = document.querySelector('.nav-burger'), mnav = document.getElementById('mnav');
  function setMenu(open) { if (!mnav) return; mnav.classList.toggle('open', open); burger.setAttribute('aria-expanded', String(open)); }
  if (burger && mnav) {
    burger.addEventListener('click', function () { setMenu(!mnav.classList.contains('open')); });
    // Same-page links (#how) close the menu as they scroll.
    mnav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (drop && drop.classList.contains('open')) { setDrop(false); dropBtn.focus(); }
    if (mnav && mnav.classList.contains('open')) { setMenu(false); burger.focus(); }
  });
  document.addEventListener('click', function (e) {
    if (drop && !drop.contains(e.target)) setDrop(false);
    if (mnav && mnav.classList.contains('open') && !mnav.contains(e.target) && !burger.contains(e.target)) setMenu(false);
  });

  // Savings calculator on the dealership and valet pages: the visitor's own numbers, nothing stored or sent.
  // The results count up or down to each new figure (400ms, ease-out) so the change reads as a change,
  // not a flicker. Visitors who ask for reduced motion get the new figure straight away.
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function countTo(el, prefix) {
    var shown = 0, target = 0, frame = 0;
    function paint(v) { el.textContent = prefix + Math.round(v).toLocaleString('en-US'); }
    return function (next, animate) {
      target = next;
      cancelAnimationFrame(frame);
      if (!animate || (still && still.matches) || shown === target) { shown = target; paint(target); return; }
      var from = shown, start = 0;
      frame = requestAnimationFrame(function step(now) {
        if (!start) start = now;
        var t = Math.min((now - start) / 400, 1);
        shown = from + (target - from) * (1 - Math.pow(1 - t, 3));
        paint(shown);
        if (t < 1) frame = requestAnimationFrame(step);
      });
    };
  }
  [].forEach.call(document.querySelectorAll('[data-calc]'), function (form) {
    var setHours = countTo(form.querySelector('[data-out="h"]'), '');
    var setCost = countTo(form.querySelector('[data-out="d"]'), '$');
    // Screen readers hear the final figures once, from this hidden line, rather than every step of the count.
    var said = document.createElement('p');
    said.setAttribute('aria-live', 'polite');
    said.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    form.appendChild(said);
    function num(name, max) { var v = parseFloat(form.elements[name].value); return isFinite(v) && v > 0 ? Math.min(v, max) : 0; }
    function update(animate) {
      var exact = num('n', 100000) * num('m', 120) * 30 / 60;
      var hours = Math.round(exact), cost = Math.round(exact * num('w', 1000));
      setHours(hours, animate);
      setCost(cost, animate);
      // Only as the visitor changes a number, not the starting figures as the page loads.
      if (animate) said.textContent = hours.toLocaleString('en-US') + ' labor hours a month, $' + cost.toLocaleString('en-US') + ' labor cost a month.';
    }
    form.addEventListener('input', function () { update(true); });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    update(false);
  });
})();
