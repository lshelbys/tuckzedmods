/**
 * tuckzed mods — Early head script
 * Loaded synchronously at the very top of <head> on every page so it runs
 * before the first paint. Keep this file tiny.
 *
 *  1. Applies the saved colour theme (prevents a light → dark flash).
 *  2. Strips the ".html" suffix from the address bar for clean URLs.
 */
(function () {
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (!theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (_) {}

  try {
    var path = window.location.pathname;
    if (path.endsWith('.html')) {
      var clean = path.replace(/\.html$/, '');
      if (clean.endsWith('/index')) clean = clean.slice(0, -6) || '/';
      window.history.replaceState(null, '', clean + window.location.search + window.location.hash);
    }
  } catch (_) {}
})();
