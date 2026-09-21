// Competition simulator core: replays a finished event as a timeline.
// Pure functions, no Node imports, so the same file can run in a browser later.
//
// Time is "event seconds" since the first bout. A bout runs on its real mat, lasts its real
// finish time, and cannot start before the bouts that feed it are over. The server maps wall
// time onto event time with a speed multiplier.

export const ROUND_DISPLAY = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-Finals', SF: 'Semi-Finals', F: 'Finals', '3': '3rd Place' };
const ROUND_CODE = { R32: 'ROUND_OF_32', R16: 'ROUND_OF_16', QF: 'QUARTER_FINALS', SF: 'SEMI_FINALS', F: 'FINALS', '3': 'THIRD_PLACE' };

export const DEFAULTS = {
  changeover: 240,     // seconds a mat stays busy after a bout ends (walk-offs, walk-ons)
  intermission: 1800,  // before the first 3rd-place bout, as ADCC ran it
  dayBreak: 900,       // stand-in for the overnight gap before the first pro semifinal
  regulation: 600,     // seconds; a finish past this is overtime in 300 s periods
  upcomingPerMat: 4,   // how many not-yet-started bouts each mat lists, like FloArena's upcoming-bouts
};

export const parseFinish = result => { const m = String(result || '').match(/(\d+):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
export const parseScore = result => { const m = String(result || '').match(/^(\d+)-(\d+)/); return m ? [+m[1], +m[2]] : [0, 0]; };
const byMatName = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const keyOf = (d, rName, m) => `${d.id}|${rName}|${m}`;

// The keys of the bouts that must be over before slot `s` (0 = top, 1 = bottom) of a bout is known.
function feederKey(d, ri, rName, m, s) {
  if (rName === '3') { const sf = d.rounds[d.rounds.length - 2]; return sf && sf.bouts[s] ? keyOf(d, sf.name, s) : null; }
  if (ri <= 0) return null;
  const prev = d.rounds[ri - 1]; const pm = m * 2 + s;
  return prev && prev.bouts[pm] ? keyOf(d, prev.name, pm) : null;
}

export function buildTimeline(final, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const items = [];
  for (const d of final.divs) {
    d.rounds.forEach((r, ri) => r.bouts.forEach((b, m) => items.push({ d, ri, rName: r.name, m, b, key: keyOf(d, r.name, m) })));
    if (d.third) items.push({ d, ri: d.rounds.length - 1, rName: '3', m: 0, b: d.third, key: keyOf(d, '3', 0) });
  }
  items.sort((x, y) => (+x.b.n || 1e9) - (+y.b.n || 1e9));           // bout-number order is the running order
  const byKey = new Map(items.map(i => [i.key, i]));
  let matNames = [...new Set(items.map(i => i.b.mat).filter(Boolean))].sort(byMatName);
  if (!matNames.length) matNames = ['Mat 1', 'Mat 2', 'Mat 3'];
  const free = Object.fromEntries(matNames.map(n => [n, 0]));
  const earliestFree = () => matNames.reduce((best, n) => (free[n] < free[best] ? n : best), matNames[0]);

  let barrier = 0, maxOver = 0, seenThird = false, seenDayTwo = false;
  for (const it of items) {
    if (!seenDayTwo && it.d.kind === 'pro' && it.rName === 'SF') { seenDayTwo = true; barrier = Math.max(barrier, Math.max(...Object.values(free)) + o.dayBreak); }
    if (!seenThird && it.rName === '3') { seenThird = true; barrier = Math.max(barrier, maxOver + o.intermission); }
    const feeders = [0, 1].map(s => byKey.get(feederKey(it.d, it.ri, it.rName, it.m, s))).filter(f => f && f.over !== undefined);
    const mat = it.b.mat && free[it.b.mat] !== undefined ? it.b.mat : earliestFree();
    it.mat = mat;
    it.finish = Math.max(parseFinish(it.b.result) ?? o.regulation, 30);
    it.start = Math.max(free[mat], barrier, ...feeders.map(f => f.over + o.changeover));
    it.over = it.start + it.finish;
    free[mat] = it.over + o.changeover;
    maxOver = Math.max(maxOver, it.over);
  }
  return { items, byKey, matNames, total: Math.max(...items.map(i => i.over)) + o.changeover, options: o };
}

// Where "jump to" lands: just before the first bout of each stage.
export function jumpTargets(tl) {
  const first = pred => { const i = tl.items.filter(pred).sort((a, b) => a.start - b.start)[0]; return i ? Math.max(0, i.start - 20) : null; };
  const t = {
    start: 0,
    R16: first(i => i.d.kind === 'pro' && i.rName === 'R16'),
    QF: first(i => i.d.kind === 'pro' && i.rName === 'QF'),
    SF: first(i => i.d.kind === 'pro' && i.rName === 'SF'),
    third: first(i => i.d.kind === 'pro' && i.rName === '3'),
    finals: first(i => i.d.kind === 'pro' && i.rName === 'F'),
    absolute: first(i => i.d.kind === 'abs'),
    superfight: first(i => i.d.kind === 'sf'),
    end: tl.total,
  };
  for (const k of Object.keys(t)) if (t[k] === null) delete t[k];
  return t;
}

// results.json as the sync would have written it at event time `t`. The real sync snapshots results and the
// upcoming lists together every few minutes, so callers pass the time of the last snapshot, not "now".
export function resultsAt(final, tl, t, sim = {}, updatedMs = Date.now()) {
  const over = k => { const i = k && tl.byKey.get(k); return !!i && i.over <= t; };
  const view = (d, ri, rName, m, b) => {
    const done = over(keyOf(d, rName, m));
    const known = s => { const fk = feederKey(d, ri, rName, m, s); return fk === null ? true : over(fk); };   // Flo fills a slot once its feeder is decided
    return { n: b.n, a: known(0) ? b.a : null, b: known(1) ? b.b : null, w: done ? b.w : null, decided: done ? !!b.decided : false,
      result: done ? b.result : null, winType: done ? b.winType : null, mat: done ? b.mat : null, video: done ? b.video : null };
  };
  const divs = final.divs.map(d => ({ ...d,
    rounds: d.rounds.map((r, ri) => ({ name: r.name, bouts: r.bouts.map((b, m) => view(d, ri, r.name, m, b)) })),
    third: d.third ? view(d, d.rounds.length - 1, '3', 0, d.third) : null }));
  return { updated: new Date(updatedMs).toISOString(), event: final.event, divs, mats: upcomingAt(tl, t), upcomingShape: null, sim };
}

// FloArena's per-mat upcoming lists: bouts that have not started yet, in running order.
export function upcomingAt(tl, t) {
  const isOver = k => { const i = k && tl.byKey.get(k); return !!i && i.over <= t; };
  return tl.matNames.map(name => ({ name, upcoming: tl.items.filter(i => i.mat === name && i.start > t).sort((a, b) => a.start - b.start).slice(0, tl.options.upcomingPerMat)
    .map(i => { const vis = s => { const fk = feederKey(i.d, i.ri, i.rName, i.m, s); return fk === null || isOver(fk); };
      return { n: i.b.n, weightClass: i.d.flo?.weightClass || null, round: i.rName, a: vis(0) ? i.b.a?.name || null : null, b: vis(1) ? i.b.b?.name || null : null }; }) }));
}

const clockText = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const split = name => { const p = String(name || '').trim().split(/\s+/); return [p[0] || '', p.slice(1).join(' ')]; };

// FloArena's Firebase `mats` node at event time `t`: per mat, the bout in progress, or the last one finished.
export function matsFeedAt(final, tl, t, wallNow = Date.now(), speed = 1) {
  const feed = { 'sim-stale-entry': { updated: wallNow - 5 * 24 * 3600e3 } };   // the real feed carries a nameless entry like this; the page must skip it
  tl.matNames.forEach((name, idx) => {
    const onMat = tl.items.filter(i => i.mat === name && i.start <= t);
    if (!onMat.length) return;
    const it = onMat.reduce((a, b) => (b.start > a.start ? b : a));
    const live = t < it.over; const b = it.b; const reg = tl.options.regulation;
    const e = Math.min(t - it.start, it.finish);
    const ot = e > reg ? Math.ceil((e - reg) / 300) : 0;
    const [ws, ls] = parseScore(b.result); const redWon = b.w === 0;
    const showScore = !live || e >= it.finish * 0.7;               // ADCC points come late
    const red = showScore ? (redWon ? ws : ls) : 0, blue = showScore ? (redWon ? ls : ws) : 0;
    const [rf, rl] = split(b.a?.name), [bf, bl] = split(b.b?.name);
    feed[`sim-mat-${idx + 1}`] = {
      matName: name, boutId: `sim-${it.key}`, boutNumber: String(b.n), eventId: final.event?.id || 'sim',
      division: it.d.flo?.division || '', weight: it.d.flo?.weightClass || '', round: ROUND_DISPLAY[it.rName] || it.rName, roundCode: ROUND_CODE[it.rName] || '',
      redFirstName: rf, redLastName: rl, redSeed: b.a?.seed ?? null, redTeamName: b.a?.team || '', redScore: red, redPenalties: 0, redRecord: '',
      blueFirstName: bf, blueLastName: bl, blueSeed: b.b?.seed ?? null, blueTeamName: b.b?.team || '', blueScore: blue, bluePenalties: 0, blueRecord: '',
      clock: clockText(Math.max(0, reg + 300 * ot - e)), period: ot ? `TB${ot}` : '1', position: 'NEUTRAL', leader: 'NEUTRAL', folkstyle: false, isConsolation: it.rName === '3', measurementUnit: 'kg', ridingFlag: '0',
      isMatchOver: !live, winner: live ? undefined : b.w === 0 ? 'red' : b.w === 1 ? 'blue' : undefined, winType: live ? undefined : b.winType || undefined,
      finalScore: live ? undefined : `${red}-${blue}`,
      updated: live ? wallNow : Math.round(wallNow - ((t - it.over) / Math.max(speed, 0.001)) * 1000),
    };
  });
  return feed;
}

export function summaryAt(tl, t) {
  const decided = tl.items.filter(i => i.over <= t).length;
  const mats = tl.matNames.map(name => { const cur = tl.items.find(i => i.mat === name && i.start <= t && t < i.over);
    const next = tl.items.filter(i => i.mat === name && i.start > t).sort((a, b) => a.start - b.start)[0];
    return { name, now: cur ? `#${cur.b.n} ${cur.d.name} ${cur.rName}: ${cur.b.a?.name} v ${cur.b.b?.name}` : null, next: next ? `#${next.b.n} ${next.d.name} ${next.rName} in ${Math.round(next.start - t)}s` : null }; });
  return { decided, totalBouts: tl.items.length, mats };
}
