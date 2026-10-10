#!/bin/sh
# The seeding step, owned by the image build.
#
# It resolves the closure of the project `build.sh` synthesises into a read-only
# seed, so that an ordinary build copies what it needs out of the image instead
# of fetching it from the internet. The operator decided on 2026-10-09 that the
# image build owns this rather than a warm-up build or ordinary builds filling a
# shared directory: an image layer is rebuilt by the same command that builds
# everything else, and nothing has to remember to run it.
#
# Measured 2026-10-10 at NiFi 2.11.0: 24.1 s, 178 jars, 57,406,710 bytes, a
# 67.7 MB layer. One skeleton build's closure is 178 jars against the 256 that
# months of real use had accumulated in the installation's shared cache, so the
# common case needs no curating -- the seed is whatever the generated skeleton
# itself pulls.
#
# The pins come from lifecycle-pins.xml and that file says why they are
# required. They are spliced here and by `build.sh`, from the same file, so the
# seed is the closure of the build that will run against it.
#
# A version this cannot resolve fails the image build. That is deliberate: the
# loud place for a bad pin is `build.sh` in CI or on the operator's machine, not
# an agent's first `nar-build`.
set -eu

NIFI_VERSION="${1:?nifi version}"
NAR_PLUGIN_VERSION="${2:?nar plugin version}"
SEED="${3:?seed directory}"
PINS="${4:-/opt/builder/lifecycle-pins.xml}"

# The nifi-api version is **resolved, never passed in**, and that is not tidiness.
#
# NiFi versions nifi-api on its own line: 2.11.0 ships nifi-api 2.10.0, which §3.2
# of the feature document spells out. The first version of this step took the API
# version as an argument and the Dockerfile defaulted it to the NiFi version. The
# result built and deployed a bundle and the seed served almost none of it --
# `downloads 438, from_seed 329` on the first real end-to-end run, because the
# seed held the 2.11.0 closure and the build wanted 2.10.0. `build.sh`'s own
# `seed_notice` is what reported it.
#
# So it is computed the way `build.sh` computes it, by resolving `nifi-utils` at
# the distribution's version and reading what that drags in. One fewer argument
# is one fewer argument that can be wrong, and this one was.
probe="$(mktemp -d)"
cat > "${probe}/pom.xml" <<POM
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>org.nocodenation.liquid</groupId>
  <artifactId>nifi-api-probe</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>
  <dependencies>
    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-utils</artifactId>
      <version>${NIFI_VERSION}</version>
    </dependency>
  </dependencies>
</project>
POM
# `if !` rather than a bare call, because `set -e` would otherwise take the
# script out at this line with the resolution log still inside $probe and
# nothing printed at all. Measured: with the network removed this exited 1 with
# a zero-byte log, which is the least useful failure a build step can have.
if ! mvn -B -f "${probe}/pom.xml" -Dmaven.repo.local="$SEED" dependency:list \
     > "${probe}/resolve.log" 2>&1; then
  echo "seed.sh: resolving nifi-utils:${NIFI_VERSION} failed, so the nifi-api" >&2
  echo "  version is unknown and the seed would hold the wrong closure." >&2
  echo "  Maven said:" >&2
  grep '^\[ERROR\]' "${probe}/resolve.log" | head -4 | sed 's/^/    /' >&2
  rm -rf "$probe"
  exit 1
fi
API_VERSION="$(sed -n 's/.*org\.apache\.nifi:nifi-api:jar:\([0-9][^:]*\):.*/\1/p' \
               "${probe}/resolve.log" | head -1)"
rm -rf "$probe"
if [ -z "$API_VERSION" ]; then
  echo "seed.sh: nifi-utils:${NIFI_VERSION} resolved but named no nifi-api, so the" >&2
  echo "  seed would hold the wrong closure and every build would re-fetch it." >&2
  echo "  The image build stops here rather than shipping that quietly." >&2
  exit 1
fi
echo "seed.sh: nifi ${NIFI_VERSION} resolves nifi-api ${API_VERSION}"

art=liquid-seed
proj="$(mktemp -d)"
mkdir -p "${proj}/processors/src/main/java/org/nocodenation/seed" "${proj}/nar"

# The pins, with the XML comment stripped: Maven accepts comments, but keeping
# them out makes the generated pom readable when a build is being diagnosed.
pins="$(sed '/<!--/,/-->/d' "$PINS")"

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
    <maven.compiler.release>21</maven.compiler.release>
    <nifi.version>${NIFI_VERSION}</nifi.version>
    <nifi.api.version>${API_VERSION}</nifi.api.version>
  </properties>
  <modules>
    <module>processors</module>
    <module>nar</module>
  </modules>
${pins}
</project>
POM

cat > "${proj}/processors/pom.xml" <<POM
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
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
<project xmlns="http://maven.apache.org/POM/4.0.0">
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

# A real class, so the compiler plugin compiles rather than reporting no
# sources. A seed produced by a no-op compile is not shown to hold what a
# compile needs -- the same objection as a count of zero with nothing counted.
cat > "${proj}/processors/src/main/java/org/nocodenation/seed/SeedProbe.java" <<'JAVA'
package org.nocodenation.seed;

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;
import org.apache.nifi.processor.exception.ProcessException;

/** Exists so the seeding build resolves a compile's closure, not a parse's. */
public class SeedProbe extends AbstractProcessor {
    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) throws ProcessException {
    }
}
JAVA

mvn -B -f "${proj}/pom.xml" -Dmaven.repo.local="$SEED" package

# The seed's own artifacts are nobody's dependency, and leaving them makes the
# seed look larger than it is.
rm -rf "${SEED}/org/nocodenation"
rm -rf "$proj"

# What the seed holds, computed here and read by build.sh rather than assumed by
# it: a build whose target version differs from this says so in one line instead
# of quietly re-fetching. CLAUDE.md's rule -- a computed answer cannot go stale
# when the system changes.
printf 'nifi_version=%s\nnifi_api_version=%s\nnar_plugin_version=%s\njars=%s\n' \
  "$NIFI_VERSION" "$API_VERSION" "$NAR_PLUGIN_VERSION" \
  "$(find "$SEED" -name '*.jar' | wc -l | tr -d ' ')" \
  > "${SEED}.record"
