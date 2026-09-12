---
name: spectator-audit
description: Run the novice-spectator agent against the live tracker (or a URL you pass) and relay its ranked list of confusions. Use when Lee asks for a spectator audit, a fresh-eyes review, or "would a newbie get this".
---

Launch the `novice-spectator` agent with the Agent tool (`subagent_type: "novice-spectator"`).

Prompt it with:
- the URL to audit: the argument if one was given, else `https://losojos27.github.io/bjj-tournament-tracker/`
- the current local date and time (run `date`), so it knows whether the event is live, between
  days, or over, and can judge empty states fairly
- a reminder that it is read-only and must close its browser tab

Wait for it to finish. Then relay its findings to Lee verbatim in structure (ranked list, then
the three timed answers). Don't soften severities and don't add fixes of your own; if you
disagree with an item, say so in one line after the list. Do not change any code as part of
this skill. If Lee then asks to act on items, that is a separate request.
