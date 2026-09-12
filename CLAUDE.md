# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free static web app (`index.html` plus the theme kit) that tracks BJJ tournament
brackets and projects mat times, fed by FloArena. First event: ADCC World Championship 2026, Kraków,
Sept 12–13. Lee uses it on a phone in the arena; other people get the link. The folder name
is deliberately generic (`bjj-tournament-tracker`) because it will cover more than ADCC.

- **Live page (the one to share):** https://losojos27.github.io/bjj-tournament-tracker/
- Claude artifact snapshot (no live feeds, results as of last republish):
  https://claude.ai/code/artifact/78d4a9a4-2636-4548-9de6-b03be85ae72e

## Commands

```
node scripts/sync.mjs                       # FloArena -> data/results.json (Node 18+, no deps)
python3 -m http.server 8000                 # serve locally; open http://localhost:8000
node --check <(sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d')   # syntax-check the inline script
scripts/build-artifact.sh                   # index.html -> dist/artifact.html (strips the document wrapper the artifact host adds)
gh workflow run sync.yml                    # trigger a sync on GitHub now
gh run list -w sync.yml -L5                 # is the cron firing?
```

There are no tests and no build. Deploy is `git push` to `main`; GitHub Pages redeploys in about
a minute. To update the artifact snapshot: run the build script, then publish `dist/artifact.html`
with `data/results.json`, `field-manual-theme/theme.css`, `theme.js`, and both woff2 fonts
attached as supporting files.

`fetch()` of a relative file fails from `file://`, so always test through a local server.

## Architecture

Three layers, all read-only:

1. **`scripts/sync.mjs` → `data/results.json`.** Pulls every bout from FloArena's JSON and
   normalizes it: `divs[]` each with `rounds[]` (`R16`/`QF`/`SF`/`F`) of bouts
   `{n, a, b, w, decided, result, winType, mat}` plus a `third` bout. `w` is `0` (top/`a` won),
   `1`, or `null`. Round order is positional: bout `m` in round `r` feeds bout `m>>1` in `r+1`,
   derived by walking FloArena's `winnerToBoutGuid` links backwards from the final (bout-number
   order is the fallback). The GitHub Actions cron (`.github/workflows/sync.yml`, every 5 min,
   really 5–15) runs it and commits only when content changed, to stay under the Pages
   build limit (10/hour).
2. **Browser polling in `index.html`.** `results.json` every 60 s, and FloArena's public
   Firebase `mats.json` every 15 s for the bout on each mat (clock, score, `isMatchOver`,
   `winner`). Neither poll re-renders while the Settings tab is open (`quiet()`).
3. **Local preferences (`S`, in localStorage).** Follow list, day, mats, slot durations,
   chosen bracket division. Nothing about results is entered by hand (taps were removed Sept 12). Start times and block order are
   defaults in `DEFAULT` with no UI (Settings is the follow list, mats, slot minutes, reset).
   `S.v` is a schema version; bump it and extend the migration in `loadState()` when the shape
   of `S` changes.

Result precedence per bout, in `winnerInfo()`: FloArena → live feed (`isMatchOver` + `winner`).
`w === -1` means decided with no winner (double DQ); both athletes render as out and nothing
propagates.

Participants come from FloArena's own per-round lists when present (`slot()`), and are only
propagated from earlier winners when FloArena hasn't filled the slot. This is what makes odd
brackets work: at -66kg bout #39 was a double DQ and FloArena slotted the loser of #37 into the
QF instead. Don't add hand-coded bracket overrides; fix the sync or the slot logic.

Schedule (`queue()`): today's matches in `DEFAULT_BLOCKS` order (day 1 / day 2), assigned to the earliest-free mat with per-round slot lengths. If `results.json`
carries FloArena's per-mat `mats[].upcoming` lists, those win: bouts are matched by number `n`
and placed on exactly the mats Flo lists, in Flo's order; anything not listed falls back to
block order on those same mats. Without such lists the mats are `S.mats` (plus any mat the
live feed shows a bout on) and the header says "(assumed)". A live in-progress bout marks
entries listed before it on that mat as already run. Start point: a live in-progress bout (mat free at now + remaining clock + 2 min), else the
day's configured start on the event's calendar date (`DAY_DATES`), clamped to now. There is
no manual anchor any more (Lee removed "set as now" on Sept 12: automation over precision).

## FloArena data sources (found by watching the arena page's network traffic)

Base `https://arena.flograppling.com`, event `52703b65-bade-46e2-9ce2-399dd32d93e4`, no auth.
- `bracket/<event>` → divisions → weightClasses → boutPools (guids for the next call).
- `bracket/<event>/bouts/<wcGuid>/pool/<poolGuid>` → all bouts for a division. Not CDN-cached.
  Winner is `winnerWrestlerGuid` (no `winner` object). `roundName.displayName` is the round.
- `event/<event>/upcoming-bouts` → per-mat upcoming order. Empty at the end of Day 1; the sync
  stores it under `mats[].upcoming` but its bout shape is unverified.
- `event/<event>/recent-results` is CDN-cached 20 min (`s-maxage=1200`). Don't use it.
- Firebase `https://floarena.firebaseio.com/<event>/mats.json`: public, CORS-open, no-cache.
  `red` = FloArena top slot (`a`), `blue` = bottom (`b`). `clock` counts down; `period` is
  `1` or `TB1`… `boutupdates.json` exists but has no winners.
- The arena page itself (`?page=brackets`) is a JS shell; nothing useful in its HTML.
- The artifact host's CSP blocks all outbound fetches, so the artifact copy has no live layer.

Names in FloArena differ from Flo's published brackets (e.g. "Belal Etiabari", "Francis Pana");
FloArena is the source of truth here. Seeds are unique within a division; match on seed, not name.

## Event facts (ADCC 2026)

- Day 1 ran 3 mats. Bout numbers: men's R16 #1–40, women's QF #41–52, men's QF #53–72,
  SF #73–88. The Day 2 mat count and block order in `DEFAULT_BLOCKS` are guesses; the page
  corrects both automatically once `upcoming-bouts` publishes, and a cloud routine
  (https://claude.ai/code/routines/trig_016fZnDBjKV4GGWf22gXegzV, fires Sept 13 at 10:15,
  11:15, 12:15 Kraków) verifies the sync's `upcoming` mapping and reorders the blocks if
  needed. Its cron matches Sept 13 every year: disable it after the event.
- "Absolute Male" is a separate FloArena division from the Sunday "Super Fight" (one bout,
  Simoes v Duarte). Absolute had 0 bouts as of Sept 12 night; the sync picks it up (id `mabs`)
  once bouts appear and the page already has Day 2 blocks for its rounds.

## Theme

The look is `field-manual-theme/` (Lee's kit, extracted from jiu-jitsu-brain). `index.html`
links `theme.css`/`theme.js` from there and layers its own rules in the inline `<style>`,
using only the theme's tokens. Read `field-manual-theme/README.md` before touching styling;
its "Rules the look depends on" are binding here:

- One typeface (JetBrains Mono, self-hosted in `field-manual-theme/fonts/`), no borders or
  shadows on content surfaces, achromatic accent, near-square corners, no uppercase or
  letter-spaced labels, pills only for controls.
- Everything lowercase except proper nouns, as a content convention (no `text-transform`).
  Athlete and division names, "FloArena", and round codes (R16/QF/SF) keep their case.
- Colour with meaning maps to theme tokens: `--follow` = `--type-e`, `--win` = `--type-a`,
  `--live` = `--cue-warning` (rendered as a `.cue.live` tag). Those tokens are re-lit per
  theme; `--type-c/d` are not, so don't use them for text.
- Light/dark/auto is the theme's toggle (top right, key `bjjTracker.theme`). The head
  bootstrap line must stay before the stylesheet link.
- The bracket connectors are the one place an edge is load-bearing (`--hairline-strong`).
  Box height must stay under `--pitch` (78px); the theme's 1.6 line-height is overridden
  inside `.bx` for that reason.

## Lee's rules for this project

- Predicted times are estimates. Automation and glanceability beat to-the-second accuracy:
  no manual levers for the projection.
- Nothing entered by hand: results come from the feeds or not at all.
- Don't re-litigate settled decisions; execute.
- Flag uncertainty explicitly.
- UI choices already made: Day 1/Day 2 is a switch on the Next up tab; the Brackets tab is a
  real column bracket with a division picker, not an accordion; Settings holds the follow
  list, mats, slot minutes and reset. Don't add knobs for things the feed decides.

## Known limitations

- Every viewer's follow list and settings are local to their browser.
- Times display in the viewer's local zone; the configured day start is Kraków 11:00 expressed
  in local hours, so viewers outside CEST see wrong projections until a live bout anchors it.
- The Reset button uses a two-tap confirm because native `confirm()` is blocked in the
  artifact's sandboxed iframe.
- The `upcoming-bouts` mapping in `sync.mjs` was written before FloArena had published any
  order, so its field names are a best guess (`x.bout || x`, `boutNumber`, `topWrestler`…).
  When Flo lists bouts but none yield a number, the sync exits 1 (the Actions run goes red,
  results are still committed) and writes the raw field names to `upcomingShape` in
  `results.json` so the mapping can be fixed from committed data.
