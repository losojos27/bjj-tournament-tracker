# field-manual theme

The look of jiu-jitsu-brain, extracted as a drop-in kit: bone-paper light theme,
warm-charcoal dark theme, auto/light/dark toggle, JetBrains Mono everywhere.
Open `demo.html` over HTTP to see it (fonts and `color-mix()` need a real origin;
`python3 -m http.server 8352` from this folder works).

## Drop it in

1. Copy `theme.css`, `theme.js`, and `fonts/` into the app. If `fonts/` does not
   end up beside `theme.css`, fix the two `url('fonts/…')` paths in the
   `@font-face` rules.
2. Paste `head-snippet.html` into every page's `<head>`. The one-line bootstrap
   must run **before** the stylesheet so a stored override applies without a flash.
3. Pick a localStorage key (e.g. `myApp.theme`) and use it in **both** the head
   bootstrap and `<script src="theme.js" data-key="myApp.theme">`.
4. Put the toggle somewhere: `<button class="icon-btn theme-btn" data-theme-toggle type="button"></button>`.
   The glyph shows the mode (sun-moon = auto, sun = light, moon = dark).
5. PWA only: `manifest.json` carries the light ground (`background_color`
   `#ebeae8`, `theme_color` `#f1f0ed`), and the service worker should precache
   `theme.css`, `theme.js`, and both woff2 files. Never load the font from a CDN.

`window.AppTheme` exposes `active()` (`'light'`/`'dark'` as rendered), `cycle()`,
and `key`.

## How the switching works

- No override stored → nothing on `<html>`, the `prefers-color-scheme` media
  block decides.
- Override stored → `<html data-theme="light|dark">`. The `[data-theme="dark"]`
  block wins over the media block; `:root:not([data-theme="light"])` in the media
  block lets a forced light theme beat a dark OS.
- The two dark token blocks in `theme.css` are duplicates and **must be edited
  together** (CSS can't share one block between a media query and an attribute
  selector). The `KEEP IN SYNC` comments mark them.
- `theme.js` also rewrites the two `theme-color` metas so an installed app's
  status bar follows the override. If you change either ground colour, update
  the metas in every page, `GROUND` in `theme.js`, and `manifest.json`.

## Rules the look depends on

These are the decisions that make it read as one thing. Reverting any of them
toward "richer" is a regression, not polish.

- Content surfaces have **no border and no shadow**. `--hairline` is transparent
  and `--shadow-sm/md/lg` are `none`. Separation is tone and spacing. Only things
  that float (bottom nav, sheets) set their own shadow.
- The accent is **achromatic**: ink on paper, paper on charcoal. Text on an
  accent fill uses `--accent-contrast`, never a hardcoded `#fff`. Gradients
  resolve flat.
- **One typeface**, JetBrains Mono. Bold for headings and card titles, regular
  for everything else including body prose. Prose runs a size down with tighter
  leading and word spacing to compensate for mono's width.
- No uppercase or letter-spaced eyebrow labels. Weights top out around 650.
- Everything lowercase except proper nouns, as a content convention. There is no
  `text-transform` in the CSS.
- **Non-interactive things must not look tappable.** Pills are for controls
  (chips, toggles), not labels. Plain text for tags and lists.
- Near-square corners: 3–7px, even on "pill" controls.
- No inline bold in prose (`.prose strong` inherits weight). Cue tags
  (`.cue.tip/.warning/.target`) are the emphasis device.
- Colour with meaning is reserved for the category tokens (`--type-*`). Set
  `data-type="<key>"` on an element and descendants get `--type-accent`. The hue
  mapping is fixed across themes; each theme re-tunes lightness. Rename the
  keys `a`–`g` to your domain or delete the set.
- Icons are inline Lucide path data, never a CDN. SVGs in `url()` backgrounds
  can't use `currentColor`, so each theme bakes its own colour into the URI.
  Pass the `#` raw to the encoder; pre-encoding to `%23` double-escapes and
  paints nothing while looking correct in DevTools.

## What's in the kit

| file | what |
| --- | --- |
| `theme.css` | tokens (3 blocks), reset, fonts, base type, and primitives: `.card`, `.chip`, `.search-input`, `.text-toggle`, `.icon-btn`/`.theme-btn`, `.cue`, `.bottom-nav` |
| `theme.js` | the auto → light → dark cycle, storage, meta sync, cross-tab sync |
| `head-snippet.html` | the `<head>` lines and toggle markup to paste |
| `demo.html` | every primitive on one page, both themes |
| `fonts/` | JetBrains Mono Regular + Bold, latin subset woff2 |
| `LICENSES.md` | OFL for the font, ISC for the Lucide paths |

The primitives are generalised from the source app (`.exercise-card` → `.card`,
`.filter-chip` → `.chip`, `.gi-toggle` → `.text-toggle`, `.filter-btn` →
`.icon-btn`). The source's page-specific components (flow spine, hero clip,
media strip, sheets) are not included.
