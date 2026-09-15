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

**Status (Sept 15, 2026):** ADCC 2026 is over and the page worked through finals day with no
punch list. The sync cron is commented out and the Day 2 routine is disabled, so nothing runs
between events. The agreed next work is at the end of this file under "Next": a competition
simulator first, then hosting/data for the IBJJF Austin Open (January 2027), then a tournament
selector. Start there.

`docs/case-study.md` is the story of how this was built with Lee over Sept 12–13 (also
published as a page: https://claude.ai/code/artifact/8046ec54-d648-42d6-b131-dc48f14cbebe).
Read its last two sections before a working session: "what made it work" and "what would have
been faster" are the operating lessons. In short: Lee states constraints as they surface, so
ask about the invisible ones early (who sees the page, what must never be manual); don't widen
scope past the ask, rhetorical questions are not instructions; batch small changes into one
verify-and-push cycle; run `/spectator-audit` before asking Lee for screenshots; and never let
an unattended process run through an event without a test that simulates the failure.

## Commands

```
node scripts/sync.mjs            # FloArena -> data/results.json (Node 18+, no deps)
node scripts/queue-test.js       # schedule engine on its own small fixture (Flo lists, live bouts, DQs)
scripts/sync-loop-test.sh        # the sync loop against a local bare repo with a competing push mid-loop
python3 -m http.server 8000      # serve locally; open http://localhost:8000 (file:// breaks fetch and fonts)
node --check <(sed -n '/<script id="app">/,/<\/script>/p' index.html | sed '1d;$d')   # syntax-check the app script
scripts/build-artifact.sh        # index.html -> dist/artifact.html for the artifact host
gh workflow run sync.yml         # trigger a sync on GitHub now
gh run list -w sync.yml -L5      # is the sync loop running?
/spectator-audit [url]           # in Claude Code: the novice-spectator agent walks the live page and reports confusions
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
   fallback. The GitHub Actions workflow (`.github/workflows/sync.yml`) is nominally a 5-minute cron, but
   GitHub fired it only three times overnight on Sept 12–13, so each run executes
   `scripts/sync-loop.sh`: reset to origin/main, sync, commit-on-change, push, sleep 300, for
   ~5.5 hours (66 passes) under a concurrency group, so one fire covers a competition day.
   `gh workflow run sync.yml` starts a loop by hand. The reset-to-origin step exists because on
   Sept 13 a hand commit of `data/results.json` made the loop's rebase conflict and every pass
   after that failed silently for two hours while the run showed "in progress".
   **Never commit `data/results.json` from a workstation while a loop is running**; only the
   loop writes it. `SYNC_STRICT=1` makes an unparseable Flo order a warning in the log.
2. **Browser polling in `index.html`.** `results.json` every 60 s, and FloArena's public
   Firebase `mats.json` every 15 s for the bout on each mat (clock, score, `isMatchOver`,
   `winner`). Neither poll re-renders while the Settings tab is open (`quiet()`). On an event
   day the header shows "results N min old" in the warning colour once `updated` is more than
   15 minutes behind, so a healthy fetch of stale data is visible (a failed fetch shows "stale").
3. **Local preferences (`S`, in localStorage).** Follow list, mats, slot durations, `breakUntil`
   (an intermission time no feed announces; the projection starts there while it's in the
   future and nothing is live),
   chosen bracket division. `S.v` is a schema version; bump it and extend the migration in
   `loadState()` when the shape changes. Start times (`DEFAULT`) and block order
   (`DEFAULT_BLOCKS`) are code defaults with no UI.

**Results.** `winnerInfo()` precedence: FloArena → live feed (`isMatchOver` + `winner`). Nothing
is entered by hand. `w === -1` means decided with no winner (double DQ); both render as out.
Participants come from FloArena's own per-round lists (`slot()`) and are propagated from earlier
winners only when Flo hasn't filled the slot. That is what makes odd brackets work: at -66kg
bout #39 was a double DQ and Flo slotted the loser of #37 into the QF. Don't add hand-coded
bracket overrides; fix the sync or the slot logic.

**Schedule (`queue()`).** Every unfought bout across both days in `DEFAULT_BLOCKS` order,
placed on the earliest-free mat with per-round slot minutes (there is no day selector). When `results.json` carries Flo's `mats[].upcoming`
lists they win: bouts are matched by number `n` (against every bracket bout, not just today's
blocks) and placed on exactly the mats Flo lists, in Flo's order; unlisted bouts fall back to
block order on those mats plus any mat with a live bout. Without lists, the mats are `S.mats`
(plus any live mat) and the header says "(a guess)". The projection starts from a live
in-progress bout (that mat is free at now + remaining clock + 2 min; earlier entries on that mat
count as run), otherwise from the day's start on the event's calendar date (`DAY_DATES`), clamped
to now and pushed to `S.breakUntil` while that is in the future. ADCC pauses ~30 minutes between
the last semifinal and the first 3rd-place bout (Lee, Sept 13): `queue()` inserts that gap once,
on every mat, when a projection crosses from semifinals into 3rd-place bouts. Anything Flo says
beats the assumption: a live 3rd-place or final bout, or a recorded 3rd-place result, suppresses
it, and if the semis were already over when the projection starts no gap is added (that's what
"break until" is for). There is no manual anchor.

**UI.** Sticky top header (title, status line, word tabs); no bottom nav so mobile Safari's
bar doesn't stack against ours. Next up: a "nothing on the mats right now" line when nothing is
live, live mat cards for bouts in progress only (a finished bout leaves the mats; its result
lives in the bracket), a "following" section (one card per followed fighter with a
match today, or a neutral "no scheduled matches" card), then the queue of every unfought bout across both days in running order, minus
the ones on the mats; bouts whose names are both unknown collapse into one line. Brackets: division chips, a heading naming the division,
a swipe hint that hides when the bracket fits, one column per round with CSS connectors,
opened with the first unfought round flush right; finished bouts link to Flo's video; slots
filled by someone who didn't win the feeding bout are labelled ("X in after the #39
disqualification"). Tapping any name copies it (no bio links: name spellings vary too much
across sites). Settings: following (unmatched entries flagged), appearance, projection,
data/reset. Seeds are in the data but never shown. Redraws (the 15 s live poll) preserve the
bracket's and the chip row's scroll positions.

**Test data.** FloArena runs a "Test" division (weight "106", "Test Wrestler N", bout numbers
9001+) through the live scoreboard and the upcoming lists before a day starts; on Sept 13 it
filled all three mats at 07:00. `isTestBout()` in each file drops it (weight 106, a first name
starting "Test", bout number ≥ 9000; the page also checks the feed's `division`). The two
predicates must be changed together. There is deliberately no "is this weight class in the
bracket" allowlist: a real division with an empty pool (the Absolute before it fills) would be
dropped by it.

## FloArena data sources (found by watching the arena page's network traffic)

Base `https://arena.flograppling.com`, event `52703b65-bade-46e2-9ce2-399dd32d93e4`, no auth.
- `bracket/<event>` → divisions → weightClasses → boutPools (guids for the next call).
- `bracket/<event>/bouts/<wcGuid>/pool/<poolGuid>` → all bouts for a division. Not CDN-cached.
  Winner is `winnerWrestlerGuid` (no `winner` object); `roundName.displayName` is the round;
  `boutVideoUrl` appears once the bout is published.
- `bracket/<event>/bout/<boutGuid>` → scoring transcript (clock and point events only). Not
  used by the sync; recorded here because it proves no submission name exists anywhere in Flo's
  data, so results say "sub · 6:53" at most.
- `event/<event>/upcoming-bouts` → per-mat upcoming order, `[{name:'Mat 1', bouts:[…]}]` where
  each bout has the same shape as the bracket endpoint's (`boutNumber`, `topWrestler`,
  `bottomWrestler`, `weightClass.name`, `roundName.displayName`). Verified against real output
  on Sept 13 (it was null until the morning of Day 2, then test bouts, then real ones). The
  sync records the first bout's field names as `upcomingShape` in `results.json` and, under
  `SYNC_STRICT`, exits 1 if listed bouts yield no numbers (the loop logs a warning; results
  still commit).
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
  SF #73–88. FloArena published Day 2's per-mat order around 08:00 on Sept 13 (semifinals
  first, +99kg on mat 1), so the page runs on Flo's order; `DEFAULT_BLOCKS` is only the
  fallback. A cloud routine (https://claude.ai/code/routines/trig_016fZnDBjKV4GGWf22gXegzV,
  Sept 13 at 10:15, 11:15, 12:15 Kraków) was set up to verify the mapping; the mapping proved
  right before it fired. Its cron matches Sept 13 every year: disable it after the event.
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
  250px so a flag plus a long name fits.

## Audits

`.claude/agents/novice-spectator.md` is a read-only subagent that uses the live page as a
first-time spectator on a 390px phone and reports a ranked list of confusions with the smallest
fix for each; `/spectator-audit` (`.claude/skills/spectator-audit/SKILL.md`) launches it. It
ran five times on Sept 12–13 and most of the UI section above came out of it. When launching
it, tell it what is deliberate (see Lee's rules) so it doesn't re-report settled choices, and
the current time so it judges empty states fairly. The browser automation cannot see Lee's own
tabs and won't resize below ~360px; the agent forces a 390px layout width instead.

## Lee's rules for this project

- Automation and glanceability beat to-the-second accuracy: no manual levers for the
  projection, nothing entered by hand, no knobs for things the feed decides.
- Don't re-litigate settled decisions; execute. Flag uncertainty explicitly.
- An eliminated followed fighter gets a neutral "no scheduled matches" card on Next up, never
  a card that names the loss (Lee shows the page to the fighters themselves).
- Settled UI (don't re-litigate, don't let an audit re-open): no day selector, Next up is
  everything still to be fought in running order; a real column bracket with a division picker, not an accordion; tabs
  at the top; theme control in Settings; names copy, they don't link; results open Flo's video
  in a new tab; results are not prefixed with "won by"; the six projection boxes stay in
  Settings; unknown-name bouts collapse into one line; no seeds on screen; the follow colour is
  a tint, not a name colour.

## Security posture (audited Sept 13)

- Public by design: the repo and the Pages site are public; the page holds no secrets, sets no
  cookies, sends nothing anywhere. The only outbound requests are same-origin (`results.json`,
  theme, fonts) and reads of FloArena's public Firebase feed. A `<meta>` CSP in the head pins
  that: `connect-src 'self' https://floarena.firebaseio.com`, no objects/frames/forms, no
  external scripts. Inline script/style are allowed because the page is one file. The meta is
  ignored on the artifact host (it wraps the body), which has its own CSP.
- Everything from the feeds is untrusted: every name, team, result, clock, round and label goes
  through `esc()` before it becomes HTML (the champion-card division name was the one gap,
  fixed). Video links are accepted only if they are `https://…flograppling.com/…`, checked in
  both the sync and the page; anything else renders as plain text.
- The Actions workflow runs only on schedule and manual dispatch (never on pull requests), with
  the default `GITHUB_TOKEN` scoped to `contents: write`; it executes repo code, not feed data.
  The cloud routine pushes as Lee with the repo cloned; its prompt limits it to three files.
- Per-viewer state is localStorage only (follow list, day, mats, slot minutes, theme, division).
- The `gh` token on Lee's Mac has the `workflow` scope (needed to push `sync.yml`); it is in the
  macOS keychain, never in the repo. Git history was scanned for secrets: none.

## Known limitations

- Every viewer's follow list and settings are local to their browser.
- Times display in the viewer's local zone; the configured day start is Kraków 11:00 expressed
  in local hours, so viewers outside CEST see wrong projections until a live bout anchors it.
- The Reset button uses a two-tap confirm because native `confirm()` is blocked in the
  artifact's sandboxed iframe.

## Next (agreed Sept 13–15, after ADCC ended)

ADCC 2026 is done: Lee used the page all of finals day and reported no UX or functionality
punch list. The sync schedule is commented out in `sync.yml` and the Day 2 routine is disabled;
re-enable the cron before the next event. Three items, in this order:

**0. A competition simulator** (Lee, Sept 15): a way to demo and test without waiting for a
live event. Direction: a local, dependency-free server (`scripts/sim-server.mjs`) that serves
the page plus fake `data/results.json` and `mats.json` endpoints from a timeline replayed out of
real ADCC data (results stripped and re-applied in bout-number order at adjustable speed; a
generated live feed with a counting clock, then `isMatchOver` + the real winner). Same-origin
so the CSP needs no change; the page takes the live URL from a `?live=` param only on
localhost. Feeds every later test, the audits, and the selector work.

**1. Hosting for scale** (Lee, Sept 15): Lee expects to share the page with many parents at
the next IBJJF Austin Open, which is in January 2027 — that is the real deadline. A WNO may
happen before then, but it's one fight at a time and won't show the app's strengths. Serving is not the constraint (GitHub Pages is a CDN); the real
gaps are (a) IBJJF is not on FloArena, so the live layer and results need a new source
adapter, (b) a sync that runs on a real schedule (EventBridge + Lambda every minute, not
GitHub's loose cron), (c) a custom domain. AWS is justified for (b) and possibly a proxy for
(a); the page itself can stay static anywhere. Size after inspecting ibjjf.com.

**2. Tournament selector.** Make the tournament a selectable event, not a constant. Lee wants this to cover IBJJF opens,
WNO, ADCC and everything between. Plan, in order:
1. Pull the ADCC constants (event guid in sync and page, `DAY_DATES`, title, the ADCC day plan
   in `DEFAULT_BLOCKS`, the 30-min-before-3rd-place rule, team = country) into one event record;
   sync writes `data/<event>/results.json`; the page reads an event list, shows a picker, and
   remembers the choice. Keep ADCC as the only entry at first so the shared link doesn't change.
2. Before the next Flo event (WNO or whichever is first): add its record, run the sync a day
   early, run `/spectator-audit` on it. FloArena events are configuration only (same endpoints,
   different guid). Drop the block-order guess in favour of Flo's published order for non-ADCC
   events; it only fit ADCC's day plan.
3. IBJJF opens don't run on FloArena: they need a second source adapter producing the same
   `results.json` shape. Size it after looking at what ibjjf.com actually exposes; don't promise
   a duration before that.
