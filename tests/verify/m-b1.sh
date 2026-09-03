#!/usr/bin/env bash
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

COMMAND="config/agents/bin/nar-build.sh"
DROP="volumes/nar_extensions"
FIXTURE="/repos/.b1-hand"
OUT_DIR=".pr-drafts"
LOG="${OUT_DIR}/M-B1-verification.log"
DRAFT="${OUT_DIR}/M-B1-verification.md"
WORK="$(mktemp -d)"
BACKUP="${WORK}/nar-build.sh.bak"

mkdir -p "$OUT_DIR" "$DROP"
: > "$LOG"

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RST=$'\033[0m'
declare -a VERDICTS=()
FAILED=0

mapfile -t DROP_BEFORE < <(ls -1 "$DROP" 2>/dev/null | sort)

restore() {
  if [[ -s "$BACKUP" ]]; then
    cat "$BACKUP" > "$COMMAND"
    chmod 755 "$COMMAND"
    echo "${BOLD}restored${RST} ${COMMAND}"
  fi
  if [[ -n "${BUILDER_STOPPED:-}" ]]; then
    docker compose start nar_builder >/dev/null 2>&1
    await_builder
    echo "${BOLD}restarted${RST} nar_builder"
  fi
  docker compose exec -T openclaw-gateway sh -c "rm -rf ${FIXTURE}" >/dev/null 2>&1
  local f
  for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
    if ! printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f"; then
      rm -f "${DROP}/${f}"
      echo "${BOLD}removed${RST} ${DROP}/${f} (this run created it)"
    fi
  done
  rm -rf "$WORK"
}
trap restore EXIT INT TERM

await_builder() {
  local i
  for i in $(seq 1 60); do
    docker compose exec -T nar_builder sh -lc 'curl -fsS http://127.0.0.1:8770/health >/dev/null' \
      >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

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
  grep '(fail)' <<< "$1" | grep -o 'B1-[0-9]\+' | sort -u | tr '\n' ' '
}

require_stack() {
  local missing=""
  for svc in openclaw-gateway nar_builder liquid; do
    docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "$svc" || missing="${missing}${svc} "
  done
  if [[ -n "$missing" ]]; then
    echo "${RED}not running: ${missing}${RST}Start the stack first: ./scripts/linux/start.sh" >&2
    exit 2
  fi
}

require_stack
cat "$COMMAND" > "$BACKUP"

banner "Check 1 — the milestone suite (expect EXIT=0)"
run_suite m-b1 C1_OUT C1_CODE
echo "$C1_OUT" | tail -6
[[ $C1_CODE -eq 0 ]] && verdict "1 milestone suite green" yes "EXIT=0" \
                     || verdict "1 milestone suite green" no "EXIT=${C1_CODE}"

banner "Check 2 — the whole suite (expect EXIT=0)"
run_suite "" C2_OUT C2_CODE
echo "$C2_OUT" | tail -6
[[ $C2_CODE -eq 0 ]] && verdict "2 no regression across earlier milestones" yes "EXIT=0" \
                     || verdict "2 no regression across earlier milestones" no "EXIT=${C2_CODE}"

banner "Check 3 — a build by hand, from the container an agent works in"
C3_OUT="$(docker compose exec -T openclaw-gateway sh -lc '
set -e
P='"${FIXTURE}"'/src/main/java/org/nocodenation/probe
R='"${FIXTURE}"'/src/main/resources/META-INF/services
rm -rf '"${FIXTURE}"'; mkdir -p "$P" "$R"
cat > "$P/ProbeProcessor.java" <<EOF
package org.nocodenation.probe;

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class ProbeProcessor extends AbstractProcessor {
    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) { }
}
EOF
echo org.nocodenation.probe.ProbeProcessor > "$R/org.apache.nifi.processor.Processor"
cd '"${FIXTURE}"'
set +e
nar-build > /tmp/build.out 2>&1; echo "BUILD EXIT=$?"; tail -8 /tmp/build.out' 2>&1)"
echo "$C3_OUT"
log "$C3_OUT"

HAND_NAR="$(ls -1 "${DROP}"/*.nar 2>/dev/null | head -1)"
SPI=""
if [[ -n "$HAND_NAR" ]]; then
  rm -rf "${WORK}/nar"; mkdir -p "${WORK}/nar"
  unzip -q -o "$HAND_NAR" -d "${WORK}/nar" >/dev/null 2>&1
  for jar in "${WORK}"/nar/META-INF/bundled-dependencies/*.jar "${WORK}"/nar/NAR-INF/bundled-dependencies/*.jar; do
    [[ -f "$jar" ]] || continue
    SPI="$(unzip -p "$jar" META-INF/services/org.apache.nifi.processor.Processor 2>/dev/null)"
    [[ -n "$SPI" ]] && break
  done
fi
echo "NAR: ${HAND_NAR:-none}"
echo "SPI DESCRIPTOR: ${SPI:-none}"
log "NAR: ${HAND_NAR:-none}"
log "SPI DESCRIPTOR: ${SPI:-none}"
C3_OUT="${C3_OUT}"$'\n'"NAR: ${HAND_NAR:-none}"$'\n'"SPI DESCRIPTOR: ${SPI:-none}"

C3_WHY=""
grep -q '^BUILD EXIT=0$' <<< "$C3_OUT" || C3_WHY="${C3_WHY}nar-build did not exit 0; "
[[ -n "$HAND_NAR" ]] || C3_WHY="${C3_WHY}no .nar in ${DROP}; "
grep -q 'ProbeProcessor' <<< "$SPI" || C3_WHY="${C3_WHY}the NAR carries no SPI descriptor naming the processor; "
[[ -z "$C3_WHY" ]] && verdict "3 a hand build from the agent's container produces a loadable NAR" yes \
                              "exit 0, ${HAND_NAR##*/}, descriptor names ProbeProcessor" \
                   || verdict "3 a hand build from the agent's container produces a loadable NAR" no "${C3_WHY%; }"

banner "Check 4 — the unhappy path by hand, and the artifact already there"
BEFORE_SHA="$(shasum -a 256 "${DROP}"/*.nar 2>/dev/null | awk '{print $1}' | sort | tr '\n' ' ')"
BEFORE_LS="$(ls -1a "$DROP" | sort | tr '\n' ' ')"
C4_OUT="$(docker compose exec -T openclaw-gateway sh -lc '
cd '"${FIXTURE}"'
sed -i "s|public void onTrigger(ProcessContext context, ProcessSession session) { }|public void onTrigger(ProcessContext context, ProcessSession session) { int probe = \"probe\"; }|" \
  src/main/java/org/nocodenation/probe/ProbeProcessor.java
set +e
nar-build > /tmp/bad.out 2>&1; echo "BUILD EXIT=$?"; grep -m2 "incompatible types" /tmp/bad.out' 2>&1)"
AFTER_SHA="$(shasum -a 256 "${DROP}"/*.nar 2>/dev/null | awk '{print $1}' | sort | tr '\n' ' ')"
AFTER_LS="$(ls -1a "$DROP" | sort | tr '\n' ' ')"
echo "$C4_OUT"
echo "ARTIFACT SHA BEFORE: ${BEFORE_SHA:-none}"
echo "ARTIFACT SHA AFTER:  ${AFTER_SHA:-none}"
echo "DIRECTORY BEFORE: ${BEFORE_LS}"
echo "DIRECTORY AFTER:  ${AFTER_LS}"
C4_OUT="${C4_OUT}"$'\n'"ARTIFACT SHA BEFORE: ${BEFORE_SHA:-none}"$'\n'"ARTIFACT SHA AFTER:  ${AFTER_SHA:-none}"$'\n'"DIRECTORY BEFORE: ${BEFORE_LS}"$'\n'"DIRECTORY AFTER:  ${AFTER_LS}"
log "$C4_OUT"

C4_WHY=""
grep -q '^BUILD EXIT=0$' <<< "$C4_OUT" && C4_WHY="${C4_WHY}the broken source built; "
grep -q 'incompatible types' <<< "$C4_OUT" || C4_WHY="${C4_WHY}javac's message did not reach the caller; "
[[ -n "$BEFORE_SHA" ]] || C4_WHY="${C4_WHY}there was no artifact to leave stale; "
[[ "$BEFORE_SHA" == "$AFTER_SHA" ]] || C4_WHY="${C4_WHY}the artifact changed across the failed build — FR24 violated; "
[[ "$BEFORE_LS" == "$AFTER_LS" ]] || C4_WHY="${C4_WHY}a file appeared or vanished in ${DROP}; "
[[ -z "$C4_WHY" ]] && verdict "4 a failed build leaves the drop directory byte-for-byte as it was" yes \
                              "non-zero exit, 'incompatible types' in the output, same SHA-256 and same listing" \
                   || verdict "4 a failed build leaves the drop directory byte-for-byte as it was" no "${C4_WHY%; }"

banner "Check 5 — negative control: does nar-build decide?"
C5_REQUIRED="B1-3 B1-4 B1-5 B1-6 B1-7 B1-8 B1-9 B1-10 B1-11"
C5_FORBIDDEN="B1-1 B1-2 B1-12"
printf '#!/bin/sh\nexit 90\n' > "$COMMAND"
run_suite m-b1 C5_RED_OUT C5_RED_CODE
grep -i 'fail' <<< "$C5_RED_OUT" | head -8
cat "$BACKUP" > "$COMMAND"
chmod 755 "$COMMAND"
run_suite m-b1 C5_GREEN_OUT C5_GREEN_CODE
echo "$C5_GREEN_OUT" | tail -3
C5_CASES="$(failed_cases "$C5_RED_OUT")"
C5_OUT="with the command truncated in place: EXIT=${C5_RED_CODE}, cases red: ${C5_CASES:-none}"$'\n'"$(grep -i 'fail' <<< "$C5_RED_OUT" | head -10)"$'\n\n'"with its content restored: EXIT=${C5_GREEN_CODE}"
log "$C5_OUT"

C5_WHY=""
[[ $C5_RED_CODE -ne 0 ]] || C5_WHY="${C5_WHY}suite stayed green with the command stubbed; "
for case_id in $C5_REQUIRED; do
  grep -qw "$case_id" <<< "$C5_CASES" || C5_WHY="${C5_WHY}${case_id} stayed green without the command; "
done
for case_id in $C5_FORBIDDEN; do
  grep -qw "$case_id" <<< "$C5_CASES" && C5_WHY="${C5_WHY}${case_id} went red, and it does not use the command; "
done
[[ $C5_GREEN_CODE -eq 0 ]] || C5_WHY="${C5_WHY}suite did not recover with the command back (EXIT=${C5_GREEN_CODE}); "
[[ -z "$C5_WHY" ]] && verdict "5 the build cases are decided by nar-build" yes "stub in place: ${C5_CASES% } red, EXIT=${C5_RED_CODE}; content restored: EXIT=0" \
                   || verdict "5 the build cases are decided by nar-build" no "${C5_WHY%; }"

banner "Check 6 — negative control: do the build cases need the builder?"
C6_REQUIRED="B1-3 B1-4 B1-5 B1-6 B1-7 B1-8 B1-9 B1-10 B1-12"
C6_FORBIDDEN="B1-1 B1-2 B1-11"
docker compose stop nar_builder >/dev/null 2>&1
BUILDER_STOPPED=1
run_suite m-b1 C6_RED_OUT C6_RED_CODE
grep -i 'fail\|stack not running' <<< "$C6_RED_OUT" | head -8
docker compose start nar_builder >/dev/null 2>&1
await_builder || verdict "6 the builder came back" no "nar_builder did not answer on /health within 120s"
unset BUILDER_STOPPED
run_suite m-b1 C6_GREEN_OUT C6_GREEN_CODE
echo "$C6_GREEN_OUT" | tail -3
C6_CASES="$(failed_cases "$C6_RED_OUT")"
C6_OUT="with nar_builder stopped: EXIT=${C6_RED_CODE}, cases red: ${C6_CASES:-none}"$'\n'"$(grep -i 'fail\|stack not running' <<< "$C6_RED_OUT" | head -10)"$'\n\n'"with it running again: EXIT=${C6_GREEN_CODE}"
log "$C6_OUT"

C6_WHY=""
[[ $C6_RED_CODE -ne 0 ]] || C6_WHY="${C6_WHY}suite stayed green with the builder stopped; "
for case_id in $C6_REQUIRED; do
  grep -qw "$case_id" <<< "$C6_CASES" || C6_WHY="${C6_WHY}${case_id} stayed green without the builder; "
done
for case_id in $C6_FORBIDDEN; do
  grep -qw "$case_id" <<< "$C6_CASES" && C6_WHY="${C6_WHY}${case_id} went red, and it does not need the builder; "
done
[[ $C6_GREEN_CODE -eq 0 ]] || C6_WHY="${C6_WHY}suite did not recover after the builder came back (EXIT=${C6_GREEN_CODE}); "
[[ -z "$C6_WHY" ]] && verdict "6 the build cases genuinely need the builder" yes "builder stopped: ${C6_CASES% } red, EXIT=${C6_RED_CODE}; running again: EXIT=0" \
                   || verdict "6 the build cases genuinely need the builder" no "${C6_WHY%; }"

banner "Check 7 — the credential boundary, from inside the builder"
C7_OUT="$(docker compose exec -T nar_builder sh -lc '
echo "PATHS:"
ls -d /git-secrets 2>/dev/null
find / -xdev \( -name "id_ed25519" -o -name "id_rsa" \) -not -path "/proc/*" 2>/dev/null | head -3
echo "ENV KEYS:"
env | grep -Ei "KEY|SECRET|PASSWORD|TOKEN" | cut -d= -f1
echo "END"' 2>&1)"
echo "$C7_OUT"
log "$C7_OUT"

C7_PATHS="$(sed -n '/^PATHS:$/,/^ENV KEYS:$/p' <<< "$C7_OUT" | sed '1d;$d' | tr -d '[:space:]')"
C7_KEYS="$(sed -n '/^ENV KEYS:$/,/^END$/p' <<< "$C7_OUT" | sed '1d;$d' | tr -d '[:space:]')"
C7_WHY=""
[[ -z "$C7_PATHS" ]] || C7_WHY="${C7_WHY}a credential path is reachable inside the builder; "
[[ -z "$C7_KEYS" ]]  || C7_WHY="${C7_WHY}a credential-named environment key is set in the builder; "
grep -q '^END$' <<< "$C7_OUT" || C7_WHY="${C7_WHY}the scan did not run to completion; "
[[ -z "$C7_WHY" ]] && verdict "7 the builder holds no credentials" yes "no /git-secrets, no key file, no credential in the environment" \
                   || verdict "7 the builder holds no credentials" no "${C7_WHY%; }"

banner "Check 8 — clean up what this run created, and confirm"
docker compose exec -T openclaw-gateway sh -c "rm -rf ${FIXTURE}" >/dev/null 2>&1
for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
  printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f" || rm -f "${DROP}/${f}"
done
run_suite "" C8_OUT C8_CODE
echo "$C8_OUT" | tail -4
C8_LS="$(ls -1a "$DROP" | sort | tr '\n' ' ')"
C8_OUT="${DROP} after cleanup: ${C8_LS}"$'\n'"$(echo "$C8_OUT" | tail -6)"$'\n'"EXIT=${C8_CODE}"
log "$C8_OUT"
[[ $C8_CODE -eq 0 ]] && verdict "8 the suite is green again with the fixtures gone" yes "EXIT=0" \
                     || verdict "8 the suite is green again with the fixtures gone" no "EXIT=${C8_CODE}"

fence() { printf '```\n%s\n```\n' "$1"; }

{
  echo "## M-B1 — independent verification"
  echo
  echo "Run on the host with \`./tests/verify/m-b1.sh\` on $(date '+%Y-%m-%d %H:%M %Z'), following §4 of"
  echo "\`docs/TEST-SPEC-liquid-java-extensions.md\`. The script performs the same eight checks the section"
  echo "lists for hand execution, judges each one, and restores everything it moved — including on"
  echo "\`Ctrl-C\`. It removes only the artifacts this run created; anything that was in \`${DROP}\`"
  echo "beforehand is left alone."
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
  echo "<details><summary>Check 3 — a build by hand from the agent's container</summary>"; echo
  fence "$C3_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 4 — the unhappy path, and the artifact already there</summary>"; echo
  fence "$C4_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 5 — negative control: the command</summary>"; echo
  fence "${C5_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 6 — negative control: the builder</summary>"; echo
  fence "${C6_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 7 — the credential boundary from inside</summary>"; echo
  fence "$C7_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 8 — cleanup, and the suite again</summary>"; echo
  fence "${C8_OUT:-}"; echo "</details>"; echo
  echo "The full log of this run is in \`${LOG}\`."
  echo
  echo "Checks 3 and 4 are the pair that matters and they belong together: one proves a NAR is produced"
  echo "from the container an agent actually works in, the other that a failure produces nothing and"
  echo "**disturbs nothing**. Check 4 compares the artifact's SHA-256 across the failed build rather than"
  echo "counting files, because the failure FR24 guards against is a *stale* NAR that Liquid would load on"
  echo "the next restart, and a stale file is invisible to a check that only counts."
  echo
  echo "Check 5 replaces the command's **content** — truncated in place, never renamed, because"
  echo "\`nar-build\` is bind-mounted as a single file and a single-file mount follows the inode; a"
  echo "rename would leave the container reading the old file and the control would prove the opposite"
  echo "of its claim. Check 7 is asserted from inside the container on purpose: B1-1 reads"
  echo "\`compose.yml\`, which says what was *declared*, and only this says what is *reachable*."
} > "$DRAFT"

printf '\n%s=== summary ===%s\n' "$BOLD" "$RST"
for v in "${VERDICTS[@]}"; do
  IFS='|' read -r r n d <<< "$v"
  if [[ "$r" == PASS ]]; then printf '%s  PASS%s  %s\n' "$GREEN" "$RST" "$n"
  else printf '%s  FAIL%s  %s %s(%s)%s\n' "$RED" "$RST" "$n" "$DIM" "$d" "$RST"; fi
done
printf '\n  log:   %s\n  draft: %s\n\n' "$LOG" "$DRAFT"

exit $FAILED
