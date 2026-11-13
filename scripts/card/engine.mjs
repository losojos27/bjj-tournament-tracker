// Projection for a fight-card event: one mat, single bouts in a fixed running order, no brackets.
// Pure (no Node or DOM), so the page imports it and scripts/card/test.mjs runs it.
//
// card:    { start: ISO instant, slotMin, bouts:[{n, seq, cat, prelim, a:{name,abb,country,team}, b:{…}}] }
//          n is the promoter's billing number (1 = main event); seq is the running order (1 = first on the mat).
// results: { updated: ISO, now: {n, seenAt, startedAt?} | null, results: { "<n>": {w, how, time, endedAt} } }
//          w is 0 (a won), 1 (b won) or -1 (no winner: draw, double DQ). Every field is optional: the event
//          has no machine feed, so the page must read sensibly with nothing but the card and a clock.
//
// project(card, results, nowMs, sched?) returns { mode, items } with items in running order:
//   state 'done'     decided
//         'live'     seen on the mat recently
//         'pending'  must be over (something later was seen, or its window passed) but no result is recorded
//         'due'      its projected window contains now, and nothing has been seen to confirm it
//         'upcoming'
//   at    projected start (ms) for due/upcoming, start for live when known, else null
// mode is 'sched' when the organiser's schedule is in use (see schedUsable), 'observed' when the position on the card comes from something seen in the last STALE minutes,
// else 'clock' (start time plus slot minutes only).

export const GAP_MIN = 4;      // walkouts and announcements between a finish and the next start
export const STALE_MIN = 25;   // an observation older than this no longer says what is on the mat

const ms = m => m * 60000;
const T = v => { const t = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(t) ? t : null; };

export function decided(r) { return !!r && (r.w === 0 || r.w === 1 || r.w === -1); }

// sched: data/<event>/schedule.json, the organiser's own mat schedule ({ok, updated, blocks:[{seq,start,end,running,
// finished,total}]}). When it is usable it replaces the clock arithmetic: each bout takes its block's estimated
// start, a block with a running match is live, and a finished block with no recorded result is 'pending' with
// finished:true (it is over; nobody has said who won). It carries no winners.
export function schedUsable(card, sched) {
  return !!sched && sched.ok === true && Array.isArray(sched.blocks) && sched.blocks.length === card.bouts.length &&
    sched.blocks.every(b => T(b.start) !== null && T(b.end) !== null);
}
function projectSched(card, results, nowMs, sched) {
  const R = (results && results.results) || {};
  const bouts = [...card.bouts].sort((x, y) => x.seq - y.seq);
  const blk = new Map(sched.blocks.map(b => [b.seq, b]));
  const over = b => { const k = blk.get(b.seq); return decided(R[b.n]) || k.finished >= (k.total || 1); };
  let anchor = -1;   // the last bout the schedule or a result says has started
  bouts.forEach((b, i) => { if (over(b) || blk.get(b.seq).running > 0) anchor = i; });
  const items = bouts.map((b, i) => {
    const k = blk.get(b.seq), r = R[b.n], at = T(k.start), end = T(k.end);
    if (decided(r)) return { bout: b, state: 'done', at: null, result: r };
    if (k.finished >= (k.total || 1)) return { bout: b, state: 'pending', at: null, result: null, finished: true };
    if (k.running > 0) return { bout: b, state: 'live', at, result: null };
    if (i < anchor) return { bout: b, state: 'pending', at: null, result: null };
    return { bout: b, state: nowMs >= end ? 'pending' : nowMs >= at ? 'due' : 'upcoming', at, result: null };
  });
  const upd = T(sched.updated);
  return { mode: 'sched', items, lastSeen: upd, signal: anchor >= 0, stale: upd === null || nowMs - upd > ms(STALE_MIN) };
}

export function project(card, results, nowMs, sched) {
  if (schedUsable(card, sched)) return projectSched(card, results, nowMs, sched);
  const slot = ms(card.slotMin || 15), R = (results && results.results) || {};
  const bouts = [...card.bouts].sort((x, y) => x.seq - y.seq);
  const obs = results && results.now && results.now.n != null ? results.now : null;
  const obsSeen = obs ? T(obs.seenAt) : null;
  const obsFresh = obsSeen !== null && nowMs - obsSeen <= ms(STALE_MIN);
  const liveIdx = obs ? bouts.findIndex(b => String(b.n) === String(obs.n) && !decided(R[b.n])) : -1;

  let anchor = -1;   // the last bout in running order that anything was seen of
  bouts.forEach((b, i) => { if (decided(R[b.n]) || i === liveIdx) anchor = i; });

  // where the clock stands after the anchor
  let cursor = T(card.start);
  if (anchor >= 0) {
    const b = bouts[anchor], r = R[b.n];
    if (decided(r)) {
      const end = T(r.endedAt);
      cursor = end !== null ? end + ms(GAP_MIN) : Math.max(cursor + (anchor + 1) * slot, T(results.updated) || 0);
    } else {
      const started = T(obs.startedAt) ?? obsSeen ?? nowMs;
      cursor = obsFresh ? Math.max(started + slot, nowMs + ms(2)) : started + slot;
    }
  }

  const items = bouts.map((b, i) => {
    const r = R[b.n];
    if (decided(r)) return { bout: b, state: 'done', at: null, result: r };
    if (i === liveIdx && obsFresh) return { bout: b, state: 'live', at: T(obs.startedAt), result: null };
    if (i <= anchor) return { bout: b, state: 'pending', at: null, result: null };
    const at = cursor; cursor += slot;
    return { bout: b, state: nowMs >= at + slot ? 'pending' : nowMs >= at ? 'due' : 'upcoming', at, result: null };
  });

  const lastSeen = Math.max(obsSeen || 0, ...Object.values(R).map(r => T(r.endedAt) || 0), (anchor >= 0 && T(results.updated)) || 0);
  const mode = anchor >= 0 && nowMs - lastSeen <= ms(STALE_MIN) ? 'observed' : 'clock';
  return { mode, items, lastSeen: lastSeen || null };
}

// a follow entry matches a fighter's name or country, partial and case-insensitive (same rule as the bracket page)
export function follows(list, p) {
  if (!p || !p.name) return false;
  const n = p.name.toLowerCase(), c = String(p.country || '').toLowerCase(), a = String(p.abb || '').toLowerCase();
  return (list || []).some(f => { const q = f && f.toLowerCase().trim(); return q && (n.includes(q) || c === q || a === q); });
}
