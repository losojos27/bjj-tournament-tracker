# ADCC 2026 tracker

Bracket and schedule tracker for the ADCC World Championship 2026 (Kraków, Sept 12–13).
Results come from FloArena automatically; the page projects mat times and shows what is on
each mat right now.

**Live page:** https://losojos27.github.io/bjj-tournament-tracker/

## How it stays live
- `scripts/sync.mjs` pulls every division's bouts from FloArena's JSON endpoints and writes
  `data/results.json`. A GitHub Actions cron (`.github/workflows/sync.yml`) runs it every
  5 minutes and commits when something changed; GitHub Pages redeploys on push.
- The page also polls FloArena's public Firebase feed (`/<event>/mats.json`) every 15 s for
  the bout currently on each mat: clock, score, and the winner the moment it ends. That
  result is applied to the bracket immediately, ahead of the next sync.
- Nothing is entered by hand. The follow list and a couple of projection settings live in
  the viewer's own browser.

## Run it yourself
```
node scripts/sync.mjs          # refresh data/results.json
python3 -m http.server 8000    # then open http://localhost:8000
```
No build step, no dependencies (Node 18+ for the sync script). Serve over HTTP; the theme's fonts and the results fetch don't work from `file://`.

## Layout
| Path | What |
| --- | --- |
| `index.html` | The app: bracket engine, schedule projection, live mats. |
| `field-manual-theme/` | The visual theme (tokens, primitives, JetBrains Mono, light/dark toggle). |
| `data/results.json` | Current bracket state from FloArena (written by the sync). |
| `scripts/sync.mjs` | FloArena → results.json. |
| `scripts/build-artifact.sh` | Builds `dist/artifact.html` for publishing as a Claude artifact. |
| `.github/workflows/sync.yml` | Cron that runs the sync and commits changes. |
| `CLAUDE.md` | Handoff notes, data sources, known issues. |
| `archive/` | Original Claude-chat handoff bundle. |
