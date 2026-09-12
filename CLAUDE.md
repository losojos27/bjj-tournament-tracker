# ADCC 2026 bracket + schedule tracker — handoff

Single-file web app (`index.html`) that tracks the ADCC World Championship 2026 brackets
(Kraków, Sept 12–13) and projects match start times. Built in a Claude chat on Sept 12
while Lee was in the arena; moved here Sept 12 evening so it can be hosted and iterated.

## Repo layout & publishing
- `index.html` — the app. `README.md` — public-facing overview. `archive/` — original chat handoff zip.
- `scripts/build-artifact.sh` → `dist/artifact.html` (gitignored): `index.html` minus the
  doctype/html/head/body wrapper, which the Claude artifact host supplies itself.
- **Published:** https://claude.ai/code/artifact/78d4a9a4-2636-4548-9de6-b03be85ae72e
  Republish after any change: run the build script, then `Artifact` on `dist/artifact.html`
  (same path keeps the URL). Persistence there is localStorage, per viewer, per browser.
- When baking new results into `DEFAULT.winners`, **bump `DEFAULT.v`** and extend the
  migration condition in `load()`, or existing viewers' stored state will shadow them.
- The Reset button uses a two-tap confirm; native `confirm()` is blocked in the artifact iframe.

## What it does
- Three tabs: **Next up** (followed athletes' next match + ETA, then the projected queue),
  **Brackets** (all 8 divisions, tap a name to record the winner), **Settings**.
- All bracket data is inline in `DIVS`. Men's divisions are 16-man, women's 8-woman.
  `-66kg` has a `fixed` QF because Flo's published R16 layout didn't match FloArena's
  actual QF field (Jones and Anraku both reached the QF despite being listed as R16
  opponents; Olivarez isn't in the field). Rounds below a fixed round are hidden ("dead").
- Results live in `DEFAULT.winners` as `{divId: {roundIdx: {matchIdx: 0|1}}}` (0 = top
  slot won). `third` holds 3rd-place results. Winners propagate; changing a result clears
  downstream results in that division.
- Schedule engine (`queue()`): runs blocks in `DEFAULT_BLOCKS` order (editable in
  Settings), assigns unplayed matches to the earliest-free mat, slot length per round
  from `dur`. `anchor` = {key, at}: the match that was on the mat at time `at`;
  everything before it is treated as run. If the anchored match is already complete and
  `at` is in the past, projection starts from now (never projects into the past).
- Persistence: `window.storage` (Claude artifact API) if present, else `localStorage`.
  **Inside the Claude app's file viewer neither persisted across reopen** — that's why
  results are baked into `DEFAULT` and a `v` counter + migration in `load()` merges new
  baked results over any stored state.
- Has apple-mobile-web-app meta tags; intended to be hosted (GitHub Pages / Netlify) and
  added to the iOS home screen. Then localStorage works and taps persist.

## Ground truth as of ~17:00 local, Sept 12 (baked into index.html)
- All men's R16 results (from FloArena screenshots).
- All women's QFs complete. Semis: +65 Crevar–Mitrovic, Lopez–Clymer; -65 Vieira–Black,
  Galvão–Molina; -55 Rocha–Mayordomo, Bastos–Rodrigues.
- Men's +99 QF complete: Pena–Saunders, Macqueen–**Victor Hugo** in the semis.
- Men's -88 QF #61: Jaworski def. **Felipe Costa** (leg lock). Other -88 QFs unknown.
- Men's -99, -77, -66 QF results: unknown at handoff.
- Followed athletes: Felipe Costa (out), Victor Hugo (semi tomorrow).

## Observed running order (Sept 12)
- 3 mats. Match numbers: men's R16 #1–40, women's QF #41–52 (+65, -65, -55), men's QF
  #53–72 (+99, -99, -88, -77, -66). Heaviest → lightest within a round.
- Women's QF bouts were 15:00 regulation; two went the distance. 20 min/slot incl.
  walkouts is realistic; 12 was too tight.
- Day 2 assumed to be SF → 3rd → F. Block order in `DEFAULT_BLOCKS` is a guess — check
  FloArena's "Upcoming" tab and fix.

## Data sources (what works, what doesn't)
- FloArena bracket page: `https://arena.flograppling.com/event/52703b65-bade-46e2-9ce2-399dd32d93e4?page=brackets`
  is live and accurate but a JS shell; brackets load from an API not yet identified.
  Browser cross-origin blocks calling it from the page anyway. Worth investigating from
  a machine: network tab → find the JSON endpoint → a small poller could sync results.
- `https://www.flograppling.com/events/14687695/results` — Flo's results page; was 404ing
  ("Results not found" from api.flosports.tv) on the afternoon of Sept 12 after working
  earlier. If it recovers it may be the easiest structured source.
- Flo article pages (brackets/results, live blog) are cached hours behind — useless live.
- Current workflow: screenshots of FloArena → results transcribed into `DEFAULT.winners`.

## Lee's rules for this project
- Predicted times are estimates; make the anchor/"set as now" lever obvious.
- Don't re-litigate settled decisions; execute.
- One tap per result. No burdensome workarounds.
- Flag uncertainty explicitly.

## Known issues (found in the Sept 12 evening review)
- Stale anchor: if the anchored match has no recorded result and `anchor.at` is in the past,
  `queue()` still projects from `anchor.at` (into the past). Only completed anchors jump to now.
  Only bites on Day 1; the Day 2 queue ignores the Day 1 anchor key entirely.
- `DEFAULT.anchor.at` is computed as *today* 16:30 on every fresh load, so a first-time viewer
  on Day 1 morning would see a future-dated anchor. Harmless from Day 2 on.
- "Clear now anchor" button still shows on Day 2 even though the anchor is inert there.
- Times are the *viewer's* local time. `dayStart` uses local 11:00, so viewers outside CEST
  get wrong Day 2 start projections until someone taps "set as now".
- Each viewer has their own localStorage; results Lee taps do not reach other viewers unless
  baked into `DEFAULT` and republished. Shared state would need a backend (artifact `db`).
- Restore-from-JSON does an unvalidated `Object.assign` (self-XSS only; not a sharing risk).

## Next steps (suggested)
1. ~~Host it~~ Published as a Claude artifact (see above). GitHub Pages is a `gh repo create` away
   if a plain URL / iOS home-screen install is wanted.
2. Find the FloArena JSON endpoint and add a sync (server-side or a proxy), or at least
   a "paste results" import that's faster than editing `DEFAULT`.
3. Verify Day 2 block order against FloArena's Upcoming tab before Sept 13 starts.
4. Fill in the men's -99/-77/-66/-88 QF results.
