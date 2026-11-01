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

  if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.registerPlugin(ScrollTrigger);

  // Hero: the plan draws itself, the phone types a space, it lights up and the route draws in.
  var plan = document.getElementById('plan');
  var lines = plan.querySelectorAll('path:not(.route), rect:not([fill="transparent"])');
  lines.forEach(function (el) {
    var len = el.getTotalLength ? el.getTotalLength() : 0;
    if (len) gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
  });
  var route = plan.querySelector('.route');
  var rlen = route.getTotalLength();
  gsap.set(route, { strokeDasharray: rlen, strokeDashoffset: rlen });
  var found = plan.querySelector('.stall-found-box');
  gsap.set(found, { opacity: 0 });
  var typed = document.getElementById('typed');
  typed.textContent = '';
  gsap.set('#result', { autoAlpha: 0 });
  gsap.set(plan.querySelectorAll('text'), { opacity: 0 });

  var q = { n: 0 };
  gsap.timeline({ delay: 0.2 })
    .to(lines, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut', stagger: { amount: 0.8 } })
    .to(plan.querySelectorAll('text'), { opacity: 1, duration: 0.5, stagger: { amount: 0.4 } }, '-=0.6')
    .to(q, { n: 3, duration: 0.6, ease: 'none', onUpdate: function () { typed.textContent = 'C12'.slice(0, Math.round(q.n)); } })
    .to(found, { opacity: 1, duration: 0.25 })
    .to('#result', { autoAlpha: 1, duration: 0.3 }, '<')
    .to(route, { strokeDashoffset: 0, duration: 1.1, ease: 'power1.inOut' }, '<');

  // Section drawing draws in once when it scrolls into view.
  var sec = document.getElementById('section');
  var sl = sec.querySelectorAll('path, circle');
  sl.forEach(function (el) { var len = el.getTotalLength(); gsap.set(el, { strokeDasharray: len, strokeDashoffset: len }); });
  gsap.set(sec.querySelectorAll('text, .callout'), { opacity: 0 });
  gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top 75%', once: true } })
    .to(sl, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.out', stagger: { amount: 0.6 } })
    .to(sec.querySelectorAll('text, .callout'), { opacity: 1, duration: 0.5 }, '-=0.4');

  // Screenshot callout pins appear one by one.
  gsap.from('.pin', { scale: 0, duration: 0.35, ease: 'back.out(2.5)', stagger: 0.12, scrollTrigger: { trigger: '#product figure', start: 'top 70%', once: true } });
})();
