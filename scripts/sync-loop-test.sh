#!/usr/bin/env bash
# Integration test for scripts/sync-loop.sh: a bare "origin", a runner clone running the loop with a fake sync
# that changes the file every pass, and a second clone that pushes a competing commit mid-loop.
# Asserts the loop keeps pushing after the outside push (the failure that wedged the real loop on Sept 13).
# Run: scripts/sync-loop-test.sh   (exits non-zero on failure)
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
git init -q --bare --initial-branch=main "$T/origin.git"
git init -q --initial-branch=main "$T/seed" && cd "$T/seed"
git config user.name t; git config user.email t@t
mkdir -p data && echo '{"v":0}' > data/results.json && git add . && git commit -q -m init
git remote add origin "$T/origin.git" && git push -q -u origin main
git -C "$T" clone -q -b main "$T/origin.git" runner && git -C "$T" clone -q -b main "$T/origin.git" other
for r in runner other; do git -C "$T/$r" config user.name t; git -C "$T/$r" config user.email t@t; done
cp "$HERE/scripts/sync-loop.sh" "$T/runner/sync-loop.sh"
# fake sync: bump a counter in the file each pass
cd "$T/runner"
SYNC_PASSES=3 SYNC_SLEEP=2 SYNC_FILE=data/results.json SYNC_CMD='n=$(cat data/results.json | tr -dc 0-9); echo "{\"v\":$((n+1))}" > data/results.json' bash sync-loop.sh > "$T/loop.log" 2>&1 &
LOOP=$!
sleep 1   # after pass 1 has pushed, push a competing commit from elsewhere (this is what wedged the old loop)
cd "$T/other" && git pull -q --rebase origin main && echo '{"v":100}' > data/results.json && echo other > other.txt && git add . && git commit -q -m "outside push" && git push -q origin main
wait $LOOP
cat "$T/loop.log"
cd "$T/seed" && git pull -q --rebase origin main
log="$(git log --format=%s)"
echo "$log" | grep -q "outside push" || { echo "FAIL: outside commit missing"; exit 1; }
after=$(git log --format=%s | awk '/outside push/{found=1; next} found' | wc -l)   # commits older than the outside push
newer=$(git log --format=%s | awk '/outside push/{exit} {print}' | grep -c '^sync: results' || true)
[ "$newer" -ge 1 ] || { echo "FAIL: the loop did not push again after the outside commit (newer sync commits: $newer)"; exit 1; }
grep -q "push failed" "$T/loop.log" && { echo "FAIL: a push failed in the loop"; exit 1; }
v=$(tr -dc 0-9 < data/results.json)
echo "PASS: loop survived an outside push ($newer sync commit(s) after it; final v=$v)"
