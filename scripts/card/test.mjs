// node scripts/card/test.mjs — the fight-card projection, with no feed, a fresh observation, and a stale one.
import { project, follows, decided, schedUsable } from './engine.mjs';
import { parseCard } from './acbjj-sync.mjs';
import { buildSchedule, sig } from './smoothcomp-sync.mjs';

let n = 0;
const ok = (c, m) => { n++; if (!c) throw new Error('FAILED: ' + m); };
const min = m => m * 60000;
const START = Date.parse('2026-11-13T21:00:00Z');
const card = { start: '2026-11-13T21:00:00Z', slotMin: 15, bouts: [4, 3, 2, 1].map((num, i) => ({
  n: num, seq: i + 1, cat: 'match', a: { name: 'A' + num, abb: 'BRA', country: 'Brazil' }, b: { name: 'B' + num, abb: 'RUS', country: 'Russia' } })) };
const st = (p) => p.items.map(i => i.state).join(',');
const iso = t => new Date(t).toISOString();

// A) nothing recorded: the clock alone
let p = project(card, null, START - min(60));
ok(p.mode === 'clock' && st(p) === 'upcoming,upcoming,upcoming,upcoming', 'A before the start everything is upcoming');
ok(p.items[0].bout.n === 4 && p.items[0].at === START && p.items[3].at === START + min(45), 'A running order is seq, 15 minutes apart from the start');
p = project(card, { results: {} }, START + min(20));
ok(st(p) === 'pending,due,upcoming,upcoming', 'A by the clock the first bout is over (no result) and the second is due');
p = project(card, null, START + min(600));
ok(st(p) === 'pending,pending,pending,pending', 'A long after, nothing claims to be on');

// B) a bout seen on the mat a few minutes ago
let res = { updated: iso(START + min(22)), now: { n: 3, seenAt: iso(START + min(22)), startedAt: iso(START + min(20)) }, results: {} };
p = project(card, res, START + min(24));
ok(p.mode === 'observed' && st(p) === 'pending,live,upcoming,upcoming', 'B seen bout is live; the earlier one is pending, not upcoming');
ok(p.items[2].at === START + min(35), 'B the next bout starts a slot after the live one started');
p = project(card, res, START + min(40));
ok(p.items[2].at === START + min(42), 'B a live bout running long pushes the next one to just after now');

// C) the same observation gone stale: it stops claiming to be live and the clock carries on from it
p = project(card, res, START + min(22 + 30));
ok(p.mode === 'clock' && st(p) === 'pending,pending,pending,due', 'C a stale observation is not live');
ok(p.items[3].at === START + min(50), 'C the projection continues from where the observation left off');

// D) recorded results anchor the next start
res = { updated: iso(START + min(31)), now: null, results: { 4: { w: 0, how: 'submission', endedAt: iso(START + min(9)) }, 3: { w: 1, how: 'decision', endedAt: iso(START + min(30)) } } };
p = project(card, res, START + min(32));
ok(st(p) === 'done,done,upcoming,upcoming' && p.mode === 'observed', 'D decided bouts are done');
ok(p.items[2].at === START + min(34) && p.items[3].at === START + min(49), 'D next start is the last finish plus the gap');

// E) a result with a hole before it: the skipped bout is pending, never upcoming
res = { updated: iso(START + min(31)), results: { 3: { w: -1, how: 'draw', endedAt: iso(START + min(30)) } } };
p = project(card, res, START + min(32));
ok(st(p) === 'pending,done,upcoming,upcoming', 'E a bout before a recorded result cannot be upcoming');
ok(decided({ w: -1 }) && !decided({ w: null }) && !decided(undefined), 'E no-winner results count as decided');

// F) a result without a finish time still moves the night on
res = { updated: iso(START + min(40)), results: { 4: { w: 0 }, 3: { w: 0 } } };
p = project(card, res, START + min(41));
ok(p.items[2].state !== 'pending' && p.items[2].at >= START + min(30), 'F undated results fall back to slots, never before the last update');

// G) a live observation for a bout already decided is ignored
res = { updated: iso(START + min(12)), now: { n: 4, seenAt: iso(START + min(5)) }, results: { 4: { w: 0, endedAt: iso(START + min(11)) } } };
p = project(card, res, START + min(12));
ok(st(p) === 'done,upcoming,upcoming,upcoming', 'G decided beats a leftover live marker');

// H) follow matching: name, country, code
ok(follows(['costa'], { name: 'Felipe Costa', country: 'Brazil', abb: 'BRA' }), 'H partial name');
ok(follows(['Brazil'], { name: 'X Y', country: 'Brazil', abb: 'BRA' }) && follows(['usa'], { name: 'X', country: 'United States', abb: 'USA' }), 'H country or code');
ok(!follows(['Costa Rica'], { name: 'Felipe Costa', country: 'Brazil', abb: 'BRA' }) && !follows([''], { name: 'A' }), 'H no false match');

// I) the sync's parser: the official page embeds the card as a JS array, billed from the main event down
const html = `<script>(function () { var FIGHTS = [{"n":1,"cat":"Main Event Battle Match 100kg","a":{"name":"Rousimar Palhares","abb":"BRA","country":"Brazil","team":"T1","ig":"x","rec":"0-0"},"b":{"name":"Andre Galvao","abb":"BRA","country":"Brazil","team":"T2","rec":"1-0"}},
{"n":2,"cat":"Gi Match 60kg","a":{"name":"<b>Bad</b>","abb":"RUS","country":"Russia","team":"T3","rec":"0-0"},"b":{"name":"B Two","abb":"USA","country":"USA","team":"T4","rec":"0-0"}},
{"n":3,"cat":"Prelim","a":{"name":"C","abb":"BRA","country":"Brazil","team":"","rec":""},"b":{"name":"D","abb":"BRA","country":"Brazil","team":"","rec":""}}];
  var PRELIMS_FROM = 3;</script>`;
const c = parseCard(html);
ok(c.bouts.length === 3 && c.bouts.find(b => b.n === 3).seq === 1 && c.bouts.find(b => b.n === 1).seq === 3, 'I running order is the billing reversed');
ok(c.bouts.find(b => b.n === 3).prelim === true && c.bouts.find(b => b.n === 2).prelim === false, 'I prelims flagged from PRELIMS_FROM');
ok(!('ig' in c.bouts.find(b => b.n === 1).a) && c.bouts.find(b => b.n === 2).a.name === '<b>Bad</b>', 'I only known fields are kept; text is stored raw (the page escapes it)');
let threw = false; try { parseCard('<html>nothing</html>'); } catch (e) { threw = true; }
ok(threw, 'I a page without the card throws instead of writing an empty one');

// J) the organiser's schedule (Smoothcomp): its times replace the clock, its counts say what is on and what is over
const blocks = (o = {}) => [1, 2, 3, 4].map(q => ({ seq: q, start: iso(START + min(60 + (q - 1) * 11)), end: iso(START + min(60 + q * 11)), running: 0, finished: 0, total: 1, ...(o[q] || {}) }));
let sch = { ok: true, updated: iso(START), blocks: blocks() };
p = project(card, null, START + min(5), sch);
ok(p.mode === 'sched' && st(p) === 'upcoming,upcoming,upcoming,upcoming' && p.items[0].at === START + min(60) && p.items[2].at === START + min(82), 'J the schedule\'s own start times are used');
ok(p.signal === false && p.stale === false, 'J nothing has started yet and the read is fresh');
sch = { ok: true, updated: iso(START + min(75)), blocks: blocks({ 1: { finished: 1 }, 2: { running: 1 } }) };
p = project(card, null, START + min(76), sch);
ok(st(p) === 'pending,live,upcoming,upcoming' && p.items[0].finished === true && p.signal === true, 'J finished without a winner is pending+finished; a running block is live');
p = project(card, { results: { 4: { w: 1, how: 'points' } } }, START + min(76), sch);
ok(st(p) === 'done,live,upcoming,upcoming', 'J a recorded result still wins over the schedule');
sch = { ok: true, updated: iso(START + min(75)), blocks: blocks({ 3: { running: 1 } }) };
ok(st(project(card, null, START + min(76), sch)) === 'pending,pending,live,upcoming', 'J bouts before a running one cannot be upcoming');
sch = { ok: true, updated: iso(START), blocks: blocks() };
p = project(card, null, START + min(78), sch);
ok(st(p) === 'pending,due,upcoming,upcoming' && p.stale === true, 'J a schedule nobody is operating degrades to its clock, and says it is stale');
ok(!schedUsable(card, { ok: false, blocks: blocks() }) && !schedUsable(card, { ok: true, blocks: blocks().slice(1) }) && !schedUsable(card, null), 'J a mismatched or failed schedule is not used');
ok(project(card, null, START + min(20), { ok: false, blocks: blocks() }).mode === 'clock', 'J and the page falls back to the clock');

// K) the Smoothcomp sync: blocks ordered, counts read, and names checked against the card by rule set and weight
ok(sig('ACBJJ 23 / Grand Title No-Gi Match / 90kg') === sig('Grand Title No-Gi Match 90kg') && sig('SUPER CUP / GI / FINAL MATCH / ABSOLUTE / OVER 80KG') === sig('Gi Super Cup Final Match Absolute +80kg'), 'K category signatures agree across the two sites');
ok(sig('Battle Match 80kg') !== sig('No-Gi Match 80kg') && sig('Gi Match 80kg') !== sig('No-Gi Match 80kg') && sig('Gi Match 80kg') !== sig('Gi Match 90kg'), 'K and differ when the bout differs');
const c2 = { bouts: [{ n: 2, seq: 1, cat: 'Gi Match 60kg' }, { n: 1, seq: 2, cat: 'Main Event Battle Match 100kg' }] };
const sj = { blocks: [
  { name: 'ACBJJ 23 / Main Event Battle Match / 100kg', ordering: '1', estimated_start: '2026-11-13T19:11:00-03:00', estimated_end: '2026-11-13T19:24:00-03:00', running_matches_count: 0, finished_matches_count: 0, total_matches: 1 },
  { name: 'ACBJJ 23 / Gi Match / 60kg', ordering: '0', estimated_start: '2026-11-13T19:00:00-03:00', estimated_end: '2026-11-13T19:11:00-03:00', running_matches_count: '1', finished_matches_count: 0, total_matches: 1 }] };
let b2 = buildSchedule(sj, c2);
ok(b2.ok && b2.blocks[0].seq === 1 && b2.blocks[0].running === 1 && b2.blocks[0].start === '2026-11-13T22:00:00.000Z', 'K blocks sorted by ordering, times normalised to UTC');
ok(buildSchedule(sj, { bouts: [...c2.bouts].map(x => ({ ...x, seq: 3 - x.seq })) }).ok === false && buildSchedule({ blocks: sj.blocks.slice(1) }, c2).ok === false, 'K a reordered card or a missing block marks the schedule not ok');
threw = false; try { buildSchedule({ blocks: [] }, c2); } catch (e) { threw = true; }
ok(threw, 'K an empty schedule throws instead of overwriting a good file');

console.log(`ALL CARD CHECKS PASSED (${n} checks)`);
