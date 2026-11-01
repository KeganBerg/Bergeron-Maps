// Runs before the page paints. Old app links (…/#/site/…, …/#/view/…) land on this page; send them to the app.
if (location.hash.indexOf('#/') === 0) location.replace('app/' + location.search + location.hash);
document.documentElement.classList.add('js');
