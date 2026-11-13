// node scripts/card/test.mjs — the fight-card projection, with no feed, a fresh observation, and a stale one.
import { project, follows, decided } from './engine.mjs';
import { parseCard } from './acbjj-sync.mjs';

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

console.log(`ALL CARD CHECKS PASSED (${n} checks)`);
