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

## Where things live
- **Live page (share this):** https://losojos27.github.io/bjj-tournament-tracker/ (GitHub Pages, repo `losojos27/bjj-tournament-tracker`)
- Claude artifact snapshot: https://claude.ai/code/artifact/78d4a9a4-2636-4548-9de6-b03be85ae72e
  (no live feed there: the artifact CSP blocks fetches; results are as of the last republish)
- `index.html` app · `data/results.json` bracket state · `scripts/sync.mjs` FloArena→JSON ·
  `.github/workflows/sync.yml` cron · `scripts/build-artifact.sh` → `dist/artifact.html`.

## Data flow (rebuilt Sept 12 evening)
- **FloArena JSON (no auth, not CDN-cached):** base `https://arena.flograppling.com`, event
  `52703b65-bade-46e2-9ce2-399dd32d93e4`.
  - `bracket/<event>` → divisions → weightClasses → boutPools (guids).
  - `bracket/<event>/bouts/<weightClassGuid>/pool/<poolGuid>` → every bout: `boutNumber`,
    `roundName.displayName`, `topWrestler`/`bottomWrestler` (+seed), `winnerWrestlerGuid`,
    `result`, `winType`, `mat.name`, `winnerToBoutGuid`/`winnerToTop` (tree links).
  - `event/<event>/upcoming-bouts` → per-mat upcoming list (was empty at end of Day 1; the sync
    records it under `mats[].upcoming` as a hint, shape unverified).
  - `event/<event>/recent-results` is CDN-cached 20 min (`s-maxage=1200`) — don't rely on it.
- **FloArena Firebase (public, CORS ok):** `https://floarena.firebaseio.com/<event>/mats.json`
  → one entry per mat: red/blue names+seeds+scores, `clock` (counts down), `period`
  (`1`, `TB1`…), `isMatchOver`, `winner` (`red`|`blue`), `boutNumber`, `updated` (epoch ms).
  red = FloArena top slot, blue = bottom. `boutupdates.json` exists but carries no winners.
- `scripts/sync.mjs` orders each round positionally by following `winnerToBoutGuid` links
  from the final backwards (so bout m in round r feeds bout m>>1), falls back to bout number.
  A bout with `winType` but a winner guid matching neither athlete (double DQ, -66 #39) is
  emitted `decided:true, w:null`; the page shows both as out.
- Page precedence per bout: FloArena result → live-feed result (`isMatchOver`+`winner`) →
  local tap. Taps are refused once a feed has the result.
- Schedule: live in-progress bouts anchor the projection at "now" (mat free at now +
  remaining clock + 2 min); else the manual anchor (clamped to now); else the day's start
  time on the event's calendar date.

## Running order (Sept 12 observed; Day 2 assumed)
- 3 mats. Bout numbers: men's R16 #1–40, women's QF #41–52, men's QF #53–72, SF #73–88.
- Day 2 blocks in `DEFAULT_BLOCKS` are a guess (Men SF → Women SF → 3rds → Finals → Absolute →
  super fight). If `upcoming-bouts` populates tomorrow, use it to fix the order.
- Absolute division exists in FloArena with 0 bouts as of Sept 12 night; the sync picks it up
  automatically (id `mabs`) once bouts appear. Super fight: Yuri Simoes v Kaynan Duarte.

## Known issues
- Times are the viewer's local time; day starts are Kraków 11:00 expressed in local hours.
- GitHub cron is "every 5 min" nominally, often 5–15 in practice. Pages redeploys on each
  sync commit (~1 min). Soft limit 10 Pages builds/hour — the sync only commits on change.
- Each viewer's taps/settings are local. There is no shared state between viewers.
- Restore-from-JSON only accepts `taps` and `anchor`.

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
1. Before 11:00 Sept 13: check `event/<event>/upcoming-bouts` and fix the Day 2 block order.
2. Watch the first Actions run of the day (`gh run list -w sync.yml`) to confirm the cron fires.
3. If shared taps are ever wanted, that needs a backend (e.g. the artifact `db` capability).
