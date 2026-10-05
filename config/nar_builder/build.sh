#!/bin/sh
set -eu

REPOS=/repos
# Under a root-only /deploy, so the unprivileged build user cannot reach it: the
# host directory this is mounted from is `chmod 777` by liquid.sh and its own mode
# therefore closes nothing. See the Dockerfile for the measurement.
DROP=/deploy/nar_extensions
CACHE=/m2
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
  probe="$(mktemp -d)"

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

  if ! run_maven -f "${probe}/pom.xml" -Dmaven.repo.local="$CACHE" dependency:list \
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

resolve_target() {
  if ! curl -sk --max-time 10 -o /dev/null "https://${LIQUID_HOST}:${LIQUID_PORT}/nifi" 2>/dev/null; then
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
    cat <<UNRESOLVED
nar-build refused: the nifi-api version could not be resolved through
org.apache.nifi:nifi-utils:${NAR_BUILD_API_PROBE_VERSION:-$nifi}, and this build will not
guess it. NiFi versions nifi-api on its own line — ${nifi} does not ship nifi-api ${nifi} —
and a NAR compiled against an API newer than the one Liquid loads compiles cleanly and
fails at runtime with NoSuchMethodError, which nobody sees until a flow runs.
Maven said:
${API_ERROR}
Add a pom.xml to the source directory naming the nifi-api version you mean — nar-build uses
it unchanged — or ask the operator whether the builder can reach Maven Central:
docker compose exec nar_builder curl -sSI https://repo.maven.apache.org/maven2/
Nothing was built and nothing was written to ${DROP}.
UNRESOLVED
    return 3
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

  if ! TARGET="$(resolve_target)"; then
    printf '%s\n' "$TARGET" >&2
    return 3
  fi
  nifi="$(field nifi_version "$TARGET")"
  api="$(field nifi_api_version "$TARGET")"
  major="$(field java_major "$TARGET")"

  work="$(mktemp -d)"
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
  # author's: the pom, its plugins and its dependencies. The work tree and the
  # cache are handed over for the duration; nothing else is.
  chown -R "$BUILD_USER" "$work" 2>/dev/null || true
  if [ -n "$module" ]; then
    set -- -f "${proj}/pom.xml" -Dmaven.repo.local="$CACHE" -pl "$module" -am package
  else
    set -- -f "${proj}/pom.xml" -Dmaven.repo.local="$CACHE" package
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
  if [ -f "$NAR_CHECK" ] && [ -f "${LIQUID_INDEX}/lib-classes.txt" ]; then
    if ! refusal="$(python3 "$NAR_CHECK" check-index "$part" "$LIQUID_INDEX" 2>&1)"; then
      # Only after the status is known: a `| sed` in the line above would hand the
      # `if` sed's status instead of the check's, and every bundle would pass.
      refusal="$(printf '%s\n' "$refusal" | sed "s|${part}|${DROP}/${base}|g")"
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
      cat >&2 <<REFUSED

nar-build refused: ${base} was built, but it cannot link against the NiFi API the
running Liquid loads, so it was not deployed. Nothing was placed in ${DROP}, so
Liquid never sees it, and whatever was there before is untouched.

${refusal}
REFUSED
      if [ -n "$kept" ]; then
        echo "The bundle itself is at ${kept}, outside the load path." >&2
      fi
      rm -rf "$work"
      return 2
    fi
  else
    # Say it rather than deploy silently unchecked. A check that quietly does not
    # run is worse than none: everything downstream reads a deployment as proof
    # the bundle was judged.
    out "Warning: ${NAR_CHECK} or ${LIQUID_INDEX}/lib-classes.txt is missing; ${base} is deployed unchecked."
  fi

  mv "$part" "${DROP}/${base}"
  part=""

  downloads="$(grep -c 'Downloading from ' "$log" || true)"
  printf '%s\n' "$TARGET"
  out "built ${base}"
  out "wrote ${DROP}/${base}"
  out "source /repos/${rel}"
  out "pom ${pom_mode}"
  out "downloads ${downloads}"
  out "cache ${CACHE}"
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
