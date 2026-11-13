#!/usr/bin/env node
// Smoothcomp's mat schedule for ACBJJ 23 -> data/acbjj23/schedule.json (Node 18+, no deps).
//   node scripts/card/smoothcomp-sync.mjs
// ACBJJ runs its events on Smoothcomp (acbjj.smoothcomp.com, event 36384). The schedule page's own XHR,
// schedule/new/blocks.json?matIds[]=<mat>, is public JSON with no login and no bot check: one block per bout in
// mat order, each with Smoothcomp's estimated start/end (recalculated as the night runs) and running/finished
// match counts. It has no fighter names and no winners; the pages that do (matchlist, bracket, results) sit
// behind Cloudflare's browser check and are not fetched here. Names come from the official card
// (data/acbjj23/card.json), matched to blocks by running order and sanity-checked by weight and rule set.
// If that check fails the file says ok:false and the page ignores it rather than show times on the wrong bout.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = 'https://acbjj.smoothcomp.com/en/event/36384/schedule/new/blocks.json?matIds[]=209349';
const HEARTBEAT_MS = 10 * 60000;   // rewrite an unchanged schedule this often so the page can tell the sync is alive

const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const int = v => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);
// "ACBJJ 23 / Grand Title No-Gi Match / 90kg" and "Grand Title No-Gi Match 90kg" -> "no-gi 90"
export function sig(name) {
  const s = String(name || '').toLowerCase();
  const rule = /battle/.test(s) ? 'battle' : /no-?gi/.test(s) ? 'no-gi' : /\bgi\b/.test(s) ? 'gi' : '?';
  const kg = (s.match(/(\d{2,3})\s*kg/) || [])[1] || '?';
  return `${rule} ${kg}`;
}
export function buildSchedule(json, card) {
  const raw = json && Array.isArray(json.blocks) ? json.blocks : null;
  if (!raw || !raw.length) throw new Error('no blocks in the schedule');
  const blocks = [...raw].sort((a, b) => int(a.ordering) - int(b.ordering)).map((b, i) => ({
    seq: i + 1, name: String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    start: iso(b.estimated_start), end: iso(b.estimated_end),
    running: int(b.running_matches_count), finished: int(b.finished_matches_count), total: int(b.total_matches) || 1,
  }));
  const problems = [];
  if (blocks.some(b => !b.start || !b.end)) problems.push('a block has no estimated time');
  const bouts = [...card.bouts].sort((a, b) => a.seq - b.seq);
  if (bouts.length !== blocks.length) problems.push(`${blocks.length} blocks for ${bouts.length} bouts on the card`);
  else bouts.forEach((b, i) => { if (sig(b.cat) !== sig(blocks[i].name)) problems.push(`bout ${b.seq} "${b.cat}" does not match block "${blocks[i].name}"`); });
  return { ok: problems.length === 0, problems, source: 'smoothcomp', blocks };
}

async function main() {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/acbjj23');
  const out = resolve(dir, 'schedule.json');
  const card = JSON.parse(readFileSync(resolve(dir, 'card.json'), 'utf8'));
  const r = await fetch(SRC, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`schedule HTTP ${r.status}`);
  const body = buildSchedule(await r.json(), card);
  const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  const same = prev && JSON.stringify({ ...prev, updated: 0 }) === JSON.stringify({ updated: 0, ...body });   // same key order as the file
  if (same && Date.now() - Date.parse(prev.updated) < HEARTBEAT_MS) { console.log('schedule unchanged'); return; }
  writeFileSync(out, JSON.stringify({ updated: new Date().toISOString(), ...body }, null, 1) + '\n');
  const done = body.blocks.filter(b => b.finished >= b.total).length, on = body.blocks.filter(b => b.running > 0).map(b => b.seq);
  console.log(`wrote ${body.blocks.length} blocks: ${done} finished, running ${on.join(',') || 'none'}${body.ok ? '' : ' — NOT OK: ' + body.problems.join('; ')}`);
  if (!body.ok && process.env.SYNC_STRICT) process.exit(1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
