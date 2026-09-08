#!/usr/bin/env bash
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

DROP="volumes/nar_extensions"
CACHE="volumes/nar_builder/m2"
LIB="/opt/nifi/nifi-current/lib"
GOOD="/repos/.b3-hand"
BAD="/repos/.b3-mismatch"
GOOD_NAR="b3-hand-nar-1.0.0.nar"
BAD_NAR="probe-mismatch-1.0.0.nar"
GOOD_TYPE="org.nocodenation.probe.ProbeProcessor"
BAD_TYPE="org.nocodenation.probe.MismatchProcessor"
MISSING_CLASS="org/apache/nifi/controller/NodeConnectionState"
OUT_DIR=".pr-drafts"
LOG="${OUT_DIR}/M-B3-verification.log"
DRAFT="${OUT_DIR}/M-B3-verification.md"
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
  rm -f "${CACHE}/.b3-liquid-api.jar"
  local f
  for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
    if ! printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f"; then
      rm -f "${DROP}/${f}"
      echo "${BOLD}removed${RST} ${DROP}/${f} (this run created it)"
    fi
  done
  if [[ -n "${LIB_TOUCHED:-}" ]]; then
    docker compose exec -T liquid sh -c "rm -f ${LIB}/${GOOD_NAR} ${LIB}/${BAD_NAR}" >/dev/null 2>&1
    docker compose restart liquid >/dev/null 2>&1
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
  echo "${RED}LIQUID_USERNAME / LIQUID_PASSWORD are not in .env${RST}, and checks 3 and 4 read Liquid's API" >&2
  exit 2
}
await_liquid || { echo "liquid did not answer on its HTTPS API within 300s" >&2; exit 2; }

banner "Check 0 — the builder runs the build.sh this milestone changed"
docker compose exec -T nar_builder cat /opt/builder/build.sh > "${WORK}/build.in-container" 2>/dev/null
C0_DIFF="$(diff "${WORK}/build.in-container" config/nar_builder/build.sh 2>&1)"
C0_OUT="diff <in-container /opt/builder/build.sh> <on-disk config/nar_builder/build.sh>:"$'\n'"${C0_DIFF:-(identical)}"
echo "$C0_OUT"
log "$C0_OUT"
C0_WHY=""
[[ -s "${WORK}/build.in-container" ]] || C0_WHY="${C0_WHY}build.sh could not be read from the container; "
[[ -z "$C0_DIFF" ]] || C0_WHY="${C0_WHY}the container runs a different build.sh than the one B3-4 asserts — rebuild it: ./config/scripts/build/nar-builder.sh && docker compose up -d --no-deps nar_builder; "
[[ -z "$C0_WHY" ]] && verdict "0 the builder runs the script on disk" yes \
                              "/opt/builder/build.sh is byte-identical to config/nar_builder/build.sh" \
                   || verdict "0 the builder runs the script on disk" no "${C0_WHY%; }"

banner "Check 1 — the milestone suite (expect EXIT=0)"
run_suite m-b3 C1_OUT C1_CODE
echo "$C1_OUT" | tail -6
[[ $C1_CODE -eq 0 ]] && verdict "1 milestone suite green" yes "EXIT=0" \
                     || verdict "1 milestone suite green" no "EXIT=${C1_CODE}"

banner "Check 2 — the whole suite (expect EXIT=0)"
run_suite "" C2_OUT C2_CODE
echo "$C2_OUT" | tail -6
[[ $C2_CODE -eq 0 ]] && verdict "2 no regression across everything before it" yes "EXIT=0" \
                     || verdict "2 no regression across everything before it" no "EXIT=${C2_CODE}"

banner "Check 3 — does Liquid load it? (this restarts Liquid and interrupts every running flow)"
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
cd ${GOOD}
set +e
nar-build > /tmp/b3.out 2>&1; echo \"BUILD EXIT=\$?\"
grep -E '^(nifi_version|nifi_api_version|built|wrote|downloads) ' /tmp/b3.out" 2>&1)"
echo "$C3_BUILD"

SHA_DROP="$(shasum -a 256 "${DROP}/${GOOD_NAR}" 2>/dev/null | awk '{print $1}')"
LIB_TOUCHED=1
docker compose restart liquid >/dev/null 2>&1
await_liquid || verdict "3 Liquid came back" no "liquid did not answer on its HTTPS API within 300s"
SHA_LIB="$(docker compose exec -T liquid sh -c "sha256sum ${LIB}/${GOOD_NAR}" 2>/dev/null | awk '{print $1}')"
C3_TYPES="$(processor_types)"
C3_COUNT="$(grep -c "$GOOD_TYPE" <<< "$C3_TYPES")"
C3_CONTROL="$(grep -c "$CONTROL_TYPE" <<< "$C3_TYPES")"
C3_OUT="${C3_BUILD}"$'\n'"sha256 ${DROP}/${GOOD_NAR}: ${SHA_DROP:-none}"$'\n'"sha256 ${LIB}/${GOOD_NAR}: ${SHA_LIB:-none}"$'\n'"occurrences of ${CONTROL_TYPE} (the control): ${C3_CONTROL}"$'\n'"occurrences of ${GOOD_TYPE} in /nifi-api/flow/processor-types: ${C3_COUNT}"$'\n'"what the API answered, first 300 characters:"$'\n'"${C3_TYPES:0:300}"
echo "sha256 drop: ${SHA_DROP:-none}"
echo "sha256 lib:  ${SHA_LIB:-none}"
echo "type listed: ${C3_COUNT}"
log "$C3_OUT"

C3_WHY=""
grep -q '^BUILD EXIT=0$' <<< "$C3_BUILD" || C3_WHY="${C3_WHY}nar-build did not exit 0; "
[[ -n "$SHA_DROP" ]] || C3_WHY="${C3_WHY}no ${GOOD_NAR} in ${DROP}; "
[[ -n "$SHA_LIB" ]] || C3_WHY="${C3_WHY}${GOOD_NAR} did not reach ${LIB}; "
[[ -n "$SHA_DROP" && "$SHA_DROP" == "$SHA_LIB" ]] || C3_WHY="${C3_WHY}the NAR in ${LIB} is not the one this build produced; "
[[ "$C3_CONTROL" -ge 1 ]] || C3_WHY="${C3_WHY}the API listed no ${CONTROL_TYPE} either, so it answered nothing and a count of 0 says nothing about our NAR; "
[[ "$C3_COUNT" -ge 1 ]] || C3_WHY="${C3_WHY}Liquid does not list ${GOOD_TYPE}; "
[[ -z "$C3_WHY" ]] && verdict "3 Liquid loads what we build" yes \
                              "${GOOD_TYPE} is listed, and ${LIB}/${GOOD_NAR} is this build's artifact by SHA-256" \
                   || verdict "3 Liquid loads what we build" no "${C3_WHY%; }"

banner "Check 4 — what a NAR built against an API Liquid does not provide actually does"
C4_BUILD="$(docker compose exec -T openclaw-gateway sh -lc "
set -e
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
cd \$D
set +e
nar-build > /tmp/b3bad.out 2>&1; echo \"BUILD EXIT=\$?\"
grep -E '^(built|wrote|pom|downloads) ' /tmp/b3bad.out
tail -3 /tmp/b3bad.out" 2>&1)"
echo "$C4_BUILD"

API_JAR="$(docker compose exec -T liquid sh -c "ls ${LIB}/nifi-api-*.jar" 2>/dev/null | tr -d '\r' | head -1)"
docker compose cp "liquid:${API_JAR}" "${CACHE}/.b3-liquid-api.jar" >/dev/null 2>&1
C4_REFS="$(docker compose exec -T nar_builder sh -c '
set -e
W=$(mktemp -d); cd "$W"
jar xf /nar_extensions/'"${BAD_NAR}"'
for c in $(javap -p -c org/nocodenation/probe/MismatchProcessor.class \
           | grep -o "org/apache/nifi/[A-Za-z0-9/$]*" | sort -u); do
  if jar tf /m2/.b3-liquid-api.jar | grep -qx "${c}.class"; then echo "present  $c"; else echo "ABSENT   $c"; fi
done
rm -rf "$W"' 2>&1)"
rm -f "${CACHE}/.b3-liquid-api.jar"
echo "the jar Liquid loads: ${API_JAR}"
echo "$C4_REFS"

docker compose restart liquid >/dev/null 2>&1
await_liquid || verdict "4 Liquid came back" no "liquid did not answer on its HTTPS API within 300s"
C4_TYPES="$(processor_types)"
C4_BAD_COUNT="$(grep -c "$BAD_TYPE" <<< "$C4_TYPES")"
C4_GOOD_COUNT="$(grep -c "$GOOD_TYPE" <<< "$C4_TYPES")"
C4_LOG="$(docker compose logs liquid --since 6m 2>&1 \
  | grep -iE 'NoClassDefFound|NoSuchMethod|could not.*load|unable to load|bundle' \
  | grep -v 'bundled-dependencies' | tail -10)"
C4_OUT="${C4_BUILD}"$'\n'"the jar Liquid loads: ${API_JAR}"$'\n'"${C4_REFS}"$'\n'"occurrences of ${BAD_TYPE}: ${C4_BAD_COUNT}"$'\n'"occurrences of ${GOOD_TYPE} (still from check 3): ${C4_GOOD_COUNT}"$'\n'"what the framework log said:"$'\n'"${C4_LOG:-(nothing matched)}"
echo "mismatched type listed: ${C4_BAD_COUNT}   probe from check 3 still listed: ${C4_GOOD_COUNT}"
echo "${C4_LOG:-(the log said nothing matching NoClassDefFound / bundle / could not load)}"
log "$C4_OUT"

C4_WHY=""
grep -q '^BUILD EXIT=0$' <<< "$C4_BUILD" || C4_WHY="${C4_WHY}the mismatch fixture did not build, so there is no control; "
grep -q "^ABSENT   ${MISSING_CLASS}$" <<< "$C4_REFS" || C4_WHY="${C4_WHY}the built class does not reference a type missing from ${API_JAR}, so the mismatch is nominal rather than real; "
[[ "$C4_BAD_COUNT" -ge 1 ]] || C4_WHY="${C4_WHY}Liquid did NOT list ${BAD_TYPE} — the framework now refuses a mismatched bundle, which it did not on 2026-09-08. That changes what FR23 defends against: read the log and rewrite the requirement; "
[[ "$C4_GOOD_COUNT" -ge 1 ]] || C4_WHY="${C4_WHY}${GOOD_TYPE} is gone too, so this restart proves nothing about the mismatch; "
[[ -z "$C4_WHY" ]] && verdict "4 a NAR built against an API Liquid does not provide loads anyway" yes \
                              "${MISSING_CLASS} is absent from ${API_JAR}, ${BAD_TYPE} is listed regardless and the log says nothing, and ${GOOD_TYPE} still is — the behaviour B3-2 recorded" \
                   || verdict "4 a NAR built against an API Liquid does not provide loads anyway" no "${C4_WHY%; }"

banner "Check 5 — clean up what this run created, and confirm"
docker compose exec -T openclaw-gateway sh -c "rm -rf ${GOOD} ${BAD}" >/dev/null 2>&1
for f in $(ls -1 "$DROP" 2>/dev/null | sort); do
  printf '%s\n' "${DROP_BEFORE[@]+"${DROP_BEFORE[@]}"}" | grep -qx "$f" || rm -f "${DROP}/${f}"
done
docker compose exec -T liquid sh -c "rm -f ${LIB}/${GOOD_NAR} ${LIB}/${BAD_NAR}" >/dev/null 2>&1
docker compose restart liquid >/dev/null 2>&1
await_liquid || verdict "5 Liquid came back" no "liquid did not answer on its HTTPS API within 300s"
unset LIB_TOUCHED
C5_TYPES="$(processor_types)"
C5_COUNT="$(grep -c "$GOOD_TYPE" <<< "$C5_TYPES")"
C5_CONTROL="$(grep -c "$CONTROL_TYPE" <<< "$C5_TYPES")"
run_suite "" C5_OUT_RUN C5_CODE
echo "$C5_OUT_RUN" | tail -4
C5_LS="$(ls -1a "$DROP" | sort | tr '\n' ' ')"
C5_OUT="${DROP} after cleanup: ${C5_LS}"$'\n'"occurrences of ${CONTROL_TYPE} (the control): ${C5_CONTROL}"$'\n'"occurrences of ${GOOD_TYPE} once both NARs are gone: ${C5_COUNT}"$'\n'"what the API answered, first 300 characters:"$'\n'"${C5_TYPES:0:300}"$'\n'"$(echo "$C5_OUT_RUN" | tail -6)"$'\n'"EXIT=${C5_CODE}"
log "$C5_OUT"
C5_WHY=""
[[ "$C5_CONTROL" -ge 1 ]] || C5_WHY="${C5_WHY}the API listed no ${CONTROL_TYPE} either, so the type being gone proves nothing; "
[[ "$C5_COUNT" == "0" ]] || C5_WHY="${C5_WHY}Liquid still lists ${GOOD_TYPE} with the NAR removed from ${LIB} — check 3 was reading something else; "
[[ $C5_CODE -eq 0 ]] || C5_WHY="${C5_WHY}the suite is not green with the fixtures gone (EXIT=${C5_CODE}); "
[[ -z "$C5_WHY" ]] && verdict "5 the type is listed because the NAR is loaded, and the suite is green again" yes \
                              "${GOOD_TYPE} gone with the NAR, EXIT=0" \
                   || verdict "5 the type is listed because the NAR is loaded, and the suite is green again" no "${C5_WHY%; }"

fence() { printf '```\n%s\n```\n' "$1"; }

{
  echo "## M-B3 — independent verification"
  echo
  echo "Run on the host with \`./tests/verify/m-b3.sh\` on $(date '+%Y-%m-%d %H:%M %Z'), following §4 of"
  echo "\`docs/TEST-SPEC-liquid-java-extensions.md\`. The script performs the same checks the section lists"
  echo "for hand execution, judges each one, and restores everything it moved — including on \`Ctrl-C\`:"
  echo "both hand-built fixtures, the artifacts they wrote into \`${DROP}\`, and the copies Liquid loaded"
  echo "into \`${LIB}\`. Anything that was in \`${DROP}\` beforehand is left alone. **Checks 3, 4 and 5"
  echo "restart Liquid**, which interrupts every running flow — that is why they live here and not in the"
  echo "suite."
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
  echo "<details><summary>Check 0 — the builder runs the script on disk</summary>"; echo
  fence "$C0_OUT"; echo "</details>"; echo
  echo "<details><summary>Check 1 — the milestone suite</summary>"; echo
  fence "$(echo "$C1_OUT" | tail -25)"; echo "</details>"; echo
  echo "<details><summary>Check 2 — the whole suite</summary>"; echo
  fence "$(echo "$C2_OUT" | tail -25)"; echo "</details>"; echo
  echo "<details><summary>Check 3 — Liquid lists the processor</summary>"; echo
  fence "${C3_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 4 — what the mismatched NAR actually does</summary>"; echo
  fence "${C4_OUT:-}"; echo "</details>"; echo
  echo "<details><summary>Check 5 — cleanup, the negative control on check 3, and the suite again</summary>"; echo
  fence "${C5_OUT:-}"; echo "</details>"; echo
  echo "The full log of this run is in \`${LOG}\`."
  echo
  echo "Check 0 is the \`nar_builder\` counterpart of M-B2's check 3b, and exists for the same reason."
  echo "\`config/nar_builder/build.sh\` is \`COPY\`ed into \`liquidupstart/nar-builder:latest\`, not mounted,"
  echo "so B3-4 can be green over a container running the code that preceded the fix. The remedy is"
  echo "\`./config/scripts/build/nar-builder.sh && docker compose up -d --no-deps nar_builder\`, which does"
  echo "not touch Liquid."
  echo
  echo "Checks 3, 4 and 5 are one argument in three parts. Check 3 shows the processor listed; check 4"
  echo "shows that a NAR whose compiled class references \`${MISSING_CLASS}\` — the only class present in"
  echo "\`nifi-api\` 2.11.0 and absent from the 2.10.0 jar in \`${LIB}\` — is **not** listed, while the"
  echo "correct one from check 3 still is, so the restart is not simply failing; check 5 removes both"
  echo "NARs and requires the type to disappear, which is what makes check 3 a measurement rather than a"
  echo "reading of whatever \`lib/\` happened to accumulate."
  echo
  echo "The mismatch is proven at build time and not inferred from a version number. \`javap\` lists what"
  echo "the compiled class references, and each referenced \`org.apache.nifi\` type is looked up in the"
  echo "\`nifi-api\` jar Liquid actually loads. A NAR built against 2.11.0 that referenced nothing new"
  echo "would load perfectly well and would prove nothing."
} > "$DRAFT"

printf '\n%s=== summary ===%s\n' "$BOLD" "$RST"
for v in "${VERDICTS[@]}"; do
  IFS='|' read -r r n d <<< "$v"
  if [[ "$r" == PASS ]]; then printf '%s  PASS%s  %s\n' "$GREEN" "$RST" "$n"
  else printf '%s  FAIL%s  %s %s(%s)%s\n' "$RED" "$RST" "$n" "$DIM" "$d" "$RST"; fi
done
printf '\n  log:   %s\n  draft: %s\n\n' "$LOG" "$DRAFT"

exit $FAILED
