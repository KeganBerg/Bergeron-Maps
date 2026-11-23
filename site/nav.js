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
  [].forEach.call(document.querySelectorAll('[data-calc]'), function (form) {
    var h = form.querySelector('[data-out="h"]'), d = form.querySelector('[data-out="d"]');
    function num(name, max) { var v = parseFloat(form.elements[name].value); return isFinite(v) && v > 0 ? Math.min(v, max) : 0; }
    function update() {
      var hours = num('n', 100000) * num('m', 120) * 30 / 60;
      h.textContent = Math.round(hours).toLocaleString('en-US');
      d.textContent = '$' + Math.round(hours * num('w', 1000)).toLocaleString('en-US');
    }
    // Read out as the visitor changes a number, but not the starting figures as the page loads.
    var out = form.querySelector('dl');
    form.addEventListener('input', function () {
      if (out && !out.hasAttribute('aria-live')) { out.setAttribute('aria-live', 'polite'); out.setAttribute('aria-atomic', 'true'); }
      update();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    update();
  });
})();
