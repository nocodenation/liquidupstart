#!/usr/bin/env bash
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

HOOK_SOURCE="config/agents/hooks/pre-push"
COMMAND="config/agents/bin/git-publish.sh"
FIXTURE="/repos/.a7-hand"
SERVICE="openclaw-gateway"
OUT_DIR=".pr-drafts"
LOG="${OUT_DIR}/M-A7-verification.log"
DRAFT="${OUT_DIR}/M-A7-verification.md"
WORK="$(mktemp -d)"
HOOK_BACKUP="${WORK}/pre-push.bak"
COMMAND_BACKUP="${WORK}/git-publish.sh.bak"

mkdir -p "$OUT_DIR"
: > "$LOG"

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RST=$'\033[0m'
declare -a VERDICTS=()
FAILED=0

restore() {
  if [[ -s "$HOOK_BACKUP" ]]; then
    cat "$HOOK_BACKUP" > "$HOOK_SOURCE"
    chmod 755 "$HOOK_SOURCE"
    echo "${BOLD}restored${RST} ${HOOK_SOURCE}"
  fi
  if [[ -s "$COMMAND_BACKUP" ]]; then
    cat "$COMMAND_BACKUP" > "$COMMAND"
    chmod 755 "$COMMAND"
    echo "${BOLD}restored${RST} ${COMMAND}"
  fi
  docker compose exec -T "$SERVICE" sh -c "rm -rf ${FIXTURE}" >/dev/null 2>&1
  local leftover
  for leftover in volumes/repos/.a7-*; do
    [[ -e "$leftover" ]] || continue
    rm -rf "$leftover"
    echo "${BOLD}removed${RST} ${leftover} (a test fixture this run created)"
  done
  rm -rf "$WORK"
}
trap restore EXIT INT TERM

log() { printf '%s\n' "$*" >> "$LOG"; }

banner() {
  printf '\n%s=== %s ===%s\n' "$BOLD" "$1" "$RST"
  log ""
  log "=== $1 ==="
}

verdict() {
  local name="$1" ok="$2" detail="$3"
  if [[ "$ok" == "yes" ]]; then
    printf '%s  PASS%s  %s\n' "$GREEN" "$RST" "$name"
    VERDICTS+=("PASS|${name}|${detail}")
  else
    printf '%s  FAIL%s  %s %s(%s)%s\n' "$RED" "$RST" "$name" "$DIM" "$detail" "$RST"
    VERDICTS+=("FAIL|${name}|${detail}")
    FAILED=1
  fi
  log "VERDICT ${ok} — ${name} — ${detail}"
}

run_suite() {
  local filter="$1" out_var="$2" code_var="$3" out code
  if [[ -n "$filter" ]]; then
    out="$(./tests/run.sh "$filter" 2>&1)"; code=$?
  else
    out="$(./tests/run.sh 2>&1)"; code=$?
  fi
  printf -v "$out_var" '%s' "$out"
  printf -v "$code_var" '%s' "$code"
  log "$out"
  log "EXIT=$code"
}

failed_cases() {
  grep '(fail)' <<< "$1" | grep -o 'A7-[0-9]\+' | sort -u | tr '\n' ' '
}

require_stack() {
  local missing="" svc
  for svc in "$SERVICE" opencode; do
    docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "$svc" || missing="${missing}${svc} "
  done
  if [[ -n "$missing" ]]; then
    echo "${RED}not running: ${missing}${RST}Start the stack first: ./scripts/linux/start.sh" >&2
    exit 2
  fi
}

require_stack
cat "$HOOK_SOURCE" > "$HOOK_BACKUP"
cat "$COMMAND" > "$COMMAND_BACKUP"

banner "Check 1 — the milestone suite (expect EXIT=0)"
run_suite m-a7 C1_OUT C1_CODE
echo "$C1_OUT" | tail -6
[[ $C1_CODE -eq 0 ]] && verdict "1 milestone suite green" yes "EXIT=0" \
                     || verdict "1 milestone suite green" no "EXIT=${C1_CODE}"

banner "Check 2 — the whole suite (expect EXIT=0)"
run_suite "" C2_OUT C2_CODE
echo "$C2_OUT" | tail -6
[[ $C2_CODE -eq 0 ]] && verdict "2 no regression across earlier milestones" yes "EXIT=0" \
                     || verdict "2 no regression across earlier milestones" no "EXIT=${C2_CODE}"

banner "Check 3 — the chain by hand, from the container an agent works in"
C3_OUT="$(docker compose exec -T "$SERVICE" sh -lc '
set -e; rm -rf '"${FIXTURE}"'; mkdir -p '"${FIXTURE}"'; cd '"${FIXTURE}"'
git init -q -b main seed; cd seed
git config user.name Seed; git config user.email seed@local
echo seed > README.md; git add README.md; git commit -qm seed; cd ..
git clone -q --bare seed e2e.git
git clone -q e2e.git work; cd work
git config liquidupstart.access write; git config liquidupstart.policy protected
git checkout -q -b agent/probe; echo probe > notes.md; git add notes.md
git -c core.pager=cat commit -qm "add probe note"
echo "HOOKSPATH: $(git config --get core.hooksPath)"
set +e
git-publish >/tmp/e2e.out 2>&1; echo "PUBLISH EXIT=$?"; tail -3 /tmp/e2e.out
echo "ON REMOTE: $(git -C ../e2e.git log -1 --format=%s agent/probe 2>/dev/null || echo MISSING)"
echo "TOKEN: $(test -e .git/liquidupstart-publish && echo present || echo none)"' 2>&1)"
echo "$C3_OUT"
log "$C3_OUT"

C3_WHY=""
grep -q '^PUBLISH EXIT=0$' <<< "$C3_OUT" || C3_WHY="${C3_WHY}git-publish did not exit 0; "
grep -q '^ON REMOTE: add probe note$' <<< "$C3_OUT" || C3_WHY="${C3_WHY}the commit is not on the bare remote; "
grep -q 'HOOKSPATH: /git-secrets/hooks' <<< "$C3_OUT" || C3_WHY="${C3_WHY}the clone is not pointed at the shared hook; "
grep -q '^TOKEN: none$' <<< "$C3_OUT" || C3_WHY="${C3_WHY}a permission was left behind; "
[[ -z "$C3_WHY" ]] && verdict "3 the chain reaches the remote from the agent's container" yes \
                              "exit 0, agent/probe on e2e.git carrying 'add probe note', no token left" \
                   || verdict "3 the chain reaches the remote from the agent's container" no "${C3_WHY%; }"

banner "Check 4 — the same chain aimed at the protected default branch"
C4_OUT="$(docker compose exec -T "$SERVICE" sh -lc '
cd '"${FIXTURE}"'/work; set +e
git checkout -q main; echo direct > direct.md; git add direct.md
git -c core.pager=cat commit -qm "add direct note"
git-publish >/tmp/e2e-main.out 2>&1; echo "PUBLISH EXIT=$?"; head -3 /tmp/e2e-main.out
echo "REMOTE MAIN: $(git -C ../e2e.git log -1 --format=%s main)"
echo "REMOTE DIRECT: $(git -C ../e2e.git rev-parse --verify --quiet main:direct.md >/dev/null && echo present || echo absent)"' 2>&1)"
echo "$C4_OUT"
log "$C4_OUT"

C4_WHY=""
grep -q '^PUBLISH EXIT=0$' <<< "$C4_OUT" && C4_WHY="${C4_WHY}the publish onto main succeeded; "
grep -q 'git-publish refused' <<< "$C4_OUT" || C4_WHY="${C4_WHY}the refusal did not come from git-publish; "
grep -q 'main is the default branch here' <<< "$C4_OUT" || C4_WHY="${C4_WHY}the refusal does not name the branch; "
grep -q 'protected' <<< "$C4_OUT" || C4_WHY="${C4_WHY}the refusal does not name the policy; "
grep -q '^REMOTE MAIN: seed$' <<< "$C4_OUT" || C4_WHY="${C4_WHY}main on the remote moved; "
grep -q '^REMOTE DIRECT: absent$' <<< "$C4_OUT" || C4_WHY="${C4_WHY}the commit reached the remote anyway; "
[[ -z "$C4_WHY" ]] && verdict "4 the chain stops where it should" yes \
                              "non-zero exit, refusal names main and protected, remote still at seed" \
                   || verdict "4 the chain stops where it should" no "${C4_WHY%; }"

banner "Check 5 — two publications in one clone, overlapping"
C5_HAND="$(docker compose exec -T "$SERVICE" sh -lc '
cd '"${FIXTURE}"'/work; set +e
git checkout -q -b agent/probe-1 agent/probe; echo one > one.md; git add one.md
git -c core.pager=cat commit -qm one
git checkout -q -b agent/probe-2 agent/probe; echo two > two.md; git add two.md
git -c core.pager=cat commit -qm two
( git checkout -q agent/probe-1 && git-publish ) >/tmp/p1.out 2>&1 &
( sleep 0.2; git checkout -q agent/probe-2 && git-publish ) >/tmp/p2.out 2>&1 &
wait
published=0
for out in /tmp/p1.out /tmp/p2.out; do grep -q "published agent/" "$out" && published=$((published + 1)); done
echo "PUBLISHED LINES: ${published}"
echo "P1: $(tail -1 /tmp/p1.out)"
echo "P2: $(tail -1 /tmp/p2.out)"
refused=0
for out in /tmp/p1.out /tmp/p2.out; do grep -q refused "$out" && refused=$((refused + 1)); done
echo "REFUSALS: ${refused}"
echo "BRANCHES: $(git -C ../e2e.git branch --list "agent/*" | tr -d " " | tr "\n" " ")"
test -e .git/liquidupstart-publish && echo "TOKEN LEFT BEHIND -- FR18 violated" || echo "no token left"' 2>&1)"
echo "$C5_HAND"
log "$C5_HAND"

C5_BRANCHES="$(grep '^BRANCHES: ' <<< "$C5_HAND" | cut -d' ' -f2-)"
C5_LANDED=0
grep -qw 'agent/probe-1' <<< "$C5_BRANCHES" && C5_LANDED=$((C5_LANDED + 1))
grep -qw 'agent/probe-2' <<< "$C5_BRANCHES" && C5_LANDED=$((C5_LANDED + 1))
C5_REFUSALS="$(grep '^REFUSALS: ' <<< "$C5_HAND" | cut -d' ' -f2)"
C5_WHY=""
grep -q '^no token left$' <<< "$C5_HAND" || C5_WHY="${C5_WHY}a permission outlived both invocations; "
if [[ $C5_LANDED -lt 2 && "${C5_REFUSALS:-0}" -lt 1 ]]; then
  C5_WHY="${C5_WHY}a publication neither landed nor said why; "
fi
[[ $C5_LANDED -ge 1 ]] || C5_WHY="${C5_WHY}neither publication reached the remote; "
[[ -z "$C5_WHY" ]] && verdict "5 overlapping publications are safe or refuse, and leave no permission" yes \
                              "${C5_LANDED} of 2 branches landed, ${C5_REFUSALS:-0} refusal(s) in words, no token left" \
                   || verdict "5 overlapping publications are safe or refuse, and leave no permission" no "${C5_WHY%; }"

banner "Check 6 — negative control: does the hook decide?"
C6_REQUIRED="A7-3 A7-4"
C6_FORBIDDEN="A7-1 A7-2"
printf '#!/bin/sh\nexit 0\n' > "$HOOK_SOURCE"
chmod 755 "$HOOK_SOURCE"
run_suite m-a7 C6_RED_OUT C6_RED_CODE
grep -i 'fail' <<< "$C6_RED_OUT" | head -8
cat "$HOOK_BACKUP" > "$HOOK_SOURCE"
chmod 755 "$HOOK_SOURCE"
run_suite m-a7 C6_GREEN_OUT C6_GREEN_CODE
echo "$C6_GREEN_OUT" | tail -3
C6_CASES="$(failed_cases "$C6_RED_OUT")"
C6_OUT="with the hook truncated to a permissive stub: EXIT=${C6_RED_CODE}, cases red: ${C6_CASES:-none}"$'\n'"$(grep -i 'fail' <<< "$C6_RED_OUT" | head -10)"$'\n\n'"with its content restored: EXIT=${C6_GREEN_CODE}"
log "$C6_OUT"

C6_WHY=""
[[ $C6_RED_CODE -ne 0 ]] || C6_WHY="${C6_WHY}suite stayed green with the hook permissive; "
for case_id in $C6_REQUIRED; do
  grep -qw "$case_id" <<< "$C6_CASES" || C6_WHY="${C6_WHY}${case_id} stayed green without the hook refusing; "
done
for case_id in $C6_FORBIDDEN; do
  grep -qw "$case_id" <<< "$C6_CASES" && C6_WHY="${C6_WHY}${case_id} went red, and it does not depend on a refusal; "
done
[[ $C6_GREEN_CODE -eq 0 ]] || C6_WHY="${C6_WHY}suite did not recover with the hook back (EXIT=${C6_GREEN_CODE}); "
[[ -z "$C6_WHY" ]] && verdict "6 the token cases are decided by the hook" yes \
                              "stub in place: ${C6_CASES% } red, A7-1 and A7-2 green, EXIT=${C6_RED_CODE}; restored: EXIT=0" \
                   || verdict "6 the token cases are decided by the hook" no "${C6_WHY%; }"

banner "Check 7 — negative control: does git-publish decide?"
C7_REQUIRED="A7-1 A7-2 A7-3 A7-4"
printf '#!/bin/sh\nexit 90\n' > "$COMMAND"
chmod 755 "$COMMAND"
run_suite m-a7 C7_RED_OUT C7_RED_CODE
grep -i 'fail' <<< "$C7_RED_OUT" | head -8
cat "$COMMAND_BACKUP" > "$COMMAND"
chmod 755 "$COMMAND"
run_suite m-a7 C7_GREEN_OUT C7_GREEN_CODE
echo "$C7_GREEN_OUT" | tail -3
C7_CASES="$(failed_cases "$C7_RED_OUT")"
C7_OUT="with the command truncated in place: EXIT=${C7_RED_CODE}, cases red: ${C7_CASES:-none}"$'\n'"$(grep -i 'fail' <<< "$C7_RED_OUT" | head -10)"$'\n\n'"with its content restored: EXIT=${C7_GREEN_CODE}"
log "$C7_OUT"

C7_WHY=""
[[ $C7_RED_CODE -ne 0 ]] || C7_WHY="${C7_WHY}suite stayed green with the command stubbed; "
for case_id in $C7_REQUIRED; do
  grep -qw "$case_id" <<< "$C7_CASES" || C7_WHY="${C7_WHY}${case_id} stayed green without the command; "
done
[[ $C7_GREEN_CODE -eq 0 ]] || C7_WHY="${C7_WHY}suite did not recover with the command back (EXIT=${C7_GREEN_CODE}); "
[[ -z "$C7_WHY" ]] && verdict "7 every case in the milestone runs through git-publish" yes \
                              "stub in place: ${C7_CASES% } red, EXIT=${C7_RED_CODE}; content restored: EXIT=0" \
                   || verdict "7 every case in the milestone runs through git-publish" no "${C7_WHY%; }"

banner "Check 8 — clean up what this run created, and confirm"
docker compose exec -T "$SERVICE" sh -c "rm -rf ${FIXTURE}" >/dev/null 2>&1
for leftover in volumes/repos/.a7-*; do
  [[ -e "$leftover" ]] && rm -rf "$leftover"
done
C8_LS="$(ls -1a volumes/repos | sort | tr '\n' ' ')"
run_suite "" C8_OUT_RAW C8_CODE
echo "$C8_OUT_RAW" | tail -4
C8_OUT="volumes/repos after cleanup: ${C8_LS}"$'\n'"$(echo "$C8_OUT_RAW" | tail -6)"$'\n'"EXIT=${C8_CODE}"
log "$C8_OUT"
C8_WHY=""
[[ $C8_CODE -eq 0 ]] || C8_WHY="${C8_WHY}EXIT=${C8_CODE}; "
grep -q '\.a7-' <<< "$C8_LS" && C8_WHY="${C8_WHY}a fixture directory was left in the workspace; "
[[ -z "$C8_WHY" ]] && verdict "8 the suite is green again with the fixtures gone" yes "EXIT=0, no .a7-* left in volumes/repos" \
                   || verdict "8 the suite is green again with the fixtures gone" no "${C8_WHY%; }"

fence() { printf '```\n%s\n```\n' "$1"; }

{
  echo "## M-A7 — independent verification"
  echo
  echo "Run on the host with \`./tests/verify/m-a7.sh\` on $(date '+%Y-%m-%d %H:%M %Z'), following §9 of"
  echo "\`docs/TEST-SPEC-git-integration.md\`. The script performs the same eight checks the section lists"
  echo "for hand execution, judges each one, and restores everything it changed — including on"
  echo "\`Ctrl-C\`. It touches no \`.env\`, no GitHub remote and none of the operator's clones: the chain"
  echo "builds its own throwaway declaration and local bare remotes, under \`/repos/.a7-*\`, and removes"
  echo "them afterwards."
  echo
  echo "| Check | What it proves | Result |"
  echo "|---|---|---|"
  for v in "${VERDICTS[@]}"; do
    IFS='|' read -r r n d <<< "$v"
    printf '| %s | %s | **%s** — %s |\n' "${n%% *}" "${n#* }" "$r" "$d"
  done
  echo
  echo "### Output"
  echo
  echo "<details><summary>Check 1 — the milestone suite</summary>"; echo
  fence "$(echo "$C1_OUT" | tail -25)"; echo "</details>"; echo
  echo "<details><summary>Check 2 — the whole suite</summary>"; echo
  fence "$(echo "$C2_OUT" | tail -25)"; echo "</details>"; echo
  echo "<details><summary>Check 3 — the chain by hand from the agent's container</summary>"; echo
  fence "$C3_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 4 — the same chain aimed at the default branch</summary>"; echo
  fence "$C4_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 5 — two publications, overlapping, in one clone</summary>"; echo
  fence "$C5_HAND"; echo "</details>"; echo
  echo "<details><summary>Check 6 — negative control: the hook</summary>"; echo
  fence "${C6_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 7 — negative control: the command</summary>"; echo
  fence "${C7_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 8 — cleanup, and the suite again</summary>"; echo
  fence "${C8_OUT:-}"; echo "</details>"; echo
  echo "The full log of this run is in \`${LOG}\`."
  echo
  echo "Check 5 is the one worth reading slowly. Two \`git-publish\` invocations overlap in one clone,"
  echo "and the question is not whether both succeed — either outcome is acceptable — but whether a push"
  echo "was admitted by a permission another invocation minted. The last line is the assertion that"
  echo "matters: a token left behind after both have returned means one was written and never consumed,"
  echo "which is the shape a stolen permission takes."
  echo
  echo "The two controls divide the milestone between the artefacts that decide it, and the lists were"
  echo "derived from the sources before the run rather than read off it. **Check 6** makes the hook"
  echo "permissive — truncated in place, never renamed, because it is bind-mounted as a single file and a"
  echo "single-file mount follows the inode. A7-3 and A7-4 must go red, because each holds a probe that"
  echo "requires a refusal; A7-1 and A7-2 must stay green, because the happy chain does not need the hook"
  echo "to refuse anything and A7-2's refusal is \`git-publish\`'s own, decided before a push is"
  echo "attempted. **Check 7** truncates the command, and all four must go red: every case in the"
  echo "milestone publishes through it."
} > "$DRAFT"

printf '\n%s=== summary ===%s\n' "$BOLD" "$RST"
for v in "${VERDICTS[@]}"; do
  IFS='|' read -r r n d <<< "$v"
  if [[ "$r" == PASS ]]; then printf '%s  PASS%s  %s\n' "$GREEN" "$RST" "$n"
  else printf '%s  FAIL%s  %s %s(%s)%s\n' "$RED" "$RST" "$n" "$DIM" "$d" "$RST"; fi
done
printf '\n  log:   %s\n  draft: %s\n\n' "$LOG" "$DRAFT"

exit $FAILED
