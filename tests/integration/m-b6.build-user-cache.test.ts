/**
 * M-B6 · Integration · A real Maven, as the build user, against a cache it does not own
 *
 * Purpose:  C2 of the 2026-10-13 re-review, and it closes the open item that let
 *           it through. The Dockerfile's `chown builder /m2` applies to the image
 *           layer and the compose bind mount shadows it. On rootless Docker the
 *           host directory belongs to the host user, which maps to container
 *           **root**, so the mount arrives `root:root` and the build user
 *           (uid 1500) is neither root nor in group 0. Every real `nar-build` then
 *           died before compiling with
 *           `java.nio.file.AccessDeniedException: /m2/org`.
 *
 *           **Nothing in the suite could see it**, because inside the image with
 *           no bind `/m2` is already builder-owned and a throwaway container is how
 *           almost every case builds. That is the author's own open item #5 -- *no
 *           automated case runs a real Maven as the build user* -- and it is what
 *           this file is for.
 *
 *           It does not reproduce on Docker Desktop, where bind mounts ignore the
 *           mode: a `root:root` 755 mount is writable by uid 1500 there. So the
 *           condition is built on the container's **own** filesystem, where the
 *           permission semantics are the same everywhere, which is also how it was
 *           reproduced by hand: `AccessDeniedException` before, `BUILD SUCCESS`
 *           after.
 * Given:    the builder image built from this branch, and a local repository owned
 *           by root with mode 755
 * When:     a real Maven runs as the build user against it, before and after the
 *           shipped entrypoint has handed the cache over
 * Then:     it is refused before and succeeds after, and the entrypoint is what
 *           makes the difference
 * Covers:   B6-36, FR26, NFR3
 * Unhappy:  The refusal is the negative half and it is the finding. The success
 *           after is the counterpart: without it the case would pass against an
 *           image where Maven cannot run at all.
 */
import { test, expect, describe } from 'bun:test';
import { sh } from '../lib/shell';
import { builderImage } from '../lib/builderimage';

const IMAGE = builderImage();

/** Is Maven Central reachable? Asked once, because one scenario needs it. */
let centralSeen: boolean | null = null;
const centralReachable = () => {
  if (centralSeen === null) {
    centralSeen =
      sh(['curl', '-fsS', '--max-time', '8', '-o', '/dev/null', '-I',
          'https://repo.maven.apache.org/maven2/']).code === 0;
  }
  return centralSeen;
};

/**
 * Run a script in the builder image with a `java` that does nothing, so the real
 * entrypoint can be executed for its `mkdir`/`chmod`/`chown` without starting the
 * build server. Driving the shipped file is the point: a restated `chown` here
 * would pass against an entrypoint that lost it.
 *
 * **The stub goes on the front of `PATH`, and the first version of this did not.**
 * The image puts `/opt/java/openjdk/bin` ahead of `/usr/local/bin`, so a stub
 * written to the latter was never reached, `exec java` started the real
 * `BuildServer`, and the container ran until it was killed by hand. `timeout 60`
 * is the belt: if the entrypoint ever execs a server again, the case fails in a
 * minute instead of hanging the suite.
 */
const inBuilder = (script: string) =>
  sh(['docker', 'run', '--rm', '--entrypoint', 'sh', IMAGE, '-c',
      `mkdir -p /stub && printf '#!/bin/sh\\nexit 0\\n' > /stub/java && chmod +x /stub/java
       export PATH=/stub:$PATH
       ${script}`], undefined, 600_000);

const POM =
  '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId>' +
  '<artifactId>a</artifactId><version>1</version><packaging>jar</packaging></project>';

describe('B6-36 the build user and the cache it is handed', () => {
  test('B6-36 a root-owned cache is unwritable, and the shipped entrypoint fixes that', () => {
    const r = inBuilder(`
      rm -rf /m2 && mkdir -p /m2 && chown 0:0 /m2 && chmod 755 /m2
      printf 'BEFORE=%s\\n' "$(su builder -s /bin/sh -c 'touch /m2/p 2>/dev/null' && echo writable || echo refused)"
      printf 'OWNER_BEFORE=%s\\n' "$(stat -c '%U' /m2)"
      timeout 60 env PATH=/stub:$PATH /entrypoint.sh
      printf 'OWNER_AFTER=%s\\n' "$(stat -c '%U' /m2)"
      printf 'AFTER=%s\\n' "$(su builder -s /bin/sh -c 'touch /m2/q 2>/dev/null' && echo writable || echo refused)"
      printf 'DEPLOY_STILL_CLOSED=%s\\n' "$(su builder -s /bin/sh -c 'ls /deploy >/dev/null 2>&1' && echo no || echo yes)"
    `);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('OWNER_BEFORE=root');
    expect(r.stdout).toContain('BEFORE=refused');
    expect(r.stdout).toContain('OWNER_AFTER=builder');
    expect(r.stdout).toContain('AFTER=writable');
    // Handing over the leaf must not widen anything above it.
    expect(r.stdout).toContain('DEPLOY_STILL_CLOSED=yes');
  }, 900_000);

  test.skipIf(!centralReachable())(
    'B6-36 and a real Maven as that user is refused before and builds after',
    () => {
      const r = inBuilder(`
        mkdir -p /probe/p && printf '%s' '${POM}' > /probe/p/pom.xml && chown -R builder /probe/p
        rm -rf /m2 && mkdir -p /m2 && chown 0:0 /m2 && chmod 755 /m2
        printf 'BEFORE=%s\\n' "$(su builder -s /bin/sh -c 'cd /probe/p && mvn -B -Dmaven.repo.local=/m2 package 2>&1' | grep -c AccessDeniedException)"
        rm -rf /m2 && mkdir -p /m2 && chown 0:0 /m2 && chmod 755 /m2
        timeout 60 env PATH=/stub:$PATH /entrypoint.sh
        printf 'AFTER=%s\\n' "$(su builder -s /bin/sh -c 'cd /probe/p && mvn -B -Dmaven.repo.local=/m2 package 2>&1' | grep -c 'BUILD SUCCESS')"
      `);
      expect(r.code).toBe(0);
      // At least one AccessDeniedException before the entrypoint ran.
      expect(r.stdout).toMatch(/^BEFORE=[1-9][0-9]*$/m);
      expect(r.stdout).toContain('AFTER=1');
    },
    900_000
  );

  test.skipIf(centralReachable())(
    'B6-36 Maven Central is unreachable here, so the real-build half is skipped',
    () => {
      // Not a label: it reads the absence, so a run in this state says which
      // scenario is missing rather than leaving a silent gap.
      expect(centralReachable()).toBe(false);
    }
  );
});
