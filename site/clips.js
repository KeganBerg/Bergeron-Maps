// Industry pages: the clips of the app play only while on screen, and never by
// themselves for visitors who ask for reduced motion (they see the last frame,
// and can press Play). One button pauses or plays both clips.
(function () {
  var clips = [].slice.call(document.querySelectorAll('video.clip'));
  var btn = document.querySelector('.clip-toggle');
  if (!clips.length || !btn) return;
  var still = matchMedia('(prefers-reduced-motion: reduce)');
  var wanted = !still.matches, seen = false;

  function sync() {
    clips.forEach(function (v) {
      if (wanted && seen) { v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    });
    btn.textContent = wanted ? 'Pause' : 'Play';
    btn.setAttribute('aria-label', wanted ? 'Pause the clips' : 'Play the clips');
  }
  btn.hidden = false;
  btn.addEventListener('click', function () { wanted = !wanted; seen = true; sync(); });
  still.addEventListener && still.addEventListener('change', function () { wanted = !still.matches; sync(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { seen = es.some(function (e) { return e.isIntersecting; }); sync(); }, { threshold: 0.25 })
      .observe(clips[0].closest('figure'));
  } else { seen = true; }
  sync();
})();
