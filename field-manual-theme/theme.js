/* Light/dark theming. Auto (system preference) by default; the toggle cycles
   auto → light → dark and persists the override in localStorage. The inline
   bootstrap in each page's <head> (see head-snippet.html) applies a stored
   override BEFORE the stylesheet loads so there is no flash; this file owns
   everything after that.

   Configure the storage key per app:
     <script src="theme.js" data-key="myApp.theme"></script>
   and use the SAME key in the head bootstrap. Default key: "app.theme". */
(function () {
  const script = document.currentScript;
  const KEY = (script && script.dataset.key) || 'app.theme'; // 'light' | 'dark' | absent = auto
  // Top stop of each theme's --app-bg — what the status bar sits against.
  // Keep in step with the two theme-color metas and manifest.json.
  const GROUND = { light: '#f1f0ed', dark: '#343331' };
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try {
      const t = localStorage.getItem(KEY);
      return t === 'light' || t === 'dark' ? t : null;
    } catch { return null; }
  }

  function active() {
    return stored() || (media.matches ? 'dark' : 'light');
  }

  function apply() {
    const t = stored();
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;

    // Two media-qualified theme-color metas cover auto mode on their own; a
    // manual override pins both to the forced ground so an installed PWA's
    // status bar follows the app, not the OS.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      const auto = m.media && m.media.indexOf('dark') !== -1 ? 'dark' : 'light';
      m.content = GROUND[t || auto];
    });

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.dataset.themeMode = t || 'auto';
      btn.setAttribute('aria-label', 'theme: ' + (t || 'auto'));
    });
  }

  function cycle() {
    const order = [null, 'light', 'dark'];
    const next = order[(order.indexOf(stored()) + 1) % order.length];
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {}
    apply();
  }

  media.addEventListener('change', apply);
  // Keep other open tabs in step when the toggle is used in one of them.
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-theme-toggle]')) cycle();
  });
  apply();

  window.AppTheme = { active, cycle, key: KEY };
})();
