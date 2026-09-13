#!/usr/bin/env node
// Pulls the current bracket state for ADCC 2026 from FloArena and writes data/results.json.
// No dependencies. Run: node scripts/sync.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT = '52703b65-bade-46e2-9ce2-399dd32d93e4';
const BASE = 'https://arena.flograppling.com';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'results.json');
const H = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'adcc-tracker-sync' };

async function get(p) {
  const r = await fetch(`${BASE}/${p}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} for ${p}`);
  const j = await r.json();
  if (j.status !== 'SUCCESS') throw new Error(`status ${j.status} for ${p}`);
  return j.response;
}

const ROUND = { 'Round of 32': 'R32', 'Round of 16': 'R16', 'Quarter-Finals': 'QF', 'Semi-Finals': 'SF', 'Finals': 'F', '3rd Place': '3', 'Super Fight': 'F' };
const ORDER = ['R32', 'R16', 'QF', 'SF', 'F'];

function divId(divName, wc) {
  const sex = /female/i.test(divName) ? 'w' : /male/i.test(divName) ? 'm' : 'x';
  if (/absolute/i.test(wc)) return sex + 'abs';
  if (/super/i.test(divName)) return 'sf-' + wc.replace(/\W+/g, '-').toLowerCase();
  const m = wc.match(/^([+-])\s*(\d+)/);
  return m ? sex + m[2] + (m[1] === '+' ? 'p' : '') : sex + wc.replace(/\W+/g, '-').toLowerCase();
}
function divLabel(divName, wc) {
  const w = /female/i.test(divName) ? "women's " : /male/i.test(divName) ? "men's " : '';
  if (/absolute/i.test(wc)) return w + 'absolute';
  if (/super/i.test(divName)) return 'super fight';
  const m = wc.match(/^([+-])\s*(\d+)/);
  return w + (m ? `${m[1]}${m[2]}kg` : wc);
}
const person = w => w ? { name: `${w.firstName || ''} ${w.lastName || ''}`.trim(), seed: w.seed ?? null, team: w.team?.name || null } : null;
function bout(x) {
  let w = null;
  if (x.winnerWrestlerGuid) {
    if (x.topWrestler && x.winnerWrestlerGuid === x.topWrestler.guid) w = 0;
    else if (x.bottomWrestler && x.winnerWrestlerGuid === x.bottomWrestler.guid) w = 1;
  }
  // decided with no winner (e.g. a double DQ): winType is set but the winner guid matches neither athlete
  const decided = w !== null || !!(x.winType && (x.topWrestler || x.bottomWrestler));
  return { n: x.boutNumber || null, a: person(x.topWrestler), b: person(x.bottomWrestler), w, decided,
    result: x.result || null, winType: x.winType || null, mat: x.mat?.name || null,
    video: /^https:\/\/([a-z0-9-]+\.)*flograppling\.com\//i.test(x.boutVideoUrl || '') ? x.boutVideoUrl : null,
    _g: x.guid, _to: x.winnerToBoutGuid, _toTop: x.winnerToTop, _lto: x.loserToBoutGuid, _num: Number(x.boutNumber) || 1e9, _spot: x.roundSpot ?? 0 };
}
const byNum = (a, b) => a._num - b._num || a._spot - b._spot;

// Order each round positionally from the tree links (bout m in round r feeds bout m>>1 in round r+1),
// falling back to bout-number order when links are missing.
function buildRounds(raw) {
  const byRound = {};
  for (const x of raw) { const r = ROUND[x.roundName?.displayName]; if (!r) continue; (byRound[r] ??= []).push(bout(x)); }
  const names = ORDER.filter(r => byRound[r]);
  const rounds = []; let next = null;
  for (let i = names.length - 1; i >= 0; i--) {
    let list = byRound[names[i]];
    if (next) {
      const ordered = [];
      for (const p of next) ordered.push(...list.filter(x => x._to === p._g).sort((x, y) => (y._toTop ? 1 : 0) - (x._toTop ? 1 : 0)));
      const rest = list.filter(x => !ordered.includes(x)).sort(byNum);
      list = [...ordered, ...rest];
    } else list = [...list].sort(byNum);
    rounds.unshift({ name: names[i], bouts: list }); next = list;
  }
  const third = (byRound['3'] || []).sort(byNum)[0] || null;
  const clean = b => { const { _g, _to, _toTop, _lto, _num, _spot, ...rest } = b; return rest; };
  return { rounds: rounds.map(r => ({ name: r.name, bouts: r.bouts.map(clean) })), third: third ? clean(third) : null };
}

const info = await get(`event/${EVENT}/info`);
const bracket = await get(`bracket/${EVENT}`);
const divs = [];
for (const d of bracket.divisions) {
  if (/^test$/i.test(d.name)) continue;
  for (const wc of d.weightClasses) {
    let raw = [];
    for (const p of wc.boutPools || []) raw = raw.concat(await get(`bracket/${EVENT}/bouts/${wc.guid}/pool/${p.guid}`));
    if (!raw.length) continue;
    const { rounds, third } = buildRounds(raw);
    if (!rounds.length) continue;
    const kind = /absolute/i.test(wc.name) ? 'abs' : /super/i.test(d.name) ? 'sf' : 'pro';
    divs.push({ id: divId(d.name, wc.name), name: divLabel(d.name, wc.name), sex: /female/i.test(d.name) ? 'w' : 'm', kind,
      size: rounds[0].bouts.length * 2, flo: { division: d.name, weightClass: wc.name, wcGuid: wc.guid }, rounds, third });
  }
}
// Upcoming order per mat, if FloArena publishes it (shape is best-effort; the page treats it as a hint).
let mats = [], upcomingShape = null;
try {
  const up = await get(`event/${EVENT}/upcoming-bouts`);
  const realWc = new Set(divs.map(d => d.flo.weightClass));
  const isTest = b => /\btest\b/i.test(b.weightClass?.division?.name || '') || b.weightClass?.name === '106' || /^test$/i.test(b.topWrestler?.firstName || '') || /^test$/i.test(b.bottomWrestler?.firstName || '') || (b.weightClass?.name && !realWc.has(b.weightClass.name));
  mats = (up || []).filter(m => m && m.name).map(m => ({ name: m.name, upcoming: (m.bouts || []).filter(x => !isTest(x.bout || x)).map(x => {
    const b = x.bout || x; // FloArena's bout shape, verified Sept 13
    return { n: b.boutNumber ?? b.number ?? null, weightClass: b.weightClass?.name || (typeof b.weightClass === 'string' ? b.weightClass : null),
      round: ROUND[b.roundName?.displayName] || b.roundName?.displayName || b.round || null,
      a: person(b.topWrestler)?.name || null, b: person(b.bottomWrestler)?.name || null };
  }) }));
  const first = (up || []).find(m => m && m.bouts?.length)?.bouts?.[0];
  if (first) { upcomingShape = Object.keys(first.bout || first); console.log('upcoming sample:', JSON.stringify(first).slice(0, 600)); }
  const listed = mats.reduce((n, m) => n + m.upcoming.length, 0), usable = mats.reduce((n, m) => n + m.upcoming.filter(u => u.n != null).length, 0);
  if (listed && !usable) { console.error(`upcoming-bouts lists ${listed} bouts but none yielded a bout number; fix the mapping in scripts/sync.mjs (see upcomingShape in results.json)`); process.exitCode = process.env.SYNC_STRICT ? 1 : 0; }
} catch (e) { console.warn('upcoming-bouts unavailable:', e.message); }

const out = { updated: new Date().toISOString(), event: { id: EVENT, name: info.name, status: info.status, tz: info.timeZone, start: info.startDate, end: info.endDate }, divs, mats, upcomingShape };
const json = JSON.stringify(out, null, 1);
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
const changed = prev.replace(/"updated": "[^"]+"/, '') !== json.replace(/"updated": "[^"]+"/, '');
if (changed || !prev) fs.writeFileSync(OUT, json);
let done = 0, total = 0;
for (const d of divs) for (const r of d.rounds) for (const b of r.bouts) { total++; if (b.w !== null) done++; }
console.log(`${changed ? 'updated' : 'no change'}: ${divs.length} divisions, ${done}/${total} bouts decided, upcoming on ${mats.filter(m => m.upcoming.length).length} mats`);
