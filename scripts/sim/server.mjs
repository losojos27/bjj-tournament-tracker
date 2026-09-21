#!/usr/bin/env node
// Competition simulator server. Serves the tracker plus simulated versions of both feeds, replaying a finished
// event (scripts/sim/adcc-2026-final.json by default) at an adjustable speed. No dependencies.
//
//   node scripts/sim/server.mjs                     # http://localhost:8766  (tracker at /?sim, controls at /sim/)
//   node scripts/sim/server.mjs --speed 60 --from SF
//   node scripts/sim/server.mjs --host 0.0.0.0      # let a phone on the same wifi open http://<this-mac's-ip>:8766
//
//   /sim/results.json  what scripts/sync.mjs would have written at the last sync (every --sync event-seconds)
//   /sim/mats.json     what FloArena's Firebase mats node would hold right now
//   /sim/control       ?pause=1|0  ?speed=N  ?jump=<stage>  ?sync=N  ?reset=1
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTimeline, resultsAt, matsFeedAt, jumpTargets, summaryAt } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export function createSim({ fixture = path.join(HERE, 'adcc-2026-final.json'), speed = 20, from = 'start', sync = 300, now = () => Date.now() } = {}) {
  const final = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const tl = buildTimeline(final);
  const targets = jumpTargets(tl);
  const st = { base: 0, wall0: now(), speed, paused: false, sync };
  const t = () => Math.min(tl.total, st.base + (st.paused ? 0 : ((now() - st.wall0) / 1000) * st.speed));
  const rebase = () => { st.base = t(); st.wall0 = now(); };
  const sim = {
    final, tl, targets, t,
    jump(stage) { if (targets[stage] === undefined) return false; st.base = targets[stage]; st.wall0 = now(); return true; },
    setSpeed(n) { if (!(n > 0 && n <= 5000)) return false; rebase(); st.speed = n; return true; },
    setSync(n) { if (!(n >= 0 && n <= 3600)) return false; st.sync = n; return true; },
    pause(p) { rebase(); st.paused = !!p; },
    reset() { st.base = 0; st.wall0 = now(); st.paused = false; st.speed = speed; st.sync = sync; },
    // the last moment a sync would have run: results.json is a snapshot, the mats feed is live
    snapshotT() { const tt = t(); return st.sync > 0 ? Math.floor(tt / st.sync) * st.sync : tt; },
    results() { const tt = t(), ts = sim.snapshotT(); return resultsAt(final, tl, ts, { speed: st.speed, paused: st.paused, sync: st.sync, t: Math.round(tt) }, now() - ((tt - ts) / st.speed) * 1000); },
    mats() { return matsFeedAt(final, tl, t(), now(), st.speed); },
    status() { const tt = t(); const hms = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      return { t: Math.round(tt), total: Math.round(tl.total), clock: hms(tt), length: hms(tl.total), speed: st.speed, paused: st.paused, sync: st.sync, stages: Object.keys(targets), event: final.event?.name || '', ...summaryAt(tl, tt) }; },
  };
  if (from !== 'start') sim.jump(from);
  return sim;
}

export function createServer(sim, root = ROOT) {
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://sim.local');
    const p = decodeURIComponent(url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (p === '/sim/results.json') return json(res, 200, sim.results());
    if (p === '/sim/mats.json') return json(res, 200, sim.mats());
    if (p === '/sim/status.json') return json(res, 200, sim.status());
    if (p === '/sim/control') {
      const q = url.searchParams; const done = [];
      if (q.has('reset')) { sim.reset(); done.push('reset'); }
      if (q.has('pause')) { sim.pause(q.get('pause') !== '0'); done.push('pause'); }
      if (q.has('speed')) { if (!sim.setSpeed(+q.get('speed'))) return json(res, 400, { error: 'speed must be between 0 and 5000' }); done.push('speed'); }
      if (q.has('sync')) { if (!sim.setSync(+q.get('sync'))) return json(res, 400, { error: 'sync must be 0 to 3600 event-seconds' }); done.push('sync'); }
      if (q.has('jump')) { if (!sim.jump(q.get('jump'))) return json(res, 400, { error: `unknown stage; try one of ${Object.keys(sim.targets).join(', ')}` }); done.push('jump'); }
      return json(res, 200, { done, ...sim.status() });
    }
    if (p === '/sim' || p === '/sim/') { res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(HERE, 'panel.html'))); }
    // the tracker only enters sim mode with ?sim, so send the bare root there
    if (p === '/' && !url.searchParams.has('sim')) { const q = new URLSearchParams(url.search); q.set('sim', '1'); res.writeHead(302, { Location: '/?' + q }); return res.end(); }
    // static files from the repo root, never outside it
    const file = path.resolve(root, '.' + (p.endsWith('/') ? p + 'index.html' : p));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
    if (file.includes(`${path.sep}.git${path.sep}`)) { res.writeHead(404); return res.end('not found'); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
}

function main() {
  const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
  const port = +arg('port', 8766), host = arg('host', '127.0.0.1');
  const sim = createSim({ speed: +arg('speed', 20), from: arg('from', 'start'), sync: +arg('sync', 300), fixture: arg('fixture', undefined) });
  createServer(sim).listen(port, host, () => {
    const s = sim.status();
    console.log(`simulating "${s.event}": ${s.totalBouts} bouts, ${s.length} of event time at ×${s.speed} (about ${Math.round(s.total / s.speed / 60)} min of wall time)`);
    console.log(`  tracker   http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/?sim`);
    console.log(`  controls  http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/sim/`);
    if (host === '0.0.0.0') console.log('  on a phone: use this Mac\'s wifi address with the same port');
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
