#!/usr/bin/env bash
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

COMMAND="config/agents/bin/nar-build.sh"
ENTRYPOINT="config/liquid/entrypoint.sh"
CONTAINER_ENTRYPOINT="/opt/nifi/scripts/entrypoint.sh"
DROP="volumes/nar_extensions"
LIB="/opt/nifi/nifi-current/lib"
FIXTURE="/repos/.b2-hand"
OUT_DIR=".pr-drafts"
LOG="${OUT_DIR}/M-B2-verification.log"
DRAFT="${OUT_DIR}/M-B2-verification.md"
WORK="$(mktemp -d)"
BACKUP="${WORK}/nar-build.sh.bak"

mkdir -p "$OUT_DIR" "$DROP"
: > "$LOG"

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RST=$'\033[0m'
declare -a VERDICTS=()
FAILED=0

mapfile -t DROP_BEFORE < <(ls -1 "$DROP" 2>/dev/null | sort)

log() { printf '%s\n' "$*" >> "$LOG"; }

HTTPS_PORT="$(sed -n 's/^SYSTEM_HTTPS_PORT=\(.*\)$/\1/p' .env 2>/dev/null | tail -1)"
HTTPS_PORT="${HTTPS_PORT:-8833}"

await_liquid() {
  local i
  for i in $(seq 1 120); do
    docker compose exec -T nar_builder sh -lc \
      "curl -sk --max-time 5 -o /dev/null https://liquid:${HTTPS_PORT}/nifi" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

restore() {
  if [[ -s "$BACKUP" ]]; then
    cat "$BACKUP" > "$COMMAND"
    chmod 755 "$COMMAND"
    echo "${BOLD}restored${RST} ${COMMAND}"
  fi
  docker compose exec -T openclaw-gateway sh -c "rm -rf ${FIXTURE}" >/dev/null 2>&1
  local f
  for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
    if ! printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f"; then
      rm -f "${DROP}/${f}"
      echo "${BOLD}removed${RST} ${DROP}/${f} (this run created it)"
    fi
  done
  if [[ -n "${LIB_TOUCHED:-}" ]]; then
    docker compose exec -T liquid sh -c "rm -f ${LIB}/*b2-hand*.nar" >/dev/null 2>&1
    docker compose restart liquid >/dev/null 2>&1
    await_liquid
    echo "${BOLD}restarted${RST} liquid with the hand-built NAR removed from ${LIB}"
  fi
  rm -rf "$WORK"
}
trap restore EXIT INT TERM

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
  grep '(fail)' <<< "$1" | grep -o 'B2-[0-9]\+' | sort -u | tr '\n' ' '
}

require_stack() {
  local missing="" svc
  for svc in openclaw-gateway nar_builder liquid opencode; do
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
run_suite m-b2 C1_OUT C1_CODE
echo "$C1_OUT" | tail -6
[[ $C1_CODE -eq 0 ]] && verdict "1 milestone suite green" yes "EXIT=0" \
                     || verdict "1 milestone suite green" no "EXIT=${C1_CODE}"

banner "Check 2 — the whole suite (expect EXIT=0)"
run_suite "" C2_OUT C2_CODE
echo "$C2_OUT" | tail -6
[[ $C2_CODE -eq 0 ]] && verdict "2 no regression across everything before it" yes "EXIT=0" \
                     || verdict "2 no regression across everything before it" no "EXIT=${C2_CODE}"

banner "Check 3 — the resolved API, by hand, from the container an agent works in"
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
nar-build > /tmp/b2.out 2>&1; echo "BUILD EXIT=$?"
grep -E "^(nifi_version|nifi_api_version|nifi_api_source|java_version|built|wrote) " /tmp/b2.out
tail -3 /tmp/b2.out' 2>&1)"
echo "$C3_OUT"

HAND_NAR="$(ls -1t "${DROP}"/*.nar 2>/dev/null | head -1)"
BUNDLED=""
if [[ -n "$HAND_NAR" ]]; then
  BUNDLED="$(unzip -Z1 "$HAND_NAR" 2>/dev/null | grep -E 'nifi-api-.*\.jar|slf4j-api-.*\.jar' | tr '\n' ' ')"
fi
NIFI_V="$(grep -m1 '^nifi_version ' <<< "$C3_OUT" | awk '{print $2}')"
API_V="$(grep -m1 '^nifi_api_version ' <<< "$C3_OUT" | awk '{print $2}')"
echo "NAR: ${HAND_NAR:-none}"
echo "BUNDLED APIS: ${BUNDLED:-none}"
C3_OUT="${C3_OUT}"$'\n'"NAR: ${HAND_NAR:-none}"$'\n'"BUNDLED APIS: ${BUNDLED:-none}"
log "$C3_OUT"

C3_WHY=""
grep -q '^BUILD EXIT=0$' <<< "$C3_OUT" || C3_WHY="${C3_WHY}nar-build did not exit 0; "
[[ -n "$HAND_NAR" ]] || C3_WHY="${C3_WHY}no .nar in ${DROP}; "
[[ -n "$API_V" ]] || C3_WHY="${C3_WHY}the output states no nifi_api_version; "
grep -q '^nifi_api_source .*nifi-utils' <<< "$C3_OUT" || C3_WHY="${C3_WHY}the output does not say where the API version came from; "
[[ -z "$BUNDLED" ]] || C3_WHY="${C3_WHY}the NAR bundles ${BUNDLED}— FR27 violated; "
[[ -z "$C3_WHY" ]] && verdict "3 the API is resolved, stated, and not bundled" yes \
                              "NiFi ${NIFI_V}, nifi-api ${API_V} through nifi-utils, neither API inside the NAR" \
                   || verdict "3 the API is resolved, stated, and not bundled" no "${C3_WHY%; }"

banner "Check 3b — the entrypoint the container runs is the one on disk"
docker compose exec -T liquid cat "$CONTAINER_ENTRYPOINT" > "${WORK}/entrypoint.in-container" 2>/dev/null
C3B_DIFF="$(diff "${WORK}/entrypoint.in-container" "$ENTRYPOINT" 2>&1)"
C3B_OUT="diff <in-container ${CONTAINER_ENTRYPOINT}> <on-disk ${ENTRYPOINT}>:"$'\n'"${C3B_DIFF:-(identical)}"
echo "$C3B_OUT"
log "$C3B_OUT"

C3B_WHY=""
[[ -s "${WORK}/entrypoint.in-container" ]] || C3B_WHY="${C3B_WHY}the entrypoint could not be read from the container; "
[[ -z "$C3B_DIFF" ]] || C3B_WHY="${C3B_WHY}the container runs a different entrypoint than the file B2-5 and B2-6 read; "
[[ -z "$C3B_WHY" ]] && verdict "3b the container runs the entrypoint B2-5 and B2-6 assert" yes \
                               "${CONTAINER_ENTRYPOINT} is byte-identical to ${ENTRYPOINT}" \
                    || verdict "3b the container runs the entrypoint B2-5 and B2-6 assert" no "${C3B_WHY%; }"

banner "Check 4 — the artifact arrives (this restarts Liquid and interrupts every running flow)"
LIB_TOUCHED=1
docker compose restart liquid >/dev/null 2>&1
await_liquid || verdict "4 Liquid came back" no "liquid did not answer on its HTTPS port within 240s"
C4_LOG="$(docker compose logs liquid --since 5m 2>&1 \
  | grep -E 'Copying NARs|NAR deployment|No NAR files found|NAR file\(s\) in nar_extensions' | tail -8)"
C4_LIB="$(docker compose exec -T liquid sh -c "ls -1 ${LIB}/*.nar" 2>/dev/null | grep -i 'b2-hand' | tr '\n' ' ')"
C4_OUT="entrypoint on the log:"$'\n'"${C4_LOG:-(nothing)}"$'\n'"the NAR in ${LIB}: ${C4_LIB:-none}"
echo "$C4_OUT"
log "$C4_OUT"

C4_WHY=""
[[ -n "$C4_LIB" ]] || C4_WHY="${C4_WHY}the hand-built NAR is not in ${LIB} after the restart; "
grep -qi 'copying nars' <<< "$C4_LOG" || C4_WHY="${C4_WHY}the entrypoint said nothing about copying; "
grep -qi 'nar deployment complete' <<< "$C4_LOG" || C4_WHY="${C4_WHY}the entrypoint did not report the deployment as complete; "
[[ -z "$C4_WHY" ]] && verdict "4 the drop directory reaches Liquid's load path" yes \
                              "the NAR is in ${LIB} and the entrypoint named the copy" \
                   || verdict "4 the drop directory reaches Liquid's load path" no "${C4_WHY%; }"

banner "Check 5 — negative control: is check 4 measuring anything?"
for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
  printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f" || rm -f "${DROP}/${f}"
done
docker compose exec -T liquid sh -c "rm -f ${LIB}/*b2-hand*.nar" >/dev/null 2>&1
docker compose restart liquid >/dev/null 2>&1
await_liquid || verdict "5 Liquid came back" no "liquid did not answer on its HTTPS port within 240s"
C5_LIB="$(docker compose exec -T liquid sh -c "ls -1 ${LIB}/*.nar" 2>/dev/null | grep -ci 'b2-hand' | tr -d '[:space:]')"
C5_LOG="$(docker compose logs liquid --since 3m 2>&1 \
  | grep -E 'Copying NARs|NAR deployment|No NAR files found|NAR file\(s\) in nar_extensions' | tail -4)"
C5_OUT="with ${DROP} emptied and the artifact removed from ${LIB} first:"$'\n'"${C5_LOG:-(nothing)}"$'\n'"copies of the hand-built NAR now in ${LIB}: ${C5_LIB}"
echo "$C5_OUT"
log "$C5_OUT"

C5_WHY=""
[[ "$C5_LIB" == "0" ]] || C5_WHY="${C5_WHY}the NAR is in ${LIB} with nothing in the drop directory to put it there; "
grep -qi 'no nar files found' <<< "$C5_LOG" || C5_WHY="${C5_WHY}the entrypoint did not report an empty drop directory; "
[[ -z "$C5_WHY" ]] && verdict "5 the NAR arrives because the drop directory holds it" yes \
                              "empty drop directory, nothing named b2-hand in ${LIB}" \
                   || verdict "5 the NAR arrives because the drop directory holds it" no "${C5_WHY%; }"

banner "Check 6 — negative control: does nar-build decide?"
C6_REQUIRED="B2-1 B2-2 B2-3 B2-4"
C6_FORBIDDEN="B2-5 B2-6 B2-7 B2-8 B2-9"
printf '#!/bin/sh\nexit 90\n' > "$COMMAND"
run_suite m-b2 C6_RED_OUT C6_RED_CODE
grep -i 'fail' <<< "$C6_RED_OUT" | head -8
cat "$BACKUP" > "$COMMAND"
chmod 755 "$COMMAND"
run_suite m-b2 C6_GREEN_OUT C6_GREEN_CODE
echo "$C6_GREEN_OUT" | tail -3
C6_CASES="$(failed_cases "$C6_RED_OUT")"
C6_OUT="with the command truncated in place: EXIT=${C6_RED_CODE}, cases red: ${C6_CASES:-none}"$'\n'"$(grep -i 'fail' <<< "$C6_RED_OUT" | head -10)"$'\n\n'"with its content restored: EXIT=${C6_GREEN_CODE}"
log "$C6_OUT"

C6_WHY=""
[[ $C6_RED_CODE -ne 0 ]] || C6_WHY="${C6_WHY}suite stayed green with the command stubbed; "
for case_id in $C6_REQUIRED; do
  grep -qw "$case_id" <<< "$C6_CASES" || C6_WHY="${C6_WHY}${case_id} stayed green without the command; "
done
for case_id in $C6_FORBIDDEN; do
  grep -qw "$case_id" <<< "$C6_CASES" && C6_WHY="${C6_WHY}${case_id} went red, and it does not use the command; "
done
[[ $C6_GREEN_CODE -eq 0 ]] || C6_WHY="${C6_WHY}suite did not recover with the command back (EXIT=${C6_GREEN_CODE}); "
[[ -z "$C6_WHY" ]] && verdict "6 the API cases are decided by nar-build" yes \
                              "stub in place: ${C6_CASES% } red, EXIT=${C6_RED_CODE}; content restored: EXIT=0" \
                   || verdict "6 the API cases are decided by nar-build" no "${C6_WHY%; }"

banner "Check 7 — clean up what this run created, and confirm"
docker compose exec -T openclaw-gateway sh -c "rm -rf ${FIXTURE}" >/dev/null 2>&1
for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
  printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f" || rm -f "${DROP}/${f}"
done
docker compose exec -T liquid sh -c "rm -f ${LIB}/*b2-hand*.nar" >/dev/null 2>&1
docker compose restart liquid >/dev/null 2>&1
await_liquid || verdict "7 Liquid came back" no "liquid did not answer on its HTTPS port within 240s"
unset LIB_TOUCHED
run_suite "" C7_OUT C7_CODE
echo "$C7_OUT" | tail -4
C7_LS="$(ls -1a "$DROP" | sort | tr '\n' ' ')"
C7_OUT="${DROP} after cleanup: ${C7_LS}"$'\n'"$(echo "$C7_OUT" | tail -6)"$'\n'"EXIT=${C7_CODE}"
log "$C7_OUT"
[[ $C7_CODE -eq 0 ]] && verdict "7 the suite is green again with the fixtures gone" yes "EXIT=0" \
                     || verdict "7 the suite is green again with the fixtures gone" no "EXIT=${C7_CODE}"

fence() { printf '```\n%s\n```\n' "$1"; }

{
  echo "## M-B2 — independent verification"
  echo
  echo "Run on the host with \`./tests/verify/m-b2.sh\` on $(date '+%Y-%m-%d %H:%M %Z'), following §4 of"
  echo "\`docs/TEST-SPEC-liquid-java-extensions.md\`. The script performs the same checks the section lists"
  echo "for hand execution, judges each one, and restores everything it moved — including on \`Ctrl-C\`:"
  echo "the command's content, the hand-built fixture, the artifacts it wrote into \`${DROP}\`, and the"
  echo "copy of the NAR it caused Liquid to load into \`${LIB}\`. Anything that was in \`${DROP}\`"
  echo "beforehand is left alone. **Checks 4, 5 and 7 restart Liquid**, which interrupts every running"
  echo "flow — that is why they live here and not in the suite."
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
  echo "<details><summary>Check 3 — the resolved API by hand</summary>"; echo
  fence "$C3_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 3b — the entrypoint in the container against the one on disk</summary>"; echo
  fence "$C3B_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 4 — the artifact arrives</summary>"; echo
  fence "${C4_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 5 — negative control: it fails to arrive when nothing is dropped</summary>"; echo
  fence "${C5_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 6 — negative control: the command</summary>"; echo
  fence "${C6_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 7 — cleanup, and the suite again</summary>"; echo
  fence "${C7_OUT:-}"; echo "</details>"; echo
  echo "The full log of this run is in \`${LOG}\`."
  echo
  echo "Checks 4 and 5 are a pair and neither means much alone. Check 4 shows the NAR reaching"
  echo "\`${LIB}\`; only check 5 shows that it got there **because the drop directory held it** — the"
  echo "drop directory is emptied, the copy check 4 caused is removed from \`${LIB}\` as well, and after"
  echo "the restart the file must be *absent* rather than merely unchanged. Removing it from \`${LIB}\`"
  echo "too is what makes the control a control: a restart never deletes from \`lib/\`, so without that"
  echo "step check 5 would be reading the file check 4 put there and would pass whatever the drop"
  echo "directory did."
  echo
  echo "Check 3b exists because \`config/liquid/entrypoint.sh\` is \`COPY\`ed into"
  echo "\`liquidupstart/liquid:latest\`, not mounted: B2-5 and B2-6 read that file as text and run it in a"
  echo "sandbox, so they would stay green over a file the running container does not execute. The check"
  echo "reads the entrypoint out of the container and diffs it against the one the tests assert."
  echo
  echo "Check 6 replaces the command's **content** — truncated in place, never renamed, because"
  echo "\`nar-build\` is bind-mounted as a single file and a single-file mount follows the inode; a rename"
  echo "would leave the container reading the old file and the control would prove the opposite of its"
  echo "claim. Its two lists come from reading the sources rather than from watching a run: B2-1 calls"
  echo "\`nar-build --target\`, and B2-2, B2-3 and B2-4 each call \`nar-build\` against a fixture, so all"
  echo "four must go red. B2-5 and B2-6 execute \`config/liquid/entrypoint.sh\` in a temporary directory"
  echo "on the host, B2-7 and B2-8 read \`config/agents/skills/liquid/SKILL.md\`, and B2-9 scans"
  echo "\`openclaw-gateway\` and \`compose.yml\` — none of the five touches the command, so all five must"
  echo "stay green. A case outside both lists is the finding."
} > "$DRAFT"

printf '\n%s=== summary ===%s\n' "$BOLD" "$RST"
for v in "${VERDICTS[@]}"; do
  IFS='|' read -r r n d <<< "$v"
  if [[ "$r" == PASS ]]; then printf '%s  PASS%s  %s\n' "$GREEN" "$RST" "$n"
  else printf '%s  FAIL%s  %s %s(%s)%s\n' "$RED" "$RST" "$n" "$DIM" "$d" "$RST"; fi
done
printf '\n  log:   %s\n  draft: %s\n\n' "$LOG" "$DRAFT"

exit $FAILED
