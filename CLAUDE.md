# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free, single-file web app (`index.html`) that tracks BJJ tournament brackets and
projects mat times, fed by FloArena. First event: ADCC World Championship 2026, Kraków,
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
with `data/results.json` attached as a supporting file.

`fetch()` of a relative file fails from `file://`, so always test through a local server.

## Architecture

Three layers, all read-only except the last:

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
3. **Local overlay (`S`, in localStorage).** `taps` (results the user recorded), follow list,
   mats, day, start times, slot durations, block order, manual anchor, chosen bracket division.
   `S.v` is a schema version; bump it and extend the migration in `loadState()` when the shape
   of `S` changes.

Result precedence per bout, in `winnerInfo()`: FloArena → live feed (`isMatchOver` + `winner`)
→ tap. Taps are refused once a feed has the result. `w === -1` means decided with no winner
(double DQ); both athletes render as out and nothing propagates.

Participants come from FloArena's own per-round lists when present (`slot()`), and are only
propagated from earlier winners when FloArena hasn't filled the slot. This is what makes odd
brackets work: at -66kg bout #39 was a double DQ and FloArena slotted the loser of #37 into the
QF instead. Don't add hand-coded bracket overrides; fix the sync or the slot logic.

Schedule (`queue()`): today's matches in `DEFAULT_BLOCKS` order (day 1 / day 2, editable in
Settings), assigned to the earliest-free mat with per-round slot lengths. If `results.json`
carries FloArena's per-mat `mats[].upcoming` lists, those win: bouts are matched by number `n`
and placed on exactly the mats Flo lists, in Flo's order; anything not listed falls back to
block order on those same mats. Without such lists the mat count is `S.mats` and the header
says "(assumed)". Start point, in priority: a live in-progress bout (mat free at now +
remaining clock + 2 min) → the manual "set as now" anchor, clamped to now → the day's
configured start on the event's calendar date (`DAY_DATES`). Never projects into the past.

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

## Lee's rules for this project

- Predicted times are estimates; keep the "set as now" lever obvious.
- One tap per result. No burdensome workarounds.
- Don't re-litigate settled decisions; execute.
- Flag uncertainty explicitly.
- UI choices already made: Day 1/Day 2 is a switch on the Next up tab, not in Settings; the
  Brackets tab is a real column bracket with a division picker, not an accordion.

## Known limitations

- Every viewer's taps and settings are local to their browser. Shared state needs a backend.
- Times display in the viewer's local zone; the configured day start is Kraków 11:00 expressed
  in local hours, so viewers outside CEST see wrong projections until a live bout anchors it.
- The Reset button uses a two-tap confirm because native `confirm()` is blocked in the
  artifact's sandboxed iframe.
- The `upcoming-bouts` mapping in `sync.mjs` was written before FloArena had published any
  order, so its field names are a best guess (`x.bout || x`, `boutNumber`, `topWrestler`…).
  Verify against real output the first time it populates.
