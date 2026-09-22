// Tests for the competition simulator: the timeline and feed generators (core.mjs) and the HTTP server.
// Run: node scripts/sim/test.mjs   — exits non-zero on the first failed check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimeline, resultsAt, matsFeedAt, upcomingAt, jumpTargets, createClock, parseFinish } from './core.mjs';
import { createSim, createServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const final = JSON.parse(fs.readFileSync(path.join(HERE, 'adcc-2026-final.json'), 'utf8'));
let checks = 0; const ok = (cond, msg) => { checks++; if (!cond) { console.error('FAILED: ' + msg); process.exit(1); } };
const allBouts = r => r.divs.flatMap(d => [...d.rounds.flatMap(x => x.bouts), ...(d.third ? [d.third] : [])]);
const decidedCount = r => allBouts(r).filter(b => b.w !== null || b.decided).length;

// ---- timeline
const tl = buildTimeline(final);
const total = allBouts(final).length;
ok(tl.items.length === total && total > 100, `every bout is on the timeline (${tl.items.length}/${total})`);
ok(tl.items.every(i => i.over > i.start && i.start >= 0), 'every bout has a positive duration');
for (const name of tl.matNames) { const on = tl.items.filter(i => i.mat === name).sort((a, b) => a.start - b.start);
  ok(on.every((i, k) => k === 0 || i.start >= on[k - 1].over), `${name}: bouts never overlap`); }
ok(tl.items.every(i => i.mat === i.b.mat), 'each bout runs on the mat it really ran on');
{ // a bout never starts before the bouts feeding it are over
  const d = final.divs.find(x => x.id === 'm99p'); const fin = tl.byKey.get('m99p|F|0'), sf0 = tl.byKey.get('m99p|SF|0'), sf1 = tl.byKey.get('m99p|SF|1'), third = tl.byKey.get('m99p|3|0');
  ok(d && fin.start >= Math.max(sf0.over, sf1.over), 'the +99kg final starts after both semifinals are over');
  ok(third.start >= Math.max(sf0.over, sf1.over), 'the 3rd-place bout starts after both semifinals are over');
  const lastSF = Math.max(...tl.items.filter(i => i.d.kind === 'pro' && i.rName === 'SF').map(i => i.over)); const first3 = Math.min(...tl.items.filter(i => i.rName === '3').map(i => i.start));
  ok(first3 >= lastSF + tl.options.intermission, 'the intermission sits between the last pro semifinal and the first 3rd-place bout'); }

// ---- results.json over time
const T = jumpTargets(tl);
const r0 = resultsAt(final, tl, 0);
ok(decidedCount(r0) === 0, 'nothing is decided at the start');
ok(r0.divs.every(d => d.rounds[0].bouts.every(b => b.a && b.b)), 'first-round names are known at the start');
ok(r0.divs.filter(d => d.rounds.length > 1).every(d => d.rounds.slice(1).every(r => r.bouts.every(b => b.a === null && b.b === null))), 'later-round names are hidden until their feeders finish');
let prev = -1; for (let t = 0; t <= tl.total; t += tl.total / 60) { const n = decidedCount(resultsAt(final, tl, t)); ok(n >= prev, `decided bouts never go backwards (t=${Math.round(t)})`); prev = n; }
const rEnd = resultsAt(final, tl, tl.total);
ok(decidedCount(rEnd) === total, 'everything is decided at the end');
ok(JSON.stringify(rEnd.divs.map(d => [d.rounds, d.third])) === JSON.stringify(final.divs.map(d => [d.rounds, d.third])), 'the end state equals the real final results exactly');
{ // one semifinal over, the other running: the final shows exactly one name
  const sf0 = tl.byKey.get('m99p|SF|0'), sf1 = tl.byKey.get('m99p|SF|1'); const [firstOver, second] = sf0.over < sf1.over ? [sf0, sf1] : [sf1, sf0];
  const mid = resultsAt(final, tl, (firstOver.over + second.over) / 2); const f = mid.divs.find(d => d.id === 'm99p').rounds.at(-1).bouts[0];
  const names = [f.a, f.b].filter(Boolean);
  ok(names.length === 1, 'with one semifinal over, the final shows one name and hides the other'); }
{ // the double-DQ bout (#39) decides with no winner, and its replacement appears only then
  const dq = tl.byKey.get('m66|R16|6'); ok(dq && dq.b.decided && dq.b.w === null, 'fixture still contains the -66kg double DQ');
  const before = resultsAt(final, tl, dq.over - 1).divs.find(d => d.id === 'm66'), after = resultsAt(final, tl, dq.over).divs.find(d => d.id === 'm66');
  ok(before.rounds[1].bouts[3].a === null && after.rounds[1].bouts[3].a?.name === 'Owen Jones', 'Owen Jones fills the quarterfinal slot when the DQ bout is decided');
  ok(after.rounds[0].bouts[6].decided === true && after.rounds[0].bouts[6].w === null, 'the DQ bout reads decided with no winner'); }

// ---- upcoming lists and the live mats feed
{ const t = T.SF + 400; const up = upcomingAt(tl, t); const feed = matsFeedAt(final, tl, t, 1e12, 20);
  ok(up.length === tl.matNames.length && up.every(m => m.upcoming.length > 0 && m.upcoming.length <= tl.options.upcomingPerMat), 'each mat lists a few upcoming bouts');
  ok(up.every(m => m.upcoming.every(u => tl.items.find(i => String(i.b.n) === String(u.n)).start > t)), 'upcoming lists hold only bouts that have not started');
  ok(up.every(m => m.upcoming.every((u, k, a) => k === 0 || tl.items.find(i => i.b.n === u.n).start >= tl.items.find(i => i.b.n === a[k - 1].n).start)), 'upcoming lists are in running order');
  const entries = Object.values(feed).filter(v => v.matName);
  ok(entries.length === 3 && Object.values(feed).some(v => !v.matName), 'the feed has one entry per mat plus the nameless stale entry the real feed carries');
  ok(entries.every(v => /^\d+:\d\d$/.test(v.clock) && typeof v.isMatchOver === 'boolean' && v.boutNumber && v.redFirstName && v.blueFirstName && v.round && v.weight), 'feed entries have the fields the page reads');
  ok(entries.filter(v => !v.isMatchOver).every(v => v.winner === undefined && v.updated === 1e12), 'a bout in progress has no winner and a fresh timestamp');
  ok(entries.filter(v => v.isMatchOver).every(v => (v.winner === 'red' || v.winner === 'blue') && v.updated < 1e12 && /^\d+-\d+$/.test(v.finalScore)), 'a finished bout has a winner, a final score, and an older timestamp');
  ok(!JSON.stringify([feed, up]).match(/Test Wrestler|"106"/), 'no test-division data leaks into the feeds'); }
{ // red is the top slot: a top-slot win reads "red"
  const it = tl.items.find(i => i.b.w === 0), it2 = tl.items.find(i => i.b.w === 1);
  const f1 = Object.values(matsFeedAt(final, tl, it.over + 1)).find(v => v.boutNumber === String(it.b.n)), f2 = Object.values(matsFeedAt(final, tl, it2.over + 1)).find(v => v.boutNumber === String(it2.b.n));
  ok(f1 && f1.winner === 'red' && f2 && f2.winner === 'blue', 'winner colour follows the slot: top = red, bottom = blue'); }
{ // overtime: a bout finishing past regulation reports a TB period
  const otBout = tl.items.find(i => i.finish > tl.options.regulation + 60);
  const f = Object.values(matsFeedAt(final, tl, otBout.start + tl.options.regulation + 30)).find(v => v.boutNumber === String(otBout.b.n));
  ok(f && /^TB\d$/.test(f.period), 'a bout past regulation shows an overtime period');
  const g = Object.values(matsFeedAt(final, tl, otBout.over + 5)).find(v => v.boutNumber === String(otBout.b.n));
  ok(g && g.isMatchOver && /^TB\d$/.test(g.period), 'a finished overtime bout keeps its overtime period, as the real feed does');
  const edge = tl.items.find(i => /TB1/.test(i.b.result) && parseFinish(i.b.result) === tl.options.regulation);   // "2-0 10:00 TB1": Flo says overtime at exactly regulation
  const h = edge && Object.values(matsFeedAt(final, tl, edge.over + 5)).find(v => v.boutNumber === String(edge.b.n));
  ok(!edge || (h && h.period === 'TB1'), 'a bout Flo flagged as overtime at exactly regulation still reads overtime when finished'); }

// ---- the server: snapshot lag, controls, static files, traversal
let fake = 1_000_000; const sim = createSim({ speed: 20, sync: 300, now: () => fake });
{ const dqOver = sim.tl.byKey.get('m99p|R16|0').over;                       // bout #1
  sim.jump('start'); fake += ((dqOver + 5) / 20) * 1000;                    // advance to 5 event-seconds after bout #1 ends
  const live = Object.values(sim.mats()).find(v => v.boutNumber === '1'); const res = sim.results();
  ok(live && live.isMatchOver === true, 'the live feed shows bout #1 over immediately');
  const snap = sim.snapshotT(); const b1 = res.divs.find(d => d.id === 'm99p').rounds[0].bouts[0];
  ok(snap % 300 === 0 && (b1.w === null) === (snap < dqOver), 'the results file is a snapshot from the last sync, so it can trail the live feed');
  ok(res.sim.speed === 20 && typeof res.updated === 'string', 'results carry the sim block the page scales its projections by');
  sim.setSync(0); ok(sim.results().divs.find(d => d.id === 'm99p').rounds[0].bouts[0].w !== null, 'with sync 0 the results file is live'); }
{ sim.pause(true); const t1 = sim.t(); fake += 60_000; ok(sim.t() === t1, 'paused time does not advance'); sim.pause(false); fake += 1000; ok(Math.abs(sim.t() - (t1 + 20)) < 1e-6, 'one wall second at ×20 is twenty event seconds');
  ok(sim.setSpeed(0) === false && sim.setSpeed(60) === true && sim.jump('nowhere') === false && sim.jump('finals') === true, 'controls validate their input'); }

{ // the shared clock: starts where asked, survives a reload through its saved state, and rejects a corrupt one
  let w = 5_000_000; const c = createClock(tl, { speed: 20, from: 'SF', now: () => w });
  ok(c.t() === T.SF, 'a clock can start at a stage');
  w += 10_000; const saved = c.state(); w += 5_000;
  const c2 = createClock(tl, { speed: 1, from: 'start', now: () => w, saved });
  ok(Math.abs(c2.t() - (T.SF + 15 * 20)) < 1e-6 && c2.speed === 20, 'a restored clock keeps running from its saved state, at its saved speed');
  ok(createClock(tl, { from: 'QF', now: () => w, saved: { base: 'x' } }).t() === T.QF, 'a corrupt saved state falls back to a fresh clock');
  c2.pause(true); const held = c2.t(); w += 99_000; ok(c2.t() === held && createClock(tl, { now: () => w, saved: c2.state() }).t() === held, 'a paused clock stays paused across a reload');
  ok(Math.abs(c.snapshotWall() - (w - ((c.t() - c.snapshotT()) / c.speed) * 1000)) < 1e-6, 'the snapshot wall time trails now by the age of the snapshot'); }

const server = createServer(sim);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const get = (p, opt) => fetch(base + p, { redirect: 'manual', ...opt });
{ const r = await get('/'); ok(r.status === 302 && r.headers.get('location').startsWith('/?sim'), 'the bare root redirects into sim mode');
  const page = await get('/?sim=1'); const html = await page.text(); ok(page.status === 200 && html.includes('<script id="app">'), 'the tracker page is served');
  ok((await get('/field-manual-theme/fonts/JetBrainsMono-Regular.woff2')).headers.get('content-type') === 'font/woff2', 'fonts are served with the right type');
  const rj = await (await get('/sim/results.json')).json(); ok(Array.isArray(rj.divs) && rj.sim && Array.isArray(rj.mats), 'results endpoint returns the results shape');
  const mj = await (await get('/sim/mats.json')).json(); ok(typeof mj === 'object' && Object.values(mj).some(v => v.matName), 'mats endpoint returns the feed shape');
  const c = await (await get('/sim/control?jump=SF&speed=200&pause=1')).json(); ok(c.done.length === 3 && c.speed === 200 && c.paused === true, 'control applies several changes at once');
  ok((await get('/sim/control?jump=bogus')).status === 400 && (await get('/sim/control?speed=-1')).status === 400, 'bad control input is a 400');
  ok((await get('/sim/')).status === 200, 'the control panel is served');
  const trav = await get('/..%2f..%2f..%2fetc%2fpasswd'); ok(trav.status === 403 || trav.status === 404, 'path traversal is refused');
  ok((await get('/.git/config')).status === 404, 'the .git directory is not served');
  ok((await get('/sim/results.json', { method: 'POST' })).status === 405, 'only GET and HEAD are accepted'); }
server.close();
console.log(`ALL SIM CHECKS PASSED (${checks} checks)`);
