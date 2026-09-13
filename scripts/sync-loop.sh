#!/usr/bin/env bash
# Runs the FloArena sync repeatedly, committing and pushing data/results.json when it changes.
# Every pass starts from origin/main so a push from anywhere else can never wedge the loop.
#   SYNC_PASSES  how many passes (default 66)      SYNC_SLEEP  seconds between passes (default 300)
#   SYNC_CMD     the sync command (default: node scripts/sync.mjs)   SYNC_FILE  the file it writes (default: data/results.json)
#   SYNC_BRANCH  branch to push to (default: main)
set -u
PASSES="${SYNC_PASSES:-66}"; SLEEP="${SYNC_SLEEP:-300}"; CMD="${SYNC_CMD:-node scripts/sync.mjs}"; FILE="${SYNC_FILE:-data/results.json}"; BRANCH="${SYNC_BRANCH:-main}"
pushed=0
for i in $(seq 1 "$PASSES"); do
  git fetch -q origin "$BRANCH" && git reset -q --hard "origin/$BRANCH" || echo "::warning::could not reset to origin/$BRANCH on pass $i"
  bash -c "$CMD" || echo "::warning::sync exited non-zero on pass $i (see log above)"
  if ! git diff --quiet -- "$FILE"; then
    git add "$FILE"
    git commit -q -m "sync: results $(date -u +%Y-%m-%dT%H:%MZ)"
    if git push -q origin "HEAD:$BRANCH"; then pushed=$((pushed+1)); echo "pushed pass $i"; else echo "::warning::push failed on pass $i; will retry from origin next pass"; fi
  fi
  [ "$i" -lt "$PASSES" ] && sleep "$SLEEP"
done
echo "sync loop done: $pushed push(es) in $PASSES passes"
