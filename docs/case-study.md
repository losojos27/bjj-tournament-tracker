# Bracket Tracker Build Notes

How a phone-first tournament tracker went from a chat prototype to a live, feed-driven page
during the ADCC World Championship 2026, built by Lee Owensby with Claude Code over one night
and the following morning. This is a record of the back-and-forth, not a tutorial. The point
is that almost nothing here came from a single prompt: the shape of the app was set by
screenshots from the arena, by a spectator persona finding the page confusing, and by Lee
reversing decisions with reasons.

## The numbers

| | |
| --- | --- |
| Active build time | about 4 hours on the night of Sept 12, about 4.5 on the morning of Sept 13 |
| Commits | 107, of which 57 by hand and 50 by the automated sync |
| Hand commits on Sept 13 | 32, most of them before the first bout at 11:00 |
| Spectator audits | 5, each producing a ranked list of confusions |
| Code reviews | 2, each producing 10 verified findings |
| Decisions reversed on the record | 6 |
| Lines of app, sync, and tests | about 865 |
| Live event covered | ADCC 2026, Kraków, both days |

## Where it started

The handoff was a single HTML file built in a Claude chat while Lee sat in the arena on Day 1.
Results were baked into the file by hand from FloArena screenshots. Each new batch of results
meant regenerating the file. It projected mat times from a running order Lee had observed, and
it had a "set as now" lever for correcting the projection when the day drifted.

The first request was ordinary: organise the folder, review the app, publish it somewhere
shareable. The review turned up that the app was single-user by construction, that the
projection could run into the past, and that the Day 2 order was a guess. The second request
changed the project: "try hard to find a way to get results at least somewhat live."

## Phase 1: finding the data (22:00 to 22:45)

FloArena's bracket page is a JavaScript shell with nothing useful in its HTML. Watching the
page's network traffic in Chrome exposed the JSON routes it calls: a bracket index, a per-division
bout list with winners and finish types, a per-mat upcoming list, and a recent-results endpoint.
Testing each from the shell showed the bout lists needed no auth and were not cached by the CDN,
while recent-results was cached for twenty minutes and had to be avoided.

The event info carried a Firebase host. That database turned out to be publicly readable and
cross-origin friendly, with a `mats` node holding the live scoreboard per mat: names, clock,
score, and the winner the moment a bout ended. That was the live layer, and it needed no server.

The architecture followed from what the browser could and couldn't do. The artifact host's
security policy blocks outbound fetches, so the page had to move to GitHub Pages. A sync script
pulls the bout lists into a results file; a GitHub Actions cron runs it and commits on change;
the page fetches that file every minute and the Firebase feed every fifteen seconds. Lee's
question, "can I close my MacBook and access it from my phone tomorrow?", was answerable with
yes only because nothing depended on his machine.

Two things were decided by data rather than design. The -66kg bracket had a double
disqualification, after which Flo slotted the loser of a different bout into the quarterfinal.
Rather than hand-code an override, the page renders each round from Flo's own participant
lists and only propagates winners when Flo leaves a slot empty. And Flo's athlete names differed
from the published brackets, so seeds, not names, became the join key.

## Phase 2: the shape of the page (22:45 to 00:15)

This is where the back-and-forth started, and where the app got most of its character.

**Day switch and a real bracket.** Lee's first UI note: the day choice was buried in settings,
and the bracket was an accordion that wasn't really a bracket. The accordion became a column
bracket with connectors drawn per slot, a division picker, and horizontal scroll on the phone.

**The theme.** Lee dropped a design kit into the repo with one instruction: integrate it, keep
nothing of the current styling unless it's load-bearing. The kit came with rules, one typeface,
no borders or shadows, an achromatic accent, everything lowercase. The bracket connectors were
the one edge kept. Two phone screenshots later: the type was too small in the arena and the dark
cards sat too close to the ground. The root size went up, the type tokens with it, and the dark
card tone was lifted within the kit's own token system.

**"You forgot to keep the followed fighter highlighting."** The win colour had been painting
over the follow colour. Follow won, and rows and bracket boxes with a followed fighter got a
tint. Then the follow colour itself changed because brick "makes it look like they were
eliminated". Teal, defined for both themes.

**The lever that went away.** The "set as now" control was first made clearer, then Lee said
it was confusing, then, told it was a button, said keep it, then within minutes: "just kill the
'mark as on the mat' button all together. it's unnecessary and confusing, plus the whole point
of this was to be more automated and very easily accessible, not accuracy to the second." The
lever and its state were removed. That sentence became a project rule.

**"Whoa, dude! overreact much?"** Asked whether the settings still needed start times and a
running order if the page yields to the data, Claude removed those and also the mat count, the
slot minutes, and the restore box, none of which had been named. Lee stopped the publish. Mats
and slot minutes came back, laid out one per row. The lesson was about scope: the questions had
been rhetorical about two settings, not a licence to strip the tab.

**Hand-entered results.** Removed outright. Every result comes from a feed or not at all.

**Flags and countries.** FloArena's team field is the country at ADCC. Flags became emoji built
from that field, placed left of the seed in both the queue and the bracket, an arrangement Lee
had reasoned through himself: it pushes the seed away from the bout number stacked above it.
Following a country follows everyone from it.

**Names copy, they don't link.** The proposal was bio links with a search fallback. Lee's
objection was practical: his friend's full name is Cassio Felipe Souza Costa and sites pick two
to four of those words at random. A tap copies the name instead. Finished bouts link to Flo's
video, which the data supports directly.

**Tabs to the top.** Modern Safari puts its own bar at the bottom; a fixed bottom nav stacked
against it. The tabs moved into a sticky header.

## Phase 3: the audit loop (00:15 to 01:30)

Lee asked for an audit agent that "assumes the role of a novice BJJ spectator". It became a
subagent with a persona: a friend who has never trained, standing in a loud arena, glancing at a
phone between matches, with three questions. What's on the mat? When is Lee's fighter up? Who
won? It walks the live page, taps what a newcomer would tap, and reports a ranked list of
confusions with the smallest fix for each, plus how many seconds each question took.

Five rounds ran between midnight and 08:00. Each found things a designer would not:

- The bracket snapped back to the left every fifteen seconds because the live poll redrew it.
  A real bug, introduced by the live layer.
- "SF" and "set as now" meant nothing. Rounds became words; finishes became "submission 6:53".
- Picking a day on one tab silently blanked the times on another.
- The header said "live" when nothing was happening.
- The tap-to-copy toast at 1.4 seconds was missed twice.
- Muted text on the follow tint measured 2.2:1 contrast on the one line that mattered.

Two findings were overruled with reasons that the audit couldn't have known. The eliminated
fighter's missing card: "I am going to show this to Felipe tomorrow and I don't want the first
thing for him to see is his elimination." The fix was a neutral "no scheduled matches" card, and
the reason went into the project notes so no future audit reopens it. And the -66kg bracket
showing a loser "coming back": that was faithful to Flo's data, so the fix was a label,
"Owen Jones in after the #39 disqualification", not hiding it.

By the fifth audit, the settled decisions list had grown long enough that each launch began
with what not to report.

## Phase 4: game day (07:30 to 12:00)

The morning exposed the operational side, which the night's work had barely tested.

**The cron didn't fire.** GitHub ran the five-minute schedule three times overnight, with
four-hour gaps. Each run was changed to loop internally for five and a half hours, so one fire
covers a competition day.

**Test wrestlers.** At 07:00 the arena crew ran a "Test" division through the live scoreboard
and the page dutifully showed three mats of "Test Wrestler 5". Lee: "the app is all kinds of
screwed up with a bunch of 'test wrestlers' fix it, I need it NOW." Filtered in both feeds
within minutes. A code review of that hurried filter later found it would also have hidden the
Absolute division before its bracket filled, and the filter was rebuilt.

**The outage.** At 11:45: "the results are not sticking. All semifinal bouts are complete but
the bracket does not reflect the results." Flo had all sixteen results. The looping sync had
been wedged since 09:42 because a hand commit of the results file made the loop's rebase
conflict, and every pass after that failed without a log line while the run showed "in
progress". The results were pushed by hand, the loop was changed to reset to origin before every
pass, and a rule was written: only the loop commits that file.

Lee's question afterwards, "do we not have unit testing to catch stuff like this?", got a
straight answer: one test existed, for the schedule engine, and this failure was between a shell
loop, git, and concurrent pushes, which no unit test would have seen. Two things were added that
would have caught it: an age-based staleness warning in the header, and an integration test that
runs the loop against a local bare repo and pushes a competing commit mid-loop.

**Intermissions.** "We are in the middle of a 30 minute intermission right now." No feed
announces those. A "break until" setting was added, then a rule that ADCC pauses thirty minutes
before the third-place bouts, then, from Lee, "an update from flo should always trump any
assumed stuff like that intermission." So a live or recorded third-place bout switches the
assumption off.

**The day selector went away.** "Shouldn't next up just be current and future?" It should. The
queue became every unfought bout in order, minus the ones on the mats, which have their own
cards. A finished bout leaves the mats and lives only in the bracket.

## Outcome

"I used the app all day on Sunday, Sept 13, the finals day of ADCC and it worked great. I
actually have no punch list for the UX/UI or app functionality at the moment."

## What made it work

- **Real screenshots from the real device.** The browser automation could not emulate the
  phone's width; Lee's two screenshots from the arena drove the type size, contrast, and the
  Safari bar change more than any inspection could.
- **The audit persona.** It found the redraw bug, the meaningless abbreviations, and the contrast
  failure, and it measured its own confusion in seconds. It was the highest-yield practice of the
  build.
- **Reasons attached to reversals.** Every "kill it" came with a why, and each why became a
  written rule: automation over precision, nothing entered by hand, the audience includes the
  fighters. The rules stopped the same argument from recurring.
- **Data before design.** The double-DQ bracket, the name mismatch, the test division, and the
  cached endpoint were all found by reading what the feeds actually returned, not what they
  should have returned.

## What would have been faster

Written for Lee, as the efficiency review he asked for.

1. **State the constraints that aren't visible in the code, early.** "No manual knobs,"
   "automation beats to-the-second accuracy," and "I show this page to the fighters" each
   arrived after work had been built against the opposite assumption. Together they cost about
   eight build-verify-push cycles.
2. **Batch small asks.** Each one-line request cost a full cycle of edit, local check, push,
   Pages deploy, and artifact republish, three to five minutes each. Twelve of the fifty-seven
   hand commits were single-line follow-ups. Sending three or four at once would have roughly
   halved the wall time of Phase 2.
3. **Run the audit before sending screenshots, not after.** The persona caught most of what the
   phone screenshots showed, and more, at no cost to Lee's attention.
4. **Scope discipline on the assistant's side.** Three reversals happened because the change
   went past the ask: the settings strip, the follow colour overriding wins, hiding the anchor
   button. Rhetorical questions were read as instructions.
5. **Ops rules as code, before the event.** The results-file rule, the staleness warning, and the
   loop test all arrived after the outage they would have prevented. Half an hour on the night
   before, spent asking "what happens when this runs unattended for six hours," would have found
   the cron problem and the rebase problem.
6. **One canonical link.** The artifact snapshot was republished after nearly every change, about
   thirty times, while the Pages URL was the one anyone used.
7. **Use the code review after risky changes, not cosmetic ones.** Both reviews earned their
   cost: one caught a test that would have gone permanently red after the event, the other caught
   a filter that would have hidden a real division on game day.

## Timeline

| Local time | What happened |
| --- | --- |
| Sept 12, 22:05 | Handoff folder reviewed; zip unpacked; artifact published; red flags reported |
| 22:15 | FloArena's JSON routes found by watching network traffic; Firebase feed found in event info |
| 22:26 | Sync script, live feed polling, GitHub Pages, Actions cron; repo created and renamed |
| 22:34 | Day switch on next up; column bracket replaces the accordion |
| 22:41 | Queue follows Flo's published order when present; mat count follows Flo's lists |
| 23:03 | First code review: ten findings on the mat-order logic, all fixed |
| 23:15 | Theme adopted; old styling removed |
| 23:22 | Phone screenshots: bigger type, dark contrast, follow highlight restored |
| 23:28 to 23:31 | Round names in words; "set as now" clarified, then kept, then removed |
| 23:35 to 23:36 | Settings stripped, called an overreaction, partly restored |
| 23:40 | Hand-entered results removed |
| 23:48 | Country flags; follow by country |
| 00:03 | Names copy to clipboard; finished bouts link to Flo video |
| 00:09 | Tabs move to a sticky top header; bottom nav removed |
| 00:17 | Spectator audit agent and skill created |
| 00:24 | Queue test rebuilt on its own fixture after the second code review |
| 00:37 to 01:15 | Audits one to three; eliminated fighter gets a neutral card |
| 01:30 to 01:35 | Audit four: tint-only follow colour, seeds hidden, flush-right bracket |
| 07:31 | Cron found unreliable; runs made to loop for five hours |
| 07:54 | Audit five: contrast on tinted cards, honest mats footer |
| 08:45 | Security audit: policy header, escaped label, validated video links |
| 09:43 | Test division filtered from both feeds |
| 11:46 | Results outage diagnosed and fixed; loop resets to origin each pass |
| 11:49 | Staleness warning; loop extracted and integration-tested; filter rebuilt |
| 11:52 to 11:56 | Day selector removed; break-until setting; intermission rule; Flo overrides it |
| 12:07 | Docs consolidated; work stops for the finals |
| Sept 15 | Verdict received; cron and routine switched off; next steps recorded |
