# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free static web app (`index.html` plus the `field-manual-theme/` kit) that tracks
BJJ tournament brackets and projects mat times, fed by FloArena. First event: ADCC World
Championship 2026, Kraków, Sept 12–13. Lee uses it on a phone in the arena; other people get
the link. The repo name is deliberately generic because it will cover more than ADCC.

- **Live page (the one to share):** https://losojos27.github.io/bjj-tournament-tracker/
- Claude artifact snapshot (no live feeds, results as of last republish):
  https://claude.ai/code/artifact/78d4a9a4-2636-4548-9de6-b03be85ae72e

## Commands

```
node scripts/sync.mjs            # FloArena -> data/results.json (Node 18+, no deps)
node scripts/queue-test.js       # the one test: schedule engine on its own small fixture (Flo lists, live bouts, DQs)
python3 -m http.server 8000      # serve locally; open http://localhost:8000 (file:// breaks fetch and fonts)
node --check <(sed -n '/<script id="app">/,/<\/script>/p' index.html | sed '1d;$d')   # syntax-check the app script
scripts/build-artifact.sh        # index.html -> dist/artifact.html for the artifact host
gh workflow run sync.yml         # trigger a sync on GitHub now
gh run list -w sync.yml -L5      # is the cron firing?
```

The app script is `<script id="app">`; both the `--check` command and `queue-test.js` anchor on
that id (the head also has a one-line theme bootstrap `<script>`, and `theme.js` loads by src).
The script's last statement is the entry point: if `window.QUEUE_TEST` is a function it hands
the engine (`queue`, `S`, `setData`, `setLive`) to it instead of booting; that is how the test
loads the real code with stubs.

Deploy is `git push` to `main`; GitHub Pages redeploys in about a minute. To update the artifact
snapshot: run the build script, then publish `dist/artifact.html` with `data/results.json`
attached (plus `field-manual-theme/theme.css`, `theme.js`, and both woff2 fonts the first time
or whenever the theme changes).

## Architecture

Three layers, all read-only:

1. **`scripts/sync.mjs` → `data/results.json`.** Pulls every bout from FloArena's JSON and
   normalizes it: `divs[]` each with `rounds[]` (`R16`/`QF`/`SF`/`F`) of bouts
   `{n, a, b, w, decided, result, winType, mat, video}` plus a `third` bout, and `mats[]` with
   Flo's per-mat `upcoming` lists when published. `w` is `0` (top/`a` won), `1`, or `null`.
   Round order is positional (bout `m` in round `r` feeds bout `m>>1` in `r+1`), derived by
   walking FloArena's `winnerToBoutGuid` links back from the final; bout-number order is the
   fallback. The GitHub Actions cron (`.github/workflows/sync.yml`, every 5 min, really 5–15)
   runs it with `SYNC_STRICT=1` and commits only on content change (Pages allows ~10 builds/hour).
2. **Browser polling in `index.html`.** `results.json` every 60 s, and FloArena's public
   Firebase `mats.json` every 15 s for the bout on each mat (clock, score, `isMatchOver`,
   `winner`). Neither poll re-renders while the Settings tab is open (`quiet()`).
3. **Local preferences (`S`, in localStorage).** Follow list, day, mats, slot durations,
   chosen bracket division. `S.v` is a schema version; bump it and extend the migration in
   `loadState()` when the shape changes. Start times (`DEFAULT`) and block order
   (`DEFAULT_BLOCKS`) are code defaults with no UI.

**Results.** `winnerInfo()` precedence: FloArena → live feed (`isMatchOver` + `winner`). Nothing
is entered by hand. `w === -1` means decided with no winner (double DQ); both render as out.
Participants come from FloArena's own per-round lists (`slot()`) and are propagated from earlier
winners only when Flo hasn't filled the slot. That is what makes odd brackets work: at -66kg
bout #39 was a double DQ and Flo slotted the loser of #37 into the QF. Don't add hand-coded
bracket overrides; fix the sync or the slot logic.

**Schedule (`queue()`).** Today's matches in `DEFAULT_BLOCKS` order, placed on the
earliest-free mat with per-round slot minutes. When `results.json` carries Flo's `mats[].upcoming`
lists they win: bouts are matched by number `n` (against every bracket bout, not just today's
blocks) and placed on exactly the mats Flo lists, in Flo's order; unlisted bouts fall back to
block order on those mats plus any mat with a live bout. Without lists, the mats are `S.mats`
(plus any live mat) and the header says "(assumed)". The projection starts from a live
in-progress bout (that mat is free at now + remaining clock + 2 min; earlier entries on that mat
count as run), otherwise from the day's start on the event's calendar date (`DAY_DATES`), clamped
to now. There is no manual anchor.

**UI.** Sticky top header (title/status row, then word tabs); no bottom nav so mobile Safari's
bar doesn't stack against ours. Next up: day chips, live mat cards, follow cards, queue rows.
Brackets: division chips, one column per round with CSS connectors, 3rd-place box below;
finished bouts link to Flo's video. Tapping any name copies it (no bio links: name spellings
vary too much across sites). Settings: following, appearance, projection, data/reset.

## FloArena data sources (found by watching the arena page's network traffic)

Base `https://arena.flograppling.com`, event `52703b65-bade-46e2-9ce2-399dd32d93e4`, no auth.
- `bracket/<event>` → divisions → weightClasses → boutPools (guids for the next call).
- `bracket/<event>/bouts/<wcGuid>/pool/<poolGuid>` → all bouts for a division. Not CDN-cached.
  Winner is `winnerWrestlerGuid` (no `winner` object); `roundName.displayName` is the round;
  `boutVideoUrl` appears once the bout is published.
- `bracket/<event>/bout/<boutGuid>` → scoring transcript (clock and point events only). Not
  used by the sync; recorded here because it proves no submission name exists anywhere in Flo's
  data, so results say "sub · 6:53" at most.
- `event/<event>/upcoming-bouts` → per-mat upcoming order. Empty at the end of Day 1; the sync
  maps it best-effort (`x.bout || x`, `boutNumber`, `topWrestler`…). Whenever Flo lists anything
  the sync writes the raw field names of the first bout to `upcomingShape` in `results.json`
  (so the guesses can be checked on a green run); if none of the listed bouts yield a number it
  also exits 1 under `SYNC_STRICT` (run goes red; results still commit).
- `event/<event>/recent-results` is CDN-cached 20 min (`s-maxage=1200`). Don't use it.
- Firebase `https://floarena.firebaseio.com/<event>/mats.json`: public, CORS-open, no-cache.
  `red` = FloArena top slot (`a`), `blue` = bottom (`b`); `redTeamName`/`blueTeamName` carry the
  country. `clock` counts down; `period` is `1` or `TB1`… `boutupdates.json` has no winners.
- The arena page itself and Flo's public results page are JS shells; nothing in their HTML.
- The artifact host's CSP blocks all outbound fetches, so the artifact copy has no live layer.

Names in FloArena differ from Flo's published brackets ("Belal Etiabari", "Francis Pana");
FloArena is the source of truth. Seeds are unique within a division; match on seed, not name.
`team` is the country at ADCC; the `ISO` map in `index.html` turns it into a flag emoji. An
unknown country renders an empty `.flag` span on purpose, so seeds and names stay aligned. The
follow list matches a fighter's name or their country (`isFollow`, and the follow-card `hit()`
that mirrors it): "Poland" follows every Polish athlete.

## Event facts (ADCC 2026)

- Day 1 ran 3 mats. Bout numbers: men's R16 #1–40, women's QF #41–52, men's QF #53–72,
  SF #73–88. The Day 2 mat count and block order in `DEFAULT_BLOCKS` are guesses; the page
  corrects both once `upcoming-bouts` publishes. A cloud routine
  (https://claude.ai/code/routines/trig_016fZnDBjKV4GGWf22gXegzV, Sept 13 at 10:15, 11:15,
  12:15 Kraków) verifies the sync's `upcoming` mapping and reorders the blocks if needed.
  Its cron matches Sept 13 every year: disable it after the event.
- "Absolute Male" is a separate FloArena division from the Sunday "Super Fight" (one bout,
  Simoes v Duarte). Absolute had 0 bouts as of Sept 12 night; the sync picks it up (id `mabs`)
  once bouts appear and the page already has Day 2 blocks for its rounds.

## Theme

The look is `field-manual-theme/` (Lee's kit, extracted from jiu-jitsu-brain). `index.html`
links `theme.css`/`theme.js` from there and layers its own rules in the inline `<style>`, using
only the kit's tokens. Read `field-manual-theme/README.md` before touching styling; its "Rules
the look depends on" are binding:

- One typeface (JetBrains Mono, self-hosted), no borders or shadows on content surfaces,
  achromatic accent, near-square corners, no uppercase or letter-spaced labels, pills only for
  controls. Root size is bumped to 17px and the type tokens raised for phone use.
- Everything lowercase except proper nouns, as a content convention (no `text-transform`).
  Athlete and division names, "FloArena", and round codes (R16/QF/SF) keep their case; round
  names are spelled out in the UI ("semifinal").
- Colour with meaning: `--win` = `--type-a`; `--live` = `--cue-warning` as a `.cue.live` tag;
  `--follow` = an app-defined teal (#1f6f7a light / #62bccb dark, set in all three token
  blocks) — not red/brick, which Lee read as "eliminated". Follow beats win/lose on names, and
  rows/boxes containing a followed fighter get a follow tint. The kit's `--type-c/d` teals
  aren't re-lit for dark, so they aren't used for text.
- Dark mode: `--bg-card`, `--bg-card-hover`, `--chip-bg`, `--text-muted` are lifted in the
  app's own dark blocks because the kit's card tone sat too close to the ground. Keep both dark
  blocks in sync.
- Light/dark/auto are three chips in Settings (key `bjjTracker.theme`) that drive the kit's
  `AppTheme.cycle()`. The head bootstrap line must stay before the stylesheet link.
- Bracket connectors are the one load-bearing edge (`--hairline-strong`). Box height must stay
  under `--pitch` (92px); `.bx` overrides the kit's 1.6 line-height for that reason. Columns are
  228px so a flag plus a long name fits.

## Lee's rules for this project

- Automation and glanceability beat to-the-second accuracy: no manual levers for the
  projection, nothing entered by hand, no knobs for things the feed decides.
- Don't re-litigate settled decisions; execute. Flag uncertainty explicitly.
- An eliminated followed fighter gets a neutral "no scheduled matches" card on Next up, never
  a card that names the loss (Lee shows the page to the fighters themselves).
- Settled UI: day switch on Next up; a real column bracket with a division picker, not an
  accordion; tabs at the top; theme control in Settings; names copy, they don't link.

## Known limitations

- Every viewer's follow list and settings are local to their browser.
- Times display in the viewer's local zone; the configured day start is Kraków 11:00 expressed
  in local hours, so viewers outside CEST see wrong projections until a live bout anchors it.
- The Reset button uses a two-tap confirm because native `confirm()` is blocked in the
  artifact's sandboxed iframe.
