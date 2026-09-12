# ADCC 2026 tracker

Single-file web app (`index.html`) that tracks the ADCC World Championship 2026 brackets
(Kraków, Sept 12–13) and projects match start times per mat.

- **Run locally:** open `index.html` in a browser. No build, no dependencies.
- **Host:** any static host (GitHub Pages, Netlify). Results persist in the browser's
  localStorage, so each viewer has their own copy of tapped results.
- **Publish as a Claude artifact:** `scripts/build-artifact.sh` writes `dist/artifact.html`
  (the page minus the document wrapper the artifact host supplies).

Layout:

| Path | What |
| --- | --- |
| `index.html` | The app. Bracket data, results, and schedule engine are all inline. |
| `CLAUDE.md` | Handoff notes, data model, ground truth, and working rules. |
| `scripts/build-artifact.sh` | Builds the artifact fragment into `dist/`. |
| `archive/adcc-tracker.zip` | Original handoff bundle from the Claude chat (Sept 12, 2026). |

See `CLAUDE.md` for how results are stored, how the schedule projection works, and what
data is still missing.
