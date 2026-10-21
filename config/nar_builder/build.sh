#!/bin/sh
set -eu

REPOS=/repos
# Under a root-only /deploy, so the unprivileged build user cannot reach it: the
# host directory this is mounted from is `chmod 777` by liquid.sh and its own mode
# therefore closes nothing. See the Dockerfile for the measurement.
DROP=/deploy/nar_extensions
# No shared dependency cache. Each build resolves into its own local repository,
# created under its work directory and discarded with it, so an artifact planted
# by one build's code cannot be resolved by the next -- the last of B1's four
# legs, 2026-10-01 review.
#
# What keeps that affordable is SEED, a closure baked into the image by
# `seed.sh` and **copied into** each build's repository. `repo_for` says why a
# copy rather than a `file://` remote, and what the difference measured.
SEED=/opt/builder/m2-seed
SEED_RECORD=/opt/builder/m2-seed.record
# The lifecycle pins, spliced into the generated pom. The file says why they are
# required: a local repository never writes the `maven-metadata.xml` a `file://`
# remote is looked up for, so the seed can serve a pinned version and cannot
# serve one that has to be resolved.
PINS=/opt/builder/lifecycle-pins.xml
LIQUID_LOGS=/liquid/logs
# What a bundle is judged against, and what does the judging. Both are mounted:
# the index of everything the running Liquid can load, written by its entrypoint
# on every start, and the checker itself -- the same file the liquid container
# runs, so a bundle gets the same answer on either side.
LIQUID_INDEX=/liquid/api
NAR_CHECK=/opt/builder/narcheck.py
LIQUID_HOST="${NAR_BUILD_LIQUID_HOST:-liquid}"
LIQUID_PORT="${SYSTEM_HTTPS_PORT:-8833}"
NAR_PLUGIN_VERSION="${NAR_BUILD_PLUGIN_VERSION:-2.4.0}"

# Everything Maven runs during a build is the author's -- the pom, its plugins,
# its dependencies -- so it runs as this unprivileged user rather than as root.
# As root it could append to /repos/<any other clone>/.git/config, plant a plugin
# jar in the shared /m2 that every later build resolves, and rewrite
# /opt/builder/build.sh, which is the script holding the narcheck gate: measured,
# a line appended there came back as line 18 of the next, unrelated build.
# B1 of the 2026-10-01 review. build.sh itself stays root: it reads /repos,
# writes the drop directory and runs the check.
BUILD_USER="${NAR_BUILDER_BUILD_USER:-builder}"

out() { printf '%s\n' "$*"; }

# A literal substring replacement, global, with no regex engine involved.
#
# **This exists because `sed` executed the file name.** The refusal names the
# dot-copy and the operator reads the name they dropped, so one is replaced by the
# other -- and the old line did it as `sed "s|${part}|...|g"`, which puts an
# attacker-controlled basename unescaped on both sides of a `sed` expression. GNU
# sed, which both images ship, has an `e` command that executes the pattern space,
# so a NAR named `x|y|;e <cmd>;#.nar` closes the `s`, opens an `e` and runs
# `<cmd>`. C1 of the 2026-10-13 re-review, reproduced there as root in the builder
# and as nifi in Liquid, and re-measured here against the exact construction this
# script builds: `uid=0(root)`.
#
# POSIX parameter expansion with a **quoted** pattern is literal, so
# `${rest%%"$2"*}` cannot be steered by what the needle contains. The reviewer
# suggested `awk -v` with `gsub`, which does stop the execution -- measured -- but
# `gsub`'s first argument is a regular expression, so a name holding `|` still came
# back mangled, which is N4 of the same review. Measured on the payload, this
# replaces both occurrences exactly once and runs nothing.
literal_replace() {  # haystack needle replacement
  _lr_out=''
  _lr_rest="$1"
  while case "$_lr_rest" in *"$2"*) true ;; *) false ;; esac; do
    _lr_out="${_lr_out}${_lr_rest%%"$2"*}$3"
    _lr_rest="${_lr_rest#*"$2"}"
  done
  printf '%s' "${_lr_out}${_lr_rest}"
}


# Maven as BUILD_USER when this is root and that user exists -- in the image it
# does. Outside the container, where the suite runs build.sh against a stub mvn,
# neither holds and the call is made directly, so a fixture needs no root and no
# such user. `su` is what the base image has, and the `--` is load-bearing:
# without it su reads Maven's own flags as its own, and the first run of this came
# back as `su: invalid option -- 'o'`. After it the first operand becomes $0 and
# mvn's argv is passed through untouched.
# Whether the build user can reach the drop directory -- asked rather than
# assumed. The containment rests on /deploy being root-owned and mode 700 in the
# image (see the Dockerfile); an image built before that, or a BUILD_USER that
# does not exist, silently reopens the one route a bundle can take into NiFi's
# autoload directory without passing narcheck. So the script measures it and
# refuses to build when it holds no longer. Only meaningful as root with that
# user present, which is the container; on the host, where the suite runs this
# against a stub mvn as an ordinary user, there is nothing to drop from.
drop_is_closed() {
  [ "$(id -u)" -eq 0 ] && id "$BUILD_USER" >/dev/null 2>&1 || return 0
  probe="${DROP}/.build-user-probe.$$"
  if su "$BUILD_USER" -s /bin/sh -c "touch '$probe' 2>/dev/null"; then
    rm -f "$probe"
    return 1
  fi
  return 0
}

# A directory Maven can actually read.
#
# `mktemp -d` makes it `700 root root`, and since Maven runs as BUILD_USER it
# cannot traverse that at all. Measured in the running builder: `cat` of a file
# inside gives `Permission denied`, and `mvn -f <that>/pom.xml` then fails with
# "POM file ... does not exist" and no `[ERROR]` line -- so the refusal printed
# `Maven said:` followed by nothing. Every real `nar-build` was broken this way
# from 1527c86 until here, and no fixture could see it: the suite drives build.sh
# with a stub mvn, which never reads the file.
#
# Both temporary directories go through this, rather than a chown beside each
# `mktemp`, so a third one cannot be added without it.
work_dir_for_build() {
  d="$(mktemp -d)"
  chown -R "$BUILD_USER" "$d" 2>/dev/null || true
  chmod 755 "$d" 2>/dev/null || true
  printf '%s' "$d"
}

# A Maven local repository for one build, inside the directory that build is
# already working in, so it goes when that goes. Handed to BUILD_USER because
# Maven writes it as that user.
#
# **It starts as a copy of the seed, and the copy is the design.** Offering the
# seed as a `file://` repository was measured first and does not work. Maven
# records which repository each artifact came from in `_remote.repositories`,
# and the nar plugin's documentation step re-resolves the tree in a context
# where the id `liquid-seed` is unknown. Maven says so -- *"present in the local
# repository, but cached from a remote repository ID that is unavailable in
# current build context, verifying that is downloadable"* -- and re-fetches
# every artifact from central to check.
#
# Copied in, the artifacts carry the seed's own `_remote.repositories`, which
# say `central=` because that is where the image build fetched them, so every
# context accepts them. Measured 2026-10-11, the same end-to-end build:
#
#   seed as a file:// remote    20-26 s   438 downloads   28.5 MB   86 warnings
#   seed copied in                 7 s      0 downloads      0 B     0 warnings
#
# A copy rather than a hardlink farm on purpose: `cp -al` would share inodes
# with the seed, and a build writing through one of those links would alter the
# seed itself -- the write path this whole change exists to close.
repo_for() {
  d="${1}/m2"
  if [ -d "$SEED" ]; then
    cp -a "$SEED" "$d"
  else
    mkdir -p "$d"
  fi
  chown -R "$BUILD_USER" "$d" 2>/dev/null || true
  printf '%s' "$d"
}

# What the seed holds against what this build wants, read rather than assumed.
#
# A stale seed costs time and never correctness: `build.sh` reads the running
# Liquid's version for the pom it generates, so a dependency the seed lacks is
# simply fetched. The failure mode is a build that is mysteriously slow, which
# is the kind that gets diagnosed three times. One line removes the mystery, and
# it is computed from the record `seed.sh` wrote rather than from a version
# somebody remembered to keep in step.
#
# It earned itself on its first real run: the seeding step took the nifi-api
# version as an argument then, defaulted to the NiFi version, and NiFi 2.11.0
# ships nifi-api 2.10.0. The build deployed a bundle while the seed served
# almost none of it, and this line is what said so.
seed_notice() {
  [ -f "$SEED_RECORD" ] || return 0
  seeded="$(sed -n 's/^nifi_version=//p' "$SEED_RECORD" | head -1)"
  seeded_api="$(sed -n 's/^nifi_api_version=//p' "$SEED_RECORD" | head -1)"
  [ -n "$seeded" ] || return 0
  if [ "$seeded" != "${1:-}" ] || [ "$seeded_api" != "${2:-}" ]; then
    out "seed ${seeded}/${seeded_api}, this build ${1:-?}/${2:-?} -- the"
    out "  difference is fetched from the network on every build until the"
    out "  builder image is rebuilt with SEED_NIFI_VERSION=${1:-?}."
  else
    out "seed ${seeded}/${seeded_api}, matching this build"
  fi
}

run_maven() {
  if [ "$(id -u)" -eq 0 ] && id "$BUILD_USER" >/dev/null 2>&1; then
    su "$BUILD_USER" -s /bin/sh -c 'exec mvn -B "$@"' -- mvn "$@"
  else
    mvn -B "$@"
  fi
}

field() {
  printf '%s\n' "$2" | sed -n "s/^$1 \(.*\)$/\1/p"
}

API_VERSION=""
API_SOURCE=""
API_ERROR=""

resolve_api_version() {
  nifi="$1"
  probe_version="${NAR_BUILD_API_PROBE_VERSION:-$nifi}"
  probe="$(work_dir_for_build)"

  cat > "${probe}/pom.xml" <<POM
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>org.nocodenation.liquid</groupId>
  <artifactId>nifi-api-probe</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>
  <dependencies>
    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-utils</artifactId>
      <version>${probe_version}</version>
    </dependency>
  </dependencies>
</project>
POM

  if ! run_maven -f "${probe}/pom.xml" -Dmaven.repo.local="$(repo_for "$probe")" dependency:list \
       > "${probe}/resolve.log" 2>&1; then
    API_ERROR="$(grep '^\[ERROR\]' "${probe}/resolve.log" | head -4 | sed 's/^/  /')"
    rm -rf "$probe"
    return 1
  fi

  API_VERSION="$(sed -n 's/.*org\.apache\.nifi:nifi-api:jar:\([0-9][^:]*\):.*/\1/p' \
                "${probe}/resolve.log" | head -1)"
  rm -rf "$probe"

  if [ -z "$API_VERSION" ]; then
    API_VERSION="$nifi"
    API_SOURCE="the NiFi version read from Liquid, because org.apache.nifi:nifi-utils:${probe_version} resolves no nifi-api"
    return 0
  fi

  API_SOURCE="org.apache.nifi:nifi-utils:${probe_version}, which is what the distribution was built against"
  return 0
}

resolve_target() {  # resolve_target [author|synthesised]
  pom_source="${1:-synthesised}"
  # The Host header, and -f, and both were measured rather than reasoned.
  #
  # Without the header NiFi answers **400** -- `NIFI_WEB_PROXY_HOST` makes it
  # refuse a request whose Host it does not know -- and this gate had no `-f`, so
  # curl exited 0 and a 400 counted as "Liquid is up". The gate established that
  # a TLS server answered on the port, not that Liquid did. With the header the
  # same request answers 301, and with `-f` a 400 is refused: measured on the
  # running stack, `direct no Host: 400, exit 0` against `direct with Host: 301,
  # exit 0` and `no Host with -f: exit 22`. M4 of the 2026-10-01 review.
  #
  # **The route stays direct, and that is a decision rather than an oversight.**
  # CLAUDE.md says container-to-container calls go through the proxy with a Host
  # header, and its reason is that `X.localhost` names resolve only in the
  # operator's browser. This call uses `liquid:8833`, a compose service name, so
  # it was never doing the thing the rule exists to prevent. Asking nginx whether
  # Liquid is up would also make a readiness question about one service depend on
  # another: with nginx down and Liquid up, a build would refuse for the wrong
  # reason. Measured through the proxy for completeness -- also 301, so the hop
  # buys nothing here.
  if ! curl -fsk --max-time 10 -o /dev/null \
       -H "Host: liquid.localhost:${LIQUID_PORT}" \
       "https://${LIQUID_HOST}:${LIQUID_PORT}/nifi" 2>/dev/null; then
    cat <<UNREACHABLE
nar-build refused: the target version could not be read, because Liquid does not
answer at ${LIQUID_HOST}:${LIQUID_PORT}.
A NAR compiled against the wrong nifi-api is not rejected by Liquid: it loads,
the processor appears in the catalogue, nothing is logged, and it breaks the
first time it runs — so this build stops rather than guessing a version.
Start the stack and run nar-build again: ./scripts/linux/start.sh, or
docker compose start liquid when the rest of the stack is already up.
Nothing was built and nothing was written to ${DROP}.
UNREACHABLE
    return 3
  fi

  # The record Liquid's entrypoint writes on every start, which is where these
  # come from now. They were read from the `Starting NiFi` line in
  # nifi-app.log, and logback rotates that file hourly keeping 30, so about
  # thirty hours after a start every build refused and asked for a restart --
  # against the promise that deploying a bundle needs none. Item 7 of the
  # 2026-09-28 review.
  nifi=""
  java=""
  version_source=""
  if [ -f "${LIQUID_INDEX}/runtime" ]; then
    nifi="$(sed -n 's/^nifi_version=//p' "${LIQUID_INDEX}/runtime" | head -1)"
    java="$(sed -n 's/^java_version=//p' "${LIQUID_INDEX}/runtime" | head -1)"
    [ -n "$nifi" ] && [ -n "$java" ] && version_source="${LIQUID_INDEX}/runtime"
  fi

  # The log stays as the fallback, for a Liquid that started before this record
  # existed and has not been restarted since. It is the path that expires.
  if [ -z "$version_source" ]; then
    line=""
    for f in $(ls -t "${LIQUID_LOGS}"/nifi-app*.log 2>/dev/null || true); do
      line="$(grep 'Starting NiFi ' "$f" 2>/dev/null | tail -1 || true)"
      if [ -n "$line" ]; then
        version_source="$f"
        break
      fi
    done
    nifi="$(printf '%s' "$line" | sed -n 's/.*Starting NiFi \([0-9][^ ]*\) using Java \([^ ]*\).*/\1/p')"
    java="$(printf '%s' "$line" | sed -n 's/.*Starting NiFi \([0-9][^ ]*\) using Java \([^ ]*\).*/\2/p')"
  fi

  major="$(printf '%s' "$java" | sed -n 's/^\([0-9][0-9]*\).*/\1/p')"

  if [ -z "$nifi" ] || [ -z "$major" ]; then
    cat <<UNREADABLE
nar-build refused: the target version could not be read. Liquid answers at
${LIQUID_HOST}:${LIQUID_PORT}, but neither ${LIQUID_INDEX}/runtime nor a startup
line in ${LIQUID_LOGS} names the NiFi and Java versions of the running instance,
and this build will not guess them.
The record is written by Liquid's entrypoint on every start, so a restart
produces one: docker compose restart liquid.
Nothing was built and nothing was written to ${DROP}.
UNREADABLE
    return 3
  fi

  if ! resolve_api_version "$nifi"; then
    # **An author's pom declares its own API, so an unresolvable one is reported
    # rather than refused.** The resolution exists to write a version into a
    # project this script synthesises; an author pom is used unchanged, and the
    # check against the running Liquid judges the result either way. Refusing it
    # made the advice below -- add a pom.xml -- a dead end for anyone who had one:
    # measured on main at a3ef20f. FR27 as amended 2026-10-21, B2-11.
    if [ "$pom_source" = author ]; then
      cat >&2 <<AUTHORPOM
nar-build: the nifi-api version could not be resolved through
org.apache.nifi:nifi-utils:${NAR_BUILD_API_PROBE_VERSION:-$nifi}. This project has its own pom.xml, which
declares the version it builds against, so the build goes on. Before anything is
deployed, the classes it references are checked against the ones the running
Liquid loads; a method that exists only in a newer nifi-api is not caught by that
check, so the version in the pom is the author's to get right.
If what Maven says below is that it could not reach a repository, that is the
builder's network and not the project -- ask the operator:
docker compose exec nar_builder curl -sSI https://repo.maven.apache.org/maven2/
Maven said:
${API_ERROR}
AUTHORPOM
      API_VERSION="not resolved"
      API_SOURCE="the project's own pom.xml declares it"
    else
      cat <<UNRESOLVED
nar-build refused: the nifi-api version could not be resolved through
org.apache.nifi:nifi-utils:${NAR_BUILD_API_PROBE_VERSION:-$nifi}, and this build will not
guess it. NiFi versions nifi-api on its own line — ${nifi} does not ship nifi-api ${nifi} —
and a NAR compiled against an API newer than the one Liquid loads compiles cleanly and
fails at runtime with NoSuchMethodError, which nobody sees until a flow runs.
${nifi} was read from ${version_source}: /liquid/api/runtime is written by Liquid on
every start, while a log line is whatever the oldest unrotated log still says.
Maven said:
${API_ERROR}
Add a pom.xml to the source directory naming the nifi-api version you mean — nar-build uses
it unchanged — or ask the operator whether the builder can reach Maven Central:
docker compose exec nar_builder curl -sSI https://repo.maven.apache.org/maven2/
Nothing was built and nothing was written to ${DROP}.
UNRESOLVED
      return 3
    fi
  fi

  out "nifi_version ${nifi}"
  out "nifi_api_version ${API_VERSION}"
  out "nifi_api_source ${API_SOURCE}"
  out "java_version ${java}"
  out "java_major ${major}"
  out "read_from liquid at ${LIQUID_HOST}:${LIQUID_PORT} ($(basename "${version_source}"))"
}

synthesise() {
  proj="$1"
  art="$2"
  nifi="$3"
  api="$4"
  major="$5"
  src="$6"

  mkdir -p "${proj}/processors" "${proj}/nar"
  cp -a "${src}/src" "${proj}/processors/src"

  # The lifecycle pins, from the same file the image build's seeding step read,
  # so the seed is the closure of this build rather than of a different one.
  # Empty when the file is absent, which is the case outside the container where
  # the suite drives this against a stub mvn -- the pom is then unpinned and no
  # fixture depends on the block.
  pins=""
  [ -f "$PINS" ] && pins="$(sed '/<!--/,/-->/d' "$PINS")"

  cat > "${proj}/pom.xml" <<POM
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>org.nocodenation.liquid</groupId>
  <artifactId>${art}</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>${major}</maven.compiler.release>
    <nifi.version>${nifi}</nifi.version>
    <nifi.api.version>${api}</nifi.api.version>
  </properties>
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.apache.nifi</groupId>
        <artifactId>nifi-api</artifactId>
        <version>\${nifi.api.version}</version>
        <scope>provided</scope>
      </dependency>
      <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-api</artifactId>
        <version>2.0.18</version>
        <scope>provided</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>
  <modules>
    <module>processors</module>
    <module>nar</module>
  </modules>
${pins}
</project>
POM

  cat > "${proj}/processors/pom.xml" <<POM
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.nocodenation.liquid</groupId>
    <artifactId>${art}</artifactId>
    <version>1.0.0</version>
  </parent>
  <artifactId>${art}-processors</artifactId>
  <packaging>jar</packaging>
  <dependencies>
    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-api</artifactId>
      <version>\${nifi.api.version}</version>
      <scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-utils</artifactId>
      <version>\${nifi.version}</version>
    </dependency>
  </dependencies>
</project>
POM

  cat > "${proj}/nar/pom.xml" <<POM
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.nocodenation.liquid</groupId>
    <artifactId>${art}</artifactId>
    <version>1.0.0</version>
  </parent>
  <artifactId>${art}-nar</artifactId>
  <packaging>nar</packaging>
  <dependencies>
    <dependency>
      <groupId>org.nocodenation.liquid</groupId>
      <artifactId>${art}-processors</artifactId>
      <version>1.0.0</version>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.nifi</groupId>
        <artifactId>nifi-nar-maven-plugin</artifactId>
        <version>${NAR_PLUGIN_VERSION}</version>
        <extensions>true</extensions>
      </plugin>
    </plugins>
  </build>
</project>
POM
}

target_command() {
  if ! TARGET="$(resolve_target)"; then
    printf '%s\n' "$TARGET" >&2
    return 3
  fi
  printf '%s\n' "$TARGET"
}

# Can the check actually run? Read, not stat.
#
# `[ -f ]` and `[ -r ]` both ask the kernel about the directory entry; neither
# opens the file, and on 2026-10-16 that difference cost an hour. A single-file
# bind mount of narcheck.py was stat-able and unreadable at the same time: `ls` of
# the mounted directory omitted the entry, `stat` reported 29910 bytes, and
# `open()` returned ENOENT to python3, to head and to cp alike -- Docker Desktop
# had kept a /host_mnt placeholder for a path a moved worktree had invalidated.
# The gate's `[ -f ]` passed, python3 failed, and the non-zero status was read as
# a refusal, so the operator was told their bundle cannot link against the NiFi
# API. Nothing had judged it.
#
# It is not about that one quirk. Measured again by hand the same day as the
# ordinary permission case: the checker at mode 000 and a build user unable to
# open it answers `[Errno 1] Operation not permitted`, and the old gate called
# that a bundle that cannot link too.
#
# A function rather than a condition inline, so a case can put states through it:
# the idiom B6-3 established, `eval` of the real thing out of the shipped script.
# The read is in `narcheck_unavailable_reason` below, and the gate is that
# function answering `none`.

# **Which condition failed, and the remedy for that one.**
#
# The refusal named all three conditions at once and then offered only the
# index's remedy -- which also pointed at `volumes/liquid/api`, a host path that
# has not existed since #25 made it a named volume. So an operator in the state
# that started this branch, a checker that cannot be opened, was sent to Liquid's
# logs and to a directory that is not there. Blocking item 2 of the first review.
#
# The script knows which one it was, so the operator should not have to work it
# out. Three conditions, three answers, one printed.
#
# **And the gate is this function answering `none`**, not a second copy of the
# three conditions in a `narcheck_available`. Two copies could drift, and between
# two calls a state could change -- the index written in the meantime -- so the
# gate failed and the reason then said `none`: a generic message and no remedy.
# `judge_and_place` asks once and uses the answer for both. Found by a local
# review, 2026-10-21.
narcheck_unavailable_reason() {
  if [ ! -f "$NAR_CHECK" ]; then
    printf 'absent\n'
  elif ! head -c 1 "$NAR_CHECK" >/dev/null 2>&1; then
    printf 'unreadable\n'
  elif [ ! -f "${LIQUID_INDEX}/lib-classes.txt" ]; then
    printf 'noindex\n'
  else
    printf 'none\n'
  fi
}

# The remedy for one cause, on stderr. Each is a command the operator can run
# where they are, against a path that exists.
narcheck_remedy() {  # narcheck_remedy <reason>
  case "$1" in
    absent|unreadable)
      cat >&2 <<CHECKER
The checker itself is what is missing or unreadable, not the index. It is mounted
read-only from config/liquid/narcheck.py. Ask the operator to look at it:
    docker compose exec nar_builder head -c 1 ${NAR_CHECK}
On Docker Desktop a stale file-sharing mount answers ENOENT for a file that
\`stat\` still reports -- measured 2026-10-16, and restarting Docker Desktop
cleared it.
CHECKER
      ;;
    unsaid)
      cat >&2 <<UNSAIDCHECK
The checker ran and its output, above, carries no JUDGED line with a 0 or
REFUSED line with a 1 for this bundle, which the real one prints every time. It is mounted read-only from
config/liquid/narcheck.py; ask the operator to compare the two -- an empty,
cut-off or older file gives exactly this:
    docker compose exec nar_builder wc -c ${NAR_CHECK}
    wc -c config/liquid/narcheck.py
UNSAIDCHECK
      ;;
    noindex)
      cat >&2 <<INDEX
The index is what is missing, and Liquid writes it on every start. Ask the
operator to look at whether it could:
    docker compose logs liquid | grep "load index"
    docker compose exec liquid ls -l /opt/nifi/nifi-current/api
That directory is the \`liquid_api\` volume since #25, so there is no
volumes/liquid/api on the host to look at -- which is what this message used to
send people to.
INDEX
      ;;
  esac
}

# **The judging step, as its own function, because the decision is what was
# wrong and a decision inside a 300-line build cannot be put to a case.**
#
# It was inline in `build_command`, after the Maven run, so the only way to reach
# it was to build something -- and the review asked for a row per exit status,
# which no case could have written. Extracted 2026-10-20, the idiom `B6-3`
# established for `mvn` and `A11-11` for `docker`: a case evals it out of the
# script and drives every status against a throwaway drop directory, with no
# Maven and no image.
#
# It places the bundle or it does not, and it returns 0 only when the check said
# 0. The caller removes the work directory either way. `part` is cleared by the
# caller, since only the caller's trap reads it.
judge_and_place() {  # judge_and_place <part> <base>
  local part="$1" base="$2"
  local rc refusal kept reason what verdict
  reason="$(narcheck_unavailable_reason)"
  if [ "$reason" = none ]; then
    # **The status decides, not only the pre-check.** Any non-zero landed in the
    # refused arm, so three unrelated states were filed as "your bundle was
    # refused": python3 unable to open the checker after the probe passed (2),
    # python3 absent or not executable (127, 126), and narcheck unable to read
    # the index (1, now 3). The probe narrowed that and could not close it --
    # the field state was a Docker Desktop placeholder, which is exactly the kind
    # of state that can change between `head` and `python3`.
    #
    # So: 0 with `JUDGED <bundle>` deploys, 1 with `REFUSED <bundle>` is refused on
    # merit and gets its specific headline back, and anything else -- either
    # status without its line included, since 2026-10-21 -- takes the same arm as
    # an unavailable checker: not deployed, not filed under `refused/`, status 5,
    # and "nothing here has judged your bundle". Still fail-closed, because only
    # a 0 with its line deploys. The contract is written beside FR36 in
    # docs/FEATURE-liquid-java-extensions.md, as FR36a.
    refusal="$(python3 "$NAR_CHECK" check-index "$part" "$LIQUID_INDEX" 2>&1)" && rc=0 || rc=$?
    # **A verdict counts only when it is said.** An empty checker is a 0 too:
    # `head -c 1` passes on a 0-byte file and python3 runs one and exits 0, so
    # silence deployed every bundle as judged -- measured on main at a3ef20f, a
    # 0-byte checker and one that exits 0 saying nothing were both deployed. And a
    # truncated one is a 1: python3 exits 1 for a SyntaxError, and that filed the
    # bundle under refused/ with the link headline. So 0 needs `JUDGED <bundle>`
    # and 1 needs `REFUSED <bundle>`, which are what check-index prints, and
    # anything else is not a verdict. FR36a as amended 2026-10-21, B6-44.
    verdict=said
    if [ "$rc" -eq 0 ] && ! printf '%s\n' "$refusal" | grep -qxF "JUDGED ${part}"; then
      verdict=unsaid
    elif [ "$rc" -eq 1 ] && ! printf '%s\n' "$refusal" | grep -qxF "REFUSED ${part}"; then
      verdict=unsaid
    fi
    if [ "$rc" -gt 1 ] || [ "$verdict" = unsaid ]; then
      # The name the operator dropped, not the dot-copy -- as the refused arm
      # below has always done. This arm printed narcheck's output raw, so it
      # named a `.part` file deleted two lines later. Found by a local review,
      # 2026-10-21.
      refusal="$(literal_replace "$refusal" "$part" "${DROP}/${base}")"
      if [ "$verdict" = unsaid ]; then
        cat >&2 <<UNSAID

nar-build refused: ${base} was built but cannot be judged, so it is not deployed.
The check exited ${rc} without the verdict line for this bundle that goes with
that status -- which is what an empty, truncated or foreign checker does -- and
silence is not a verdict. Nothing here has judged it: this is about the check,
not the code.

${refusal}
UNSAID
        narcheck_remedy unsaid
      else
        cat >&2 <<CANNOTJUDGE

nar-build refused: ${base} was built but cannot be judged, so it is not deployed.
The check itself did not complete -- it exited ${rc}, which is not a verdict on
your bundle. Nothing here has judged it: this is about the check, not the code.

${refusal}
CANNOTJUDGE
      fi
      # 3 is narcheck saying the index is what it could not use -- unreadable,
      # not text, or naming no API package -- and Liquid writes that index, so
      # the remedy is the missing index's. Any other status is the check itself
      # not completing, which narcheck's own output, above, is about.
      [ "$rc" -eq 3 ] && narcheck_remedy noindex
      rm -f "$part"
      part=""
      # 5, not the refusal's 2: the server answers 2 with 422, "your bundle is
      # unprocessable", and nothing has judged this one. FR36a, B6-45.
      return 5
    fi
    if [ "$rc" -ne 0 ]; then
      # Only after the status is known: a `| sed` in the line above would hand the
      # `if` sed's status instead of the check's, and every bundle would pass.
      refusal="$(literal_replace "$refusal" "$part" "${DROP}/${base}")"
      # Kept rather than deleted, in the subdirectory the auto-loader skips: the
      # bundle is the author's work and the only thing they can inspect to see
      # what the refusal is about. It is out of the load path, which is the part
      # that matters.
      kept=""
      if mkdir -p "${DROP}/refused" && mv "$part" "${DROP}/refused/${base}"; then
        kept="${DROP}/refused/${base}"
      else
        rm -f "$part"
      fi
      part=""
      # Status 1 is a refusal on merit, and its headline is the specific one
      # again -- the first review's blocking item 1, once an index narcheck
      # cannot read had its own status, 3. *Corrected 2026-10-21*: this comment
      # still argued for the hedged headline that change had removed.
      #
      # **Open, and not this branch's to settle alone:** narcheck also exits 1
      # for a class it cannot parse, which is about the bundle but is not a link
      # failure -- measured, `constant 1 carries unknown tag 99` under this very
      # headline. Whether that gets a status of its own is for the reviewer.
      cat >&2 <<REFUSED

nar-build refused: ${base} was built and was not deployed, because it cannot link
against the NiFi API the running Liquid loads. Nothing was placed in ${DROP}, so
Liquid never sees it, and whatever was there before is untouched.

${refusal}
REFUSED
      if [ -n "$kept" ]; then
        echo "The bundle itself is at ${kept}, outside the load path." >&2
      fi
      return 2
    fi
  else
    # Refused, not deployed with a warning.
    #
    # The warning that stood here said the bundle "is deployed unchecked", and it
    # was honest about what it did -- but everything downstream reads a file in
    # the load path as proof that it was judged, and NiFi loads it within seconds
    # either way. A check that does not run must not end in a deployment; that is
    # the shape S4 removed from narcheck two days ago, where an unjudgeable
    # library produced a pass.
    #
    # `config/liquid/entrypoint.sh` already told the operator this is what
    # happens -- "The NAR builder cannot judge bundles and will refuse them all"
    # -- and it was the one sentence of the two that was wrong. D2 of the
    # 2026-10-01 review: one of them had to change, and the entrypoint had the
    # right intent.
    #
    # Reached for any of three reasons -- the checker absent, unreadable, or the
    # index missing -- and `reason` says which, so the message and the remedy are
    # that one's.
    case "$reason" in
      absent) what="${NAR_CHECK} is not there" ;;
      unreadable) what="${NAR_CHECK} is there and cannot be read" ;;
      noindex) what="${LIQUID_INDEX}/lib-classes.txt is missing, and that index is what says which classes the running Liquid can load" ;;
      *) what="the check could not be run" ;;
    esac
    cat >&2 <<NOINDEX

nar-build refused: ${base} was built but cannot be judged, so it is not deployed.
${what}.
Deploying without it would put a bundle in the load path that nothing has checked,
and Liquid loads what is there within seconds.
Nothing here has judged your bundle: this is about the check, not about the code.
NOINDEX
    narcheck_remedy "$reason"
    rm -f "$part"
    part=""
    return 5
  fi

  # **Checked, because `set -e` does not reach here.** The caller runs this as a
  # condition -- `judge_and_place … || rc=$?`, and `if ! judge_and_place` before
  # that -- and a function called as one runs with `set -e` off, so a failing
  # `mv` fell through to `return 0`: measured, the
  # caller reported success, nothing was placed and the dot-file stayed behind.
  # Before this function existed the `mv` sat in the caller, where `set -e`
  # stopped the script and the trap removed the copy; 1 keeps that status, a
  # fault of this installation rather than a verdict. Found by a local review,
  # 2026-10-21; `B6-42` holds it.
  if ! mv "$part" "${DROP}/${base}"; then
    rm -f "$part"
    printf '\nnar-build: %s was judged and could not be placed in %s, so it is not deployed.\n' "$base" "$DROP" >&2
    return 1
  fi
  return 0
}


build_command() {
  rel="$1"
  case "$rel" in
    ""|/*|*..*)
      cat >&2 <<BADPATH
nar-build refused: "${rel}" is not a source directory inside the workspace.
Give a directory under /repos, or run nar-build from inside one.
Run git-repo-info <repository> to find where a repository's clone is.
BADPATH
      return 4
      ;;
  esac

  src="${REPOS}/${rel}"
  if [ ! -d "$src" ]; then
    cat >&2 <<NOSOURCE
nar-build refused: there is no source directory at /repos/${rel}.
Create the processor source there, or run git-repo-info <repository> and work in
the clone it names.
NOSOURCE
    return 4
  fi

  # Where that path actually leads, not how it is spelled.
  #
  # The case above refuses an absolute path and `..`, and that is a check on the
  # *text*. A symlink needs neither: measured, `/repos/esc -> /outside` with the
  # body `esc/api` passed every textual test, and a project outside the workspace
  # was built and deployed as `escaped-nar-1.0.0.nar`. The agents can write
  # /repos, so they can plant the symlink. Minor of the 2026-10-01 review.
  #
  # And the workspace root itself is refused with it. `.` passed the text check
  # and was caught one guard later only because the root happened to hold no
  # pom.xml -- put one there, which any agent can do, and `build .` copies every
  # clone under /repos into the work tree and builds whatever that pom says. The
  # refusal then reports one source while having taken them all.
  resolved="$(cd "$src" 2>/dev/null && pwd -P || true)"
  case "${resolved}/" in
    "${REPOS}"/?*/) ;;
    *)
      cat >&2 <<OUTSIDE
nar-build refused: /repos/${rel} leads to ${resolved:-nowhere}, which is not a
directory inside the workspace.
A path is judged by where it goes, not by how it is written: a symlink out of
/repos is refused, and so is /repos itself -- give the directory of one
processor. Run git-repo-info <repository> to find where a clone is.
OUTSIDE
      return 4
      ;;
  esac

  if [ ! -f "${src}/pom.xml" ]; then
    if [ -z "$(find "${src}/src/main/java" -name '*.java' -type f 2>/dev/null | head -1)" ]; then
      cat >&2 <<NOJAVA
nar-build refused: /repos/${rel} holds no Java source under src/main/java, and no
pom.xml that would say how to build something else.
Put the processor at src/main/java/<package>/<Name>.java and run nar-build again,
or add your own pom.xml to the directory and it will be used unchanged.
NOJAVA
      return 4
    fi
    if [ ! -f "${src}/src/main/resources/META-INF/services/org.apache.nifi.processor.Processor" ]; then
      cat >&2 <<NOSPI
nar-build refused: /repos/${rel} carries no service descriptor, so Liquid would
load the NAR and find no processor in it.
Create src/main/resources/META-INF/services/org.apache.nifi.processor.Processor
holding one fully qualified class name per line, then run nar-build again.
NOSPI
      return 4
    fi
  fi

  # Whether the project brings its own pom decides what an unresolvable API
  # means; the pom test further down is the same one, so the two cannot disagree.
  pom_source=synthesised
  [ -f "${src}/pom.xml" ] && pom_source=author
  if ! TARGET="$(resolve_target "$pom_source")"; then
    printf '%s\n' "$TARGET" >&2
    return 3
  fi
  nifi="$(field nifi_version "$TARGET")"
  api="$(field nifi_api_version "$TARGET")"
  major="$(field java_major "$TARGET")"

  work="$(work_dir_for_build)"
  part=""
  # EXIT as well as the signals. `set -e` is on, so any command that fails
  # between here and the end left $work in /tmp -- a cp -a onto a full /tmp left
  # /tmp/tmp.P164iqUm8o behind -- and a kill during the copy left a .part
  # dot-file in the drop directory. Minor of the 2026-09-28 review.
  trap 'rm -rf "$work"; [ -n "$part" ] && rm -f "$part"' EXIT
  trap 'rm -rf "$work"; [ -n "$part" ] && rm -f "$part"; exit 130' INT
  trap 'rm -rf "$work"; [ -n "$part" ] && rm -f "$part"; exit 143' TERM
  proj="${work}/project"
  mkdir -p "$proj"

  module=""
  if [ -f "${src}/pom.xml" ]; then
    pom_mode=author
    # The reactor root, not the directory that was named. A module whose pom
    # declares a parent one level up cannot resolve it when only the module is
    # copied: Maven answers "Some problems were encountered while processing the
    # POMs" and the build is refused with 422, over a project that is perfectly
    # ordinary. The refusal then told the author to "point nar-build at its
    # directory", which is what they had just done. S7c of the 2026-10-01 review.
    #
    # So walk up while the parent is still inside /repos and carries a pom.xml,
    # copy from there, and build the one module with `-pl`.
    root="$src"
    while [ "$root" != "$REPOS" ]; do
      up="$(dirname "$root")"
      case "$up" in
        "$REPOS"|"$REPOS"/*) ;;
        *) break ;;
      esac
      [ -f "${up}/pom.xml" ] || break
      root="$up"
    done
    module="${src#"$root"}"
    module="${module#/}"
    cp -a "${root}/." "${proj}/"
    # Every target/, not only the top one. A multi-module author pom keeps its
    # artefacts in nar/target and the like, and the deploy step takes the first
    # */target/*.nar it finds -- so a leftover old-stale-0.9.nar from the source
    # tree was reported as freshly built and written into the drop directory.
    # Item 10 of the 2026-09-28 review.
    rm -rf "${proj}/.git"
    # Only a directory named `target` that sits beside a pom.xml, which is what
    # Maven writes into. The blanket `-exec rm -rf` removed a *Java package*
    # named target as well: a project holding com/acme/target/T.java failed with
    # "package com.acme.target does not exist" and 422, and nothing in the
    # message pointed at the builder. S7a of the 2026-10-01 review.
    find "$proj" -type d -name target -prune -print 2>/dev/null | while IFS= read -r d; do
      [ -f "$(dirname "$d")/pom.xml" ] && rm -rf "$d"
    done || true
  else
    pom_mode=synthesised
    # From the whole repository-relative path, not the leaf. With the leaf,
    # /repos/good/proc and /repos/other/proc both produced proc-nar-1.0.0.nar at
    # a hard-coded version 1.0.0: the second replaced the first in the drop
    # directory and reported a plain success. S7b of the 2026-10-01 review. The
    # `/` is outside the class of characters kept, so it becomes a hyphen like
    # anything else: good/proc -> good-proc.
    art="$(printf '%s' "$rel" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9._-' '-' \
          | sed 's/^[.-]*//; s/[.-]*$//')"
    [ -n "$art" ] || art=liquid-processor
    synthesise "$proj" "$art" "$nifi" "$api" "$major" "$src"
  fi

  # Blocker 6 of the 2026-09-28 review -- an author's pom writing a bundle
  # straight into the load path, past narcheck -- used to be caught here by
  # snapshotting ${DROP} around the Maven run and deleting whatever had appeared.
  # It is prevented instead, as of 2026-10-05: the build user cannot reach that
  # directory at all. The comment this replaces said preventing it "means the
  # build and the deployment not sharing a view of that directory, which is a
  # change of shape rather than a repair" -- which was right, and the change of
  # shape turned out to cost four lines, because traversal is decided by the
  # parent and the parent lives in this image.
  #
  # The snapshot had to go rather than be kept as a second line of defence. Once
  # the build cannot write there, everything that appears during the window
  # belongs to somebody else: a concurrent build's deployment, an operator's hand
  # drop, or `refused/` created by the liquid container. Deleting any of those is
  # the defect B2 of the 2026-10-01 review names -- measured, two builds came back
  # "A exit 0" and "B exit 2" with an empty drop directory, and a first-time
  # quarantine went with it. There is nothing left for the comparison to be right
  # about, so what stands in its place is the question above: the build is refused
  # when the containment does not hold, instead of a detector running after the
  # fact over writes it cannot attribute.
  if ! drop_is_closed; then
    cat >&2 <<NOTCLOSED

nar-build refused: this builder is misconfigured and no build will run.
${DROP} is writable by the unprivileged build user ${BUILD_USER}, so a pom could
put a bundle into Liquid's autoload directory without narcheck ever judging it.
The directory is mounted under a root-only parent on purpose; an image built
before 2026-10-05 does not have it. Rebuild the builder image:

  ./config/scripts/build/nar-builder.sh && docker compose up -d nar_builder
NOTCLOSED
    rm -rf "$work"
    return 2
  fi

  log="${work}/maven.log"
  # Maven runs as the unprivileged build user, because everything it runs is the
  # author's: the pom, its plugins and its dependencies. The tree is handed over
  # again here, because `cp -a` above has just put root-owned files into it.
  chown -R "$BUILD_USER" "$work" 2>/dev/null || true
  build_repo="$(repo_for "$work")"
  if [ -n "$module" ]; then
    set -- -f "${proj}/pom.xml" -Dmaven.repo.local="$build_repo" -pl "$module" -am package
  else
    set -- -f "${proj}/pom.xml" -Dmaven.repo.local="$build_repo" package
  fi
  if ! run_maven "$@" > "$log" 2>&1; then
    cat "$log" >&2
    cat >&2 <<BUILDFAILED

nar-build refused: the build of /repos/${rel} failed, so this build deployed
nothing. The artifact that was there before, if any, is untouched.
Fix the errors Maven reported above in /repos/${rel} and run nar-build again.
BUILDFAILED
    rm -rf "$work"
    return 2
  fi

  # M9 of the 2026-10-01 review: only a bundle sitting *directly* in a target/ is
  # a build artefact -- nifi-nar-maven-plugin writes
  # ${project.build.directory}/${finalName}.nar -- and anything nested deeper is
  # something Maven copied. A single fixture .nar under src/test/resources lands
  # in target/test-classes/ and used to be counted, so an ordinary project with a
  # test fixture was refused for "producing 2 NAR files". `|| true` because grep
  # exits 1 on no match, and this script runs under set -e.
  # The module's own target when one was named, so a sibling module's bundle is
  # not counted as this build's output.
  searched="$proj"
  [ -n "$module" ] && searched="${proj}/${module}"
  # A bundle counts when it sits directly in a `target/` **beside a pom.xml**.
  #
  # Directly in one, because that is where nifi-nar-maven-plugin writes
  # <build.directory>/<finalName>.nar and anything deeper is something Maven
  # copied -- a single fixture under src/test/resources lands in
  # target/test-classes/ and used to make an ordinary project "produce 2 NAR
  # files". M9 of the 2026-10-01 review.
  #
  # And beside a pom, because the clean-up above now removes only a module's own
  # build directory -- a blanket `rm -rf` on every directory named `target` also
  # deleted a Java *package* called target, which is S7a. Searching more widely
  # than it cleans is how a stale `old-stale-0.9.nar` in a pom-less target/ came
  # back as this build's output, which is item 10 of the 2026-09-28 review
  # reopening. The two now follow one rule.
  nars="$(find "$searched" -type f -name '*.nar' -path '*/target/*' 2>/dev/null \
          | grep -E '/target/[^/]+\.nar$' \
          | while IFS= read -r f; do
              d="$(dirname "$(dirname "$f")")"
              [ -f "${d}/pom.xml" ] && printf '%s\n' "$f"
            done | sort || true)"
  nar_count="$(printf '%s\n' "$nars" | grep -c . || true)"
  if [ "$nar_count" -gt 1 ]; then
    # Deploying the first of several in directory order is a coin toss the
    # author never sees. Item 10 of the 2026-09-28 review.
    cat >&2 <<MANY

nar-build refused: the build of /repos/${rel} produced ${nar_count} NAR files:

$(printf '  %s\n' $nars)

Only one bundle can be deployed, and nothing here can tell which you meant.
Point nar-build at the module's own directory -- /repos/${rel}/<module> -- and it
is built inside its parent project, or leave one NAR module in the project.
MANY
    rm -rf "$work"
    return 2
  fi
  nar="$(printf '%s\n' "$nars" | head -1)"
  if [ -z "$nar" ]; then
    cat "$log" >&2
    cat >&2 <<NONAR

nar-build refused: the build of /repos/${rel} succeeded but produced no .nar, so
there is nothing to deploy and ${DROP} was left as it was.
A NAR comes from a module with <packaging>nar</packaging> built by the
nifi-nar-maven-plugin: add that module to your pom.xml, or delete the pom.xml and
let nar-build synthesise the project, then run nar-build again.
NONAR
    rm -rf "$work"
    return 2
  fi

  base="$(basename "$nar")"
  mkdir -p "$DROP"
  part="${DROP}/.${base}.$$.part"
  if ! cp "$nar" "$part"; then
    rm -f "$part"
    part=""
    cat >&2 <<NOWRITE

nar-build refused: the build of /repos/${rel} succeeded but ${base} could not be
written to ${DROP}, so nothing was deployed and the artifact that was there
before, if any, is untouched.
Ask the operator whether ${DROP} is writable: docker compose exec nar_builder ls -ld /nar_extensions
NOWRITE
    rm -rf "$work"
    return 2
  fi
  # Judge it here, while it is still a dot-file the autoload scanner ignores.
  # Measured 2026-09-14 in nifi-app.log, and this is why the check sits between
  # the copy and the rename rather than after it:
  #
  #   20:07:48,586  Skipping non-nar file .probe-good-...nar.39.part
  #   20:07:48,634  Found .../probe-good-...nar in auto-load directory
  #   20:07:53,648  Loaded NAR file: ...-unpacked
  #
  # Five seconds from `mv` to loaded, no restart. So `mv` is the moment the
  # bundle becomes live, and the only moment before it at which a refusal still
  # means anything. The same check runs in
  # liquid's entrypoint for whatever was placed there by hand; this one is for
  # everything nar-build itself writes, which is the path agents actually take.
  # Readable, not merely present, and then the status decides: see
  # `judge_and_place`, which carries both and is driven per status by a case.
  # The status is the function's: 2 for a bundle refused on merit, 5 for one
  # nothing could judge (since 2026-10-21; it was 2 as well), 1 for a bundle that
  # could not be placed.
  #
  # **The bundle is placed by `judge_and_place`**, so nothing is moved here. The
  # `mv` that used to follow stayed behind when that function was extracted, and
  # with `part` already cleared it ran as `mv '' …`: under `set -eu` every
  # successful build -- bundle already live -- ended with status 1, which the
  # server answers as a 500. Measured on 2026-10-21 against `B6-18` and `B6-19`,
  # 4 / 2 where `main` is 6 / 0. Found by a local review.
  rc=0
  judge_and_place "$part" "$base" || rc=$?
  part=""
  if [ "$rc" -ne 0 ]; then
    rm -rf "$work"
    return "$rc"
  fi

  # `downloads` means what it says: artifacts this build pulled over the network.
  # With the seed copied into the local repository there is no second source to
  # separate out, and a build whose seed matches reports 0 -- measured. The
  # version of this change that offered the seed as a `file://` remote needed
  # this count to subtract the seed's own lines, or it read 329 on a build that
  # touched nothing remote.
  downloads="$(grep -c 'Downloading from ' "$log" || true)"
  : "${downloads:=0}"
  printf '%s\n' "$TARGET"
  out "built ${base}"
  out "wrote ${DROP}/${base}"
  out "source /repos/${rel}"
  out "pom ${pom_mode}"
  out "downloads ${downloads}"
  out "repository ${build_repo}, seeded from ${SEED}"
  # Nothing to compare a seed with when the API was not resolved: the author's
  # pom names it, and this script never read it.
  [ "$api" = "not resolved" ] || seed_notice "$nifi" "$api"
  out ""
  out "Liquid watches ${DROP}, judges what arrives there, and loads what passes:"
  out "the processor is in the catalogue within seconds. No restart, and none"
  out "should be asked for -- a restart interrupts every flow the instance is"
  out "running."
  rm -rf "$work"
}

case "${1:-}" in
  target) target_command ;;
  build) shift; build_command "${1:-}" ;;
  *)
    echo "usage: build.sh target | build <path relative to /repos>" >&2
    exit 4
    ;;
esac
