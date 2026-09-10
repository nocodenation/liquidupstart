#!/usr/bin/env bash
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

DROP="volumes/nar_extensions"
LIB="/opt/nifi/nifi-current/lib"
GOOD="/repos/.b4-hand"
BAD="/repos/.b4-mismatch"
GOOD_NAR="b4-hand-nar-1.0.0.nar"
BAD_NAR="probe-mismatch-1.0.0.nar"
GOOD_TYPE="org.nocodenation.probe.ProbeProcessor"
BAD_TYPE="org.nocodenation.probe.MismatchProcessor"
MISSING_CLASS="org.apache.nifi.controller.NodeConnectionState"
OUT_DIR=".pr-drafts"
LOG="${OUT_DIR}/M-B4-verification.log"
DRAFT="${OUT_DIR}/M-B4-verification.md"
WORK="$(mktemp -d)"

mkdir -p "$OUT_DIR" "$DROP"
: > "$LOG"

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RST=$'\033[0m'
declare -a VERDICTS=()
FAILED=0

DROP_BEFORE=()
while IFS= read -r line; do DROP_BEFORE+=("$line"); done < <(ls -1 "$DROP" 2>/dev/null | sort)

log() { printf '%s\n' "$*" >> "$LOG"; }

get_env() {
  grep -E "^${1}=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "'\"" || true
}

HTTPS_PORT="$(get_env SYSTEM_HTTPS_PORT)"
HTTPS_PORT="${HTTPS_PORT:-8833}"
LIQUID_USERNAME="$(get_env LIQUID_USERNAME)"
LIQUID_PASSWORD="$(get_env LIQUID_PASSWORD)"
LIQUID_HOST="${NAR_VERIFY_LIQUID_HOST:-localhost}"

API="https://${LIQUID_HOST}:${HTTPS_PORT}"
CONTROL_TYPE="org.apache.nifi.processors.standard.GenerateFlowFile"

liquid_token() {
  docker compose exec -T liquid sh -c \
    "curl -sk --max-time 20 -X POST -d 'username=${LIQUID_USERNAME}&password=${LIQUID_PASSWORD}' \
     ${API}/nifi-api/access/token" 2>/dev/null | tr -d '\r'
}

processor_types() {
  local token
  token="$(liquid_token)"
  case "$token" in
    "") echo "NO-TOKEN"; return 1 ;;
    "<"*|*" "*) echo "NOT-A-TOKEN ${token}"; return 1 ;;
    *.*.*) ;;
    *) echo "NOT-A-TOKEN ${token}"; return 1 ;;
  esac
  docker compose exec -T liquid sh -c \
    "curl -sk --max-time 30 -H 'Authorization: Bearer ${token}' \
     ${API}/nifi-api/flow/processor-types" 2>/dev/null
}

restart_liquid() {
  local before after i
  before="$(docker compose ps -q liquid | xargs -r docker inspect -f '{{.State.StartedAt}}' 2>/dev/null)"
  docker compose restart liquid >/dev/null 2>&1
  for i in $(seq 1 60); do
    after="$(docker compose ps -q liquid | xargs -r docker inspect -f '{{.State.StartedAt}}' 2>/dev/null)"
    [[ -n "$after" && "$after" != "$before" ]] && return 0
    sleep 2
  done
  return 1
}

await_liquid() {
  local i types
  for i in $(seq 1 150); do
    types="$(processor_types)"
    case "$types" in
      *"${CONTROL_TYPE}"*) return 0 ;;
    esac
    sleep 2
  done
  return 1
}

restore() {
  docker compose exec -T openclaw-gateway sh -c "rm -rf ${GOOD} ${BAD}" >/dev/null 2>&1
  local f
  for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
    if ! printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f"; then
      rm -f "${DROP}/${f}"
      echo "${BOLD}removed${RST} ${DROP}/${f} (this run created it)"
    fi
  done
  if [[ -n "${LIB_TOUCHED:-}" ]]; then
    docker compose exec -T liquid sh -c "rm -f ${LIB}/${GOOD_NAR} ${LIB}/${BAD_NAR}" >/dev/null 2>&1
    restart_liquid || { echo "liquid did not restart" >&2; }
    await_liquid
    echo "${BOLD}restarted${RST} liquid with both hand-built NARs removed from ${LIB}"
  fi
  rm -rf "$WORK"
}
trap restore EXIT
trap 'exit 130' INT TERM

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
[[ -n "$LIQUID_USERNAME" && -n "$LIQUID_PASSWORD" ]] || {
  echo "${RED}LIQUID_USERNAME / LIQUID_PASSWORD are not in .env${RST}, and checks 3 to 5 read Liquid's API" >&2
  exit 2
}
await_liquid || { echo "liquid did not answer on its HTTPS API within 300s" >&2; exit 2; }

banner "Check 0 — the container runs the entrypoint and the parser this milestone changed"
docker compose exec -T liquid cat /opt/nifi/scripts/entrypoint.sh > "${WORK}/entrypoint.in-container" 2>/dev/null
docker compose exec -T liquid cat /opt/nifi/scripts/narcheck.py > "${WORK}/narcheck.in-container" 2>/dev/null
C0_E="$(diff "${WORK}/entrypoint.in-container" config/liquid/entrypoint.sh 2>&1)"
C0_N="$(diff "${WORK}/narcheck.in-container" config/liquid/narcheck.py 2>&1)"
C0_OUT="diff entrypoint.sh:"$'\n'"${C0_E:-(identical)}"$'\n'"diff narcheck.py:"$'\n'"${C0_N:-(identical)}"
echo "$C0_OUT"
log "$C0_OUT"
C0_WHY=""
[[ -s "${WORK}/entrypoint.in-container" ]] || C0_WHY="${C0_WHY}the entrypoint could not be read from the container; "
[[ -s "${WORK}/narcheck.in-container" ]] || C0_WHY="${C0_WHY}narcheck.py is not in the container at all; "
[[ -z "$C0_E" && -z "$C0_N" ]] || C0_WHY="${C0_WHY}the container runs something other than the files B4-1 to B4-6 read — rebuild it: ./config/scripts/build/liquid.sh && docker compose up -d --no-deps liquid; "
[[ -z "$C0_WHY" ]] && verdict "0 the container runs the files on disk" yes \
                              "/opt/nifi/scripts/{entrypoint.sh,narcheck.py} are byte-identical to config/liquid/" \
                   || verdict "0 the container runs the files on disk" no "${C0_WHY%; }"

banner "Check 1 — the milestone suite (expect EXIT=0)"
run_suite m-b4 C1_OUT C1_CODE
echo "$C1_OUT" | tail -6
[[ $C1_CODE -eq 0 ]] && verdict "1 milestone suite green" yes "EXIT=0" \
                     || verdict "1 milestone suite green" no "EXIT=${C1_CODE}"

banner "Check 2 — the whole suite (expect EXIT=0)"
run_suite "" C2_OUT C2_CODE
echo "$C2_OUT" | tail -6
[[ $C2_CODE -eq 0 ]] && verdict "2 no regression across everything before it" yes "EXIT=0" \
                     || verdict "2 no regression across everything before it" no "EXIT=${C2_CODE}"

banner "Check 3 — B4-8: both NARs in the drop directory, one restart (this interrupts every running flow)"
C3_BUILD="$(docker compose exec -T openclaw-gateway sh -lc "
set -e
P=${GOOD}/src/main/java/org/nocodenation/probe
R=${GOOD}/src/main/resources/META-INF/services
rm -rf ${GOOD}; mkdir -p \"\$P\" \"\$R\"
cat > \"\$P/ProbeProcessor.java\" <<'JAVA'
package org.nocodenation.probe;

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class ProbeProcessor extends AbstractProcessor {
    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) { }
}
JAVA
echo ${GOOD_TYPE} > \"\$R/org.apache.nifi.processor.Processor\"
D=${BAD}
P=\$D/src/main/java/org/nocodenation/probe
R=\$D/src/main/resources/META-INF/services
rm -rf \$D; mkdir -p \"\$P\" \"\$R\"
cat > \"\$P/MismatchProcessor.java\" <<'JAVA'
package org.nocodenation.probe;

import org.apache.nifi.controller.NodeConnectionState;
import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class MismatchProcessor extends AbstractProcessor {
    public NodeConnectionState state() {
        return NodeConnectionState.CONNECTED;
    }

    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) {
        getLogger().debug(\"probe {}\", new Object[] { state() });
    }
}
JAVA
echo ${BAD_TYPE} > \"\$R/org.apache.nifi.processor.Processor\"
cat > \"\$D/pom.xml\" <<'POM'
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<project xmlns=\"http://maven.apache.org/POM/4.0.0\"
         xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"
         xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd\">
  <modelVersion>4.0.0</modelVersion>
  <groupId>org.nocodenation.probe</groupId>
  <artifactId>probe-mismatch</artifactId>
  <version>1.0.0</version>
  <packaging>nar</packaging>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>21</maven.compiler.release>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-api</artifactId>
      <version>2.11.0</version>
      <scope>provided</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.nifi</groupId>
        <artifactId>nifi-nar-maven-plugin</artifactId>
        <version>2.4.0</version>
        <extensions>true</extensions>
      </plugin>
    </plugins>
  </build>
</project>
POM
set +e
nar-build ${GOOD} > /tmp/b4good.out 2>&1; echo \"GOOD BUILD EXIT=\$?\"
nar-build ${BAD} > /tmp/b4bad.out 2>&1; echo \"BAD BUILD EXIT=\$?\"
grep -E '^(nifi_api_version|wrote) ' /tmp/b4good.out /tmp/b4bad.out" 2>&1)"
echo "$C3_BUILD"

LIB_TOUCHED=1
restart_liquid || { echo "liquid did not restart" >&2; }
await_liquid || verdict "3 Liquid came back" no "liquid did not answer on its HTTPS API within 300s"
C3_TYPES="$(processor_types)"
C3_CONTROL="$(grep -c "$CONTROL_TYPE" <<< "$C3_TYPES")"
C3_GOOD="$(grep -c "$GOOD_TYPE" <<< "$C3_TYPES")"
C3_BAD="$(grep -c "$BAD_TYPE" <<< "$C3_TYPES")"
C3_LIB="$(docker compose exec -T liquid sh -c "ls ${LIB}/${GOOD_NAR} ${LIB}/${BAD_NAR} 2>&1" | tr -d '\r')"
C3_LOG="$(docker compose logs liquid --since 10m 2>&1 | grep -E "REFUSED|NAR DEPLOYMENT FAILED|${MISSING_CLASS}" | tail -8)"
C3_DROP="$(ls -1 "$DROP" | sort | tr '\n' ' ')"
C3_OUT="${C3_BUILD}"$'\n'"occurrences of ${CONTROL_TYPE} (the control): ${C3_CONTROL}"$'\n'"occurrences of ${GOOD_TYPE}: ${C3_GOOD}"$'\n'"occurrences of ${BAD_TYPE}: ${C3_BAD}"$'\n'"what is in ${LIB}:"$'\n'"${C3_LIB}"$'\n'"${DROP} after the restart: ${C3_DROP}"$'\n'"what the entrypoint said:"$'\n'"${C3_LOG:-(nothing matched)}"
echo "control ${C3_CONTROL}  good ${C3_GOOD}  mismatched ${C3_BAD}"
echo "${C3_LOG:-(the log said nothing matching REFUSED)}"
log "$C3_OUT"

C3_WHY=""
grep -q '^GOOD BUILD EXIT=0$' <<< "$C3_BUILD" || C3_WHY="${C3_WHY}the good fixture did not build; "
grep -q '^BAD BUILD EXIT=0$' <<< "$C3_BUILD" || C3_WHY="${C3_WHY}the mismatch fixture did not build, so there is no negative half; "
[[ "$C3_CONTROL" -ge 1 ]] || C3_WHY="${C3_WHY}the API listed no ${CONTROL_TYPE} either, so it answered nothing and a count of 0 says nothing about either NAR; "
[[ "$C3_GOOD" -ge 1 ]] || C3_WHY="${C3_WHY}Liquid does not list ${GOOD_TYPE}, so the guard refused a correct bundle — that is a false refusal and it breaks a working deployment; "
[[ "$C3_BAD" -eq 0 ]] || C3_WHY="${C3_WHY}Liquid lists ${BAD_TYPE}, so the mismatched NAR reached ${LIB} anyway; "
grep -q "${BAD_NAR}" <<< "$C3_DROP" || C3_WHY="${C3_WHY}${BAD_NAR} is no longer in ${DROP} — the refusal deleted the operator's file; "
grep -q "REFUSED" <<< "$C3_LOG" || C3_WHY="${C3_WHY}the refusal is not in docker compose logs liquid, which is the only place an operator would read it; "
grep -q "${MISSING_CLASS}" <<< "$C3_LOG" || C3_WHY="${C3_WHY}the message does not name ${MISSING_CLASS}; "
[[ -z "$C3_WHY" ]] && verdict "3 the mismatch is refused where the operator can see it, and the good NAR still deploys" yes \
                              "${GOOD_TYPE} listed, ${BAD_TYPE} not, the refusal names ${MISSING_CLASS}, and ${BAD_NAR} is still in ${DROP}" \
                   || verdict "3 the mismatch is refused where the operator can see it, and the good NAR still deploys" no "${C3_WHY%; }"

banner "Check 4 — negative control: is check 3 measuring the refusal, or something else?"
docker compose cp "${DROP}/${BAD_NAR}" "liquid:${LIB}/${BAD_NAR}" >/dev/null 2>&1
restart_liquid || { echo "liquid did not restart" >&2; }
await_liquid || verdict "4 Liquid came back" no "liquid did not answer on its HTTPS API within 300s"
C4_TYPES="$(processor_types)"
C4_CONTROL="$(grep -c "$CONTROL_TYPE" <<< "$C4_TYPES")"
C4_BAD="$(grep -c "$BAD_TYPE" <<< "$C4_TYPES")"
C4_OUT="the same NAR placed into ${LIB} by hand, bypassing the entrypoint's check"$'\n'"occurrences of ${CONTROL_TYPE} (the control): ${C4_CONTROL}"$'\n'"occurrences of ${BAD_TYPE}: ${C4_BAD}"
echo "control ${C4_CONTROL}  mismatched, placed by hand: ${C4_BAD}"
log "$C4_OUT"
C4_WHY=""
[[ "$C4_CONTROL" -ge 1 ]] || C4_WHY="${C4_WHY}the API listed no ${CONTROL_TYPE} either, so this proves nothing; "
[[ "$C4_BAD" -ge 1 ]] || C4_WHY="${C4_WHY}${BAD_TYPE} is absent even with the NAR in ${LIB}, so check 3's absence was never caused by the refusal — something else is keeping this bundle out, and M-B3's finding that a mismatched NAR loads has changed; "
[[ -z "$C4_WHY" ]] && verdict "4 the type is absent because the guard refused it, not because it cannot load" yes \
                              "${BAD_TYPE} is listed the moment the same NAR is put into ${LIB} by hand" \
                   || verdict "4 the type is absent because the guard refused it, not because it cannot load" no "${C4_WHY%; }"

banner "Check 5 — clean up what this run created, and confirm"
docker compose exec -T openclaw-gateway sh -c "rm -rf ${GOOD} ${BAD}" >/dev/null 2>&1
for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
  printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f" || rm -f "${DROP}/${f}"
done
docker compose exec -T liquid sh -c "rm -f ${LIB}/${GOOD_NAR} ${LIB}/${BAD_NAR}" >/dev/null 2>&1
restart_liquid || { echo "liquid did not restart" >&2; }
await_liquid || verdict "5 Liquid came back" no "liquid did not answer on its HTTPS API within 300s"
unset LIB_TOUCHED
C5_TYPES="$(processor_types)"
C5_CONTROL="$(grep -c "$CONTROL_TYPE" <<< "$C5_TYPES")"
C5_GOOD="$(grep -c "$GOOD_TYPE" <<< "$C5_TYPES")"
C5_BAD="$(grep -c "$BAD_TYPE" <<< "$C5_TYPES")"
run_suite "" C5_OUT_RUN C5_CODE
echo "$C5_OUT_RUN" | tail -4
C5_LS="$(ls -1a "$DROP" | sort | tr '\n' ' ')"
C5_OUT="${DROP} after cleanup: ${C5_LS}"$'\n'"occurrences of ${CONTROL_TYPE} (the control): ${C5_CONTROL}"$'\n'"occurrences of ${GOOD_TYPE}: ${C5_GOOD}"$'\n'"occurrences of ${BAD_TYPE}: ${C5_BAD}"$'\n'"$(echo "$C5_OUT_RUN" | tail -6)"$'\n'"EXIT=${C5_CODE}"
log "$C5_OUT"
C5_WHY=""
[[ "$C5_CONTROL" -ge 1 ]] || C5_WHY="${C5_WHY}the API listed no ${CONTROL_TYPE} either, so the types being gone proves nothing; "
[[ "$C5_GOOD" == "0" ]] || C5_WHY="${C5_WHY}Liquid still lists ${GOOD_TYPE} with the NAR removed from ${LIB} — check 3 was reading something else; "
[[ "$C5_BAD" == "0" ]] || C5_WHY="${C5_WHY}Liquid still lists ${BAD_TYPE} after check 4's copy was removed; "
[[ $C5_CODE -eq 0 ]] || C5_WHY="${C5_WHY}the suite is not green with the fixtures gone (EXIT=${C5_CODE}); "
[[ -z "$C5_WHY" ]] && verdict "5 both types are listed because their NARs are loaded, and the suite is green again" yes \
                              "both gone with the NARs, EXIT=0" \
                   || verdict "5 both types are listed because their NARs are loaded, and the suite is green again" no "${C5_WHY%; }"

fence() { printf '```\n%s\n```\n' "$1"; }

{
  echo "## M-B4 — independent verification"
  echo
  echo "Run on the host with \`./tests/verify/m-b4.sh\` on $(date '+%Y-%m-%d %H:%M %Z'), following §4 of"
  echo "\`docs/TEST-SPEC-liquid-java-extensions.md\`. The script performs the same checks the section lists"
  echo "for hand execution, judges each one, and restores everything it moved — including on \`Ctrl-C\`:"
  echo "both fixtures, the artifacts they wrote into \`${DROP}\`, and the copies that reached \`${LIB}\`."
  echo "Anything that was in \`${DROP}\` beforehand is left alone. **Checks 3, 4 and 5 restart Liquid**,"
  echo "which interrupts every running flow — that is why they live here and not in the suite."
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
  echo "<details><summary>Check 0 — the container runs the files on disk</summary>"; echo
  fence "$C0_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 1 — the milestone suite</summary>"; echo
  fence "$(echo "$C1_OUT" | tail -25)"; echo "</details>"; echo
  echo "<details><summary>Check 2 — the whole suite</summary>"; echo
  fence "$(echo "$C2_OUT" | tail -25)"; echo "</details>"; echo
  echo "<details><summary>Check 3 — B4-8, the catalogue after a restart</summary>"; echo
  fence "${C3_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 4 — the negative control on check 3</summary>"; echo
  fence "${C4_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 5 — cleanup, and the suite again</summary>"; echo
  fence "${C5_OUT:-}"; echo "</details>"; echo
  echo "The full log of this run is in \`${LOG}\`."
  echo
  echo "Check 0 is M-B2's check 3b, extended to the parser. \`config/liquid/entrypoint.sh\` and"
  echo "\`config/liquid/narcheck.py\` are \`COPY\`ed into \`liquidupstart/liquid:latest\`, not mounted, so"
  echo "B4-1 to B4-6 can all be green over a container running the code that preceded them. The remedy is"
  echo "\`./config/scripts/build/liquid.sh && docker compose up -d --no-deps liquid\`."
  echo
  echo "Check 4 is what gives check 3 its meaning. A processor missing from the catalogue is the outcome"
  echo "of a refusal only if the same bundle would have been listed without one — so the same"
  echo "\`${BAD_NAR}\` is copied into \`${LIB}\` by hand, past the entrypoint, and must appear. That is"
  echo "M-B3's finding restated as a control: a mismatched NAR loads and says nothing, and FR36 is about"
  echo "moving that failure to the moment the operator can act on it."
} > "$DRAFT"

printf '\n%s=== summary ===%s\n' "$BOLD" "$RST"
for v in "${VERDICTS[@]}"; do
  IFS='|' read -r r n d <<< "$v"
  if [[ "$r" == PASS ]]; then printf '%s  PASS%s  %s\n' "$GREEN" "$RST" "$n"
  else printf '%s  FAIL%s  %s %s(%s)%s\n' "$RED" "$RST" "$n" "$DIM" "$d" "$RST"; fi
done
printf '\n  log:   %s\n  draft: %s\n\n' "$LOG" "$DRAFT"

exit $FAILED
