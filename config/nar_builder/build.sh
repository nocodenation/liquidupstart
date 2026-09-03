#!/bin/sh
set -eu

REPOS=/repos
DROP=/nar_extensions
CACHE=/m2
LIQUID_LOGS=/liquid/logs
LIQUID_HOST="${NAR_BUILD_LIQUID_HOST:-liquid}"
LIQUID_PORT="${SYSTEM_HTTPS_PORT:-8833}"
NAR_PLUGIN_VERSION="${NAR_BUILD_PLUGIN_VERSION:-2.4.0}"

out() { printf '%s\n' "$*"; }

field() {
  printf '%s\n' "$2" | sed -n "s/^$1 \(.*\)$/\1/p"
}

resolve_target() {
  if ! curl -sk --max-time 10 -o /dev/null "https://${LIQUID_HOST}:${LIQUID_PORT}/nifi" 2>/dev/null; then
    cat <<UNREACHABLE
nar-build refused: the target version could not be read, because Liquid does not
answer at ${LIQUID_HOST}:${LIQUID_PORT}.
A NAR compiled against the wrong nifi-api is not rejected by Liquid — it is
silently never loaded — so this build stops rather than guessing a version.
Start the stack and run nar-build again: ./scripts/linux/start.sh, or
docker compose start liquid when the rest of the stack is already up.
Nothing was built and nothing was written to ${DROP}.
UNREACHABLE
    return 3
  fi

  line=""
  source_log=""
  for f in $(ls -t "${LIQUID_LOGS}"/nifi-app*.log 2>/dev/null || true); do
    line="$(grep 'Starting NiFi ' "$f" 2>/dev/null | tail -1 || true)"
    if [ -n "$line" ]; then
      source_log="$f"
      break
    fi
  done

  nifi="$(printf '%s' "$line" | sed -n 's/.*Starting NiFi \([0-9][^ ]*\) using Java \([^ ]*\).*/\1/p')"
  java="$(printf '%s' "$line" | sed -n 's/.*Starting NiFi \([0-9][^ ]*\) using Java \([^ ]*\).*/\2/p')"
  major="$(printf '%s' "$java" | sed -n 's/^\([0-9][0-9]*\).*/\1/p')"

  if [ -z "$nifi" ] || [ -z "$major" ]; then
    cat <<UNREADABLE
nar-build refused: the target version could not be read. Liquid answers at
${LIQUID_HOST}:${LIQUID_PORT}, but no startup record of the running instance was
found in ${LIQUID_LOGS} — that record is where the NiFi and Java versions are read
from, and this build will not guess them.
Ask the operator to restart Liquid so it writes one: docker compose restart liquid.
Nothing was built and nothing was written to ${DROP}.
UNREADABLE
    return 3
  fi

  out "nifi_version ${nifi}"
  out "nifi_api_version ${nifi}"
  out "java_version ${java}"
  out "java_major ${major}"
  out "read_from liquid at ${LIQUID_HOST}:${LIQUID_PORT} ($(basename "${source_log}"))"
}

synthesise() {
  proj="$1"
  art="$2"
  nifi="$3"
  major="$4"
  src="$5"

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
  </properties>
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.apache.nifi</groupId>
        <artifactId>nifi-api</artifactId>
        <version>\${nifi.version}</version>
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
      <version>\${nifi.version}</version>
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
  nifi="$(field nifi_api_version "$TARGET")"
  major="$(field java_major "$TARGET")"

  work="$(mktemp -d)"
  part=""
  trap 'rm -rf "$work"; [ -n "$part" ] && rm -f "$part"; exit' INT TERM
  proj="${work}/project"
  mkdir -p "$proj"

  if [ -f "${src}/pom.xml" ]; then
    pom_mode=author
    cp -a "${src}/." "${proj}/"
    rm -rf "${proj}/target" "${proj}/.git"
  else
    pom_mode=synthesised
    art="$(basename "$rel" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9._-' '-' \
          | sed 's/^[.-]*//; s/[.-]*$//')"
    [ -n "$art" ] || art=liquid-processor
    synthesise "$proj" "$art" "$nifi" "$major" "$src"
  fi

  log="${work}/maven.log"
  if ! mvn -B -f "${proj}/pom.xml" -Dmaven.repo.local="$CACHE" package > "$log" 2>&1; then
    cat "$log" >&2
    cat >&2 <<BUILDFAILED

nar-build refused: the build of /repos/${rel} failed, so nothing was written to
${DROP} — the artifact that was there before, if any, is untouched.
Fix the errors Maven reported above in /repos/${rel} and run nar-build again.
BUILDFAILED
    rm -rf "$work"
    return 2
  fi

  nar="$(find "$proj" -type f -name '*.nar' -path '*/target/*' | head -1)"
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
  part="${DROP}/.${base}.part"
  mkdir -p "$DROP"
  cp "$nar" "$part"
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
  out "Liquid loads NARs from ${DROP} at startup only. Ask the operator to restart it:"
  out "docker compose restart liquid"
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
