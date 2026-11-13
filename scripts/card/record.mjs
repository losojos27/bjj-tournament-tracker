#!/usr/bin/env node
// Record winners read off Smoothcomp's bracket pages into data/acbjj23/results.json.
//   node scripts/card/record.mjs '<seq>=<winner name>' ...
// Those pages sit behind a browser check, so they are read in Chrome and the names passed here; this script
// only maps a name to the card (it must be exactly one of that bout's two fighters) and never guesses.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/acbjj23');
const card = JSON.parse(readFileSync(resolve(dir, 'card.json'), 'utf8'));
const file = resolve(dir, 'results.json');
const res = JSON.parse(readFileSync(file, 'utf8'));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
let changed = 0;
for (const arg of process.argv.slice(2)) {
  const [seq, name] = arg.split('=');
  const b = card.bouts.find(x => x.seq === Number(seq));
  if (!b) throw new Error('no bout with seq ' + seq);
  const w = norm(name) === norm(b.a.name) ? 0 : norm(name) === norm(b.b.name) ? 1 : null;
  if (w === null) throw new Error(`"${name}" is not in bout ${seq} (${b.a.name} v ${b.b.name})`);
  const prev = res.results[b.n];
  if (prev && prev.w === w) continue;
  res.results[b.n] = { w, endedAt: new Date().toISOString() };
  console.log(`bout ${seq} (#${b.n}): ${w ? b.b.name : b.a.name}`);
  changed++;
}
if (changed) { res.updated = new Date().toISOString(); writeFileSync(file, JSON.stringify(res, null, 1) + '\n'); }
else console.log('nothing new');
