#!/usr/bin/env node
// ACBJJ's official fight card -> data/acbjj23/card.json (Node 18+, no deps).
//   node scripts/card/acbjj-sync.mjs
// The card page (events.acbjj.com/card23.html) is static HTML with the card inline as `var FIGHTS = [...]`,
// billed from the main event (n = 1) down, and `var PRELIMS_FROM = 17`. The night runs in the reverse of that
// billing (checked against ACBJJ 22, where Tapology's recorded bout order was the site's list reversed), so
// seq = count - n + 1. The page carries no results and never has: results live in data/acbjj23/results.json,
// which this script does not touch.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const EVENT = {
  id: 'acbjj23', title: 'ACBJJ 23', place: 'Rio de Janeiro',
  source: 'https://events.acbjj.com/card23.html',
  watch: 'https://www.youtube.com/live/ZrKLsVbpIRc',
  start: '2026-11-13T22:00:00Z',   // 19:00 in Rio, the first bout on Smoothcomp's schedule (the stream opens an hour earlier)
  slotMin: 13,                     // Smoothcomp plans 11-13 minutes a bout; ACBJJ 22 averaged 15 on air
};
const str = (v, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const fighter = f => ({ name: str(f && f.name), abb: str(f && f.abb, 3).toUpperCase(), country: str(f && f.country, 40), team: str(f && f.team), rec: str(f && f.rec, 30) });

export function parseCard(html) {
  const m = String(html).match(/var FIGHTS\s*=\s*(\[[\s\S]*?\]);\s*\n/);
  if (!m) throw new Error('no FIGHTS array on the card page');
  const fights = JSON.parse(m[1]);
  if (!Array.isArray(fights) || !fights.length) throw new Error('empty card');
  const pf = Number((String(html).match(/var PRELIMS_FROM\s*=\s*(\d+)/) || [])[1]) || Infinity;
  const count = fights.length;
  const bouts = fights.map(f => {
    const n = Number(f.n);
    if (!Number.isInteger(n) || n < 1 || n > count || !f.a || !f.b) throw new Error('unexpected bout shape: ' + JSON.stringify(f).slice(0, 120));
    return { n, seq: count - n + 1, cat: str(f.cat, 90), prelim: n >= pf, a: fighter(f.a), b: fighter(f.b) };
  });
  if (new Set(bouts.map(b => b.n)).size !== count) throw new Error('duplicate bout numbers');
  return { bouts };
}

async function main() {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../data', EVENT.id, 'card.json');
  const r = await fetch(EVENT.source, { headers: { 'user-agent': 'Mozilla/5.0 (card sync)' } });
  if (!r.ok) throw new Error(`card page HTTP ${r.status}`);
  const { bouts } = parseCard(await r.text());
  const body = { ...EVENT, bouts };
  const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  if (prev && JSON.stringify({ ...prev, updated: 0 }) === JSON.stringify({ ...body, updated: 0 })) { console.log(`card unchanged (${bouts.length} bouts)`); return; }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ ...body, updated: new Date().toISOString() }, null, 1) + '\n');
  console.log(`wrote ${bouts.length} bouts to ${out}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
