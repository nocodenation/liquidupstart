/**
 * M-B7 · Integration · The build user's home, which FR37 did not reach
 *
 * Purpose:  #31. FR37 made the Maven repository per build and said nothing one
 *           build writes can be resolved by the next. The build user's home was
 *           not per build: `/home/builder` was builder-owned for the life of the
 *           container, and two files there reached every later Maven --
 *           `~/.mavenrc`, which the `mvn` launcher sources as shell with the
 *           build's arguments in `$*`, and `~/.m2/settings.xml`, which Maven
 *           takes from `user.home`, and `user.home` comes from passwd, so moving
 *           `HOME` did not move it. Measured on `main` at `cb63973`: a planted
 *           `.mavenrc` printed `PLANTED: builder args: -B -o -q
 *           -Dmaven.repo.local=/tmp/tmp.NEXT/m2 -v` from the next `run_maven`.
 *
 *           The repair is a passwd home that is root-owned, empty and 555, and a
 *           per-build home inside the work directory that `run_maven` hands to
 *           Maven as HOME, and as user.home and java.io.tmpdir through
 *           JAVA_TOOL_OPTIONS, so a JVM Maven forks gets it too (FR41).
 * Given:    The builder image built from this tree, and `work_dir_for_build`,
 *           `repo_for`, `run_maven` and `synthesise` taken out of its own
 *           `/opt/builder/build.sh`, so the shipped functions run and not a
 *           restatement of them.
 * When:     Each build user tries to write its home; Maven runs in a work
 *           directory holding a malformed settings file, and in one that does
 *           not hold another's `.mavenrc`; a stub mvn reports what a forked JVM
 *           sees; and the probe processor is built offline as `builder2`.
 * Then:     Both homes are `root:root 555`, empty and unwritable; Maven names
 *           the per-build settings path; the other build's `.mavenrc` is not
 *           sourced while its own is; the forked JVM reports the per-build
 *           paths; and the offline build succeeds with one NAR.
 * Covers:   B7-7, FR37, FR41
 * Unhappy:  The refused writes and the unsourced `.mavenrc` are the negatives.
 *           Each has its counterpart: the settings read from the per-build
 *           home, the same `.mavenrc` sourced in its own build, and a real build
 *           succeeding -- without them the lock would pass against a Maven that
 *           reads nothing or cannot build at all.
 */
import { test, expect, describe } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { builderImage } from '../lib/builderimage';
import { PROBE_PACKAGE, PROBE_SIMPLE_NAME, PROBE_SOURCE } from '../lib/narfixture';

const IMAGE = builderImage();

/** The shipped functions and the globals they read, out of the image's build.sh. */
const SHIPPED =
  `eval "$(sed -n -E '/^(BUILD_USER|SEED|PINS|NAR_PLUGIN_VERSION)=/p; ` +
  `/^(work_dir_for_build|repo_for|run_maven|synthesise)\\(\\) \\{/,/^}/p' /opt/builder/build.sh)"`;

const inBuilder = (script: string, extra: string[] = []) =>
  sh(['docker', 'run', '--rm', ...extra, '--entrypoint', 'sh', IMAGE, '-c', `${SHIPPED}\n${script}`]);

// No plugin is bound to `validate` for a `pom` project and `-v` reads no pom, so
// neither needs the network or the seed.
const POM =
  '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId>' +
  '<artifactId>a</artifactId><version>1</version><packaging>pom</packaging></project>';

describe('B7-7 the passwd home is closed to the build user', () => {
  test('B7-7 neither build user can write its passwd home', () => {
    const r = inBuilder(`
      for u in builder builder2; do
        printf '%s mode=%s\\n' "$u" "$(stat -c '%U:%G %a' /home/$u)"
        printf '%s entries=[%s]\\n' "$u" "$(ls -A /home/$u | tr '\\n' ' ')"
        printf '%s mavenrc=%s\\n' "$u" "$(su $u -s /bin/sh -c 'touch ~/.mavenrc 2>/dev/null' && echo written || echo refused)"
        printf '%s m2=%s\\n' "$u" "$(su $u -s /bin/sh -c 'mkdir ~/.m2 2>/dev/null' && echo written || echo refused)"
      done
    `);
    expect(r.code).toBe(0);
    for (const u of ['builder', 'builder2']) {
      expect(r.stdout).toContain(`${u} mode=root:root 555`);
      // Empty: a skel `.bashrc` left builder-owned is the shape B7-6 exists for.
      expect(r.stdout).toContain(`${u} entries=[]`);
      expect(r.stdout).toContain(`${u} mavenrc=refused`);
      expect(r.stdout).toContain(`${u} m2=refused`);
    }
  }, 900_000);
});

describe('B7-7 Maven reads only the home of the build that is running', () => {
  test('B7-7 Maven reads its settings from the build\'s own home', () => {
    // Malformed on purpose, so Maven names the path it read in its refusal; a
    // well-formed file would be read silently.
    const r = inBuilder(`
      W=$(work_dir_for_build)
      mkdir -p "$W/home/.m2" "$W/p"
      printf '%s' '<settings><broken' > "$W/home/.m2/settings.xml"
      printf '%s' '${POM}' > "$W/p/pom.xml"
      chown -R "$BUILD_USER" "$W"
      echo "W=$W"
      run_maven "$W" -o -f "$W/p/pom.xml" validate 2>&1 || true
    `);
    const w = r.stdout.match(/^W=(\S+)$/m)?.[1];
    expect(w).toBeTruthy();
    expect(r.stdout).toContain(`Non-readable settings ${w}/home/.m2/settings.xml`);
    expect(r.stdout).not.toContain('/home/builder/.m2');
  }, 900_000);

  test('B7-7 one build\'s .mavenrc is not sourced by another, and is by its own', () => {
    // The issue's reproduction, turned into a case. The second run is the
    // counterpart: without it the first passes against a launcher that never
    // sources anything.
    const r = inBuilder(`
      W1=$(work_dir_for_build); W2=$(work_dir_for_build)
      echo 'echo PLANTED-B7-7' > "$W1/home/.mavenrc"
      chown "$BUILD_USER" "$W1/home/.mavenrc"
      printf 'OTHER=[%s]\\n' "$(run_maven "$W2" -o -q -v 2>&1 | grep PLANTED)"
      printf 'OWN=[%s]\\n' "$(run_maven "$W1" -o -q -v 2>&1 | grep PLANTED)"
    `);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('OTHER=[]');
    expect(r.stdout).toContain('OWN=[PLANTED-B7-7]');
  }, 900_000);

  test('B7-7 a JVM that Maven forks gets the per-build user.home and java.io.tmpdir', () => {
    // A stub over the real mvn -- `su` resets PATH, so one earlier on it is never
    // found -- that starts a JVM the way surefire or an `exec` would: on its own,
    // reading user.home from passwd unless it is told otherwise.
    const r = inBuilder(`
      printf '#!/bin/sh\\nexec /opt/java/openjdk/bin/java -XshowSettings:properties -version\\n' > "$(command -v mvn)"
      W=$(work_dir_for_build)
      echo "W=$W"
      run_maven "$W" 2>&1
    `);
    const w = r.stdout.match(/^W=(\S+)$/m)?.[1];
    expect(w).toBeTruthy();
    expect(r.stdout).toContain(`user.home = ${w}/home`);
    expect(r.stdout).toContain(`java.io.tmpdir = ${w}/tmp`);
  }, 900_000);
});

describe('B7-7 and a build still works with the home closed', () => {
  const src = mkdtempSync(join(tmpdir(), 'm-b7-home-'));
  const javaDir = join(src, 'src/main/java', ...PROBE_PACKAGE.split('.'));
  mkdirSync(javaDir, { recursive: true });
  mkdirSync(join(src, 'src/main/resources/META-INF/services'), { recursive: true });
  writeFileSync(join(javaDir, `${PROBE_SIMPLE_NAME}.java`), PROBE_SOURCE);
  writeFileSync(
    join(src, 'src/main/resources/META-INF/services/org.apache.nifi.processor.Processor'),
    `${PROBE_PACKAGE}.${PROBE_SIMPLE_NAME}\n`
  );

  test('B7-7 a seeded offline build still succeeds with the read-only home', () => {
    // The issue's open item: nothing in a build needs a writable passwd home.
    // As builder2, so the second slot user is shown to build too.
    const r = inBuilder(
      `
      [ -f /opt/builder/m2-seed.record ] || { echo NO-SEED; exit 0; }
      nifi=$(sed -n 's/^nifi_version=//p' /opt/builder/m2-seed.record)
      api=$(sed -n 's/^nifi_api_version=//p' /opt/builder/m2-seed.record)
      W=$(work_dir_for_build)
      synthesise "$W/project" probe-home "$nifi" "$api" 21 /src
      chown -R "$BUILD_USER" "$W"
      repo=$(repo_for "$W")
      run_maven "$W" -o -f "$W/project/pom.xml" -Dmaven.repo.local="$repo" package > "$W/log" 2>&1
      echo "rc=$?"
      grep -c 'BUILD SUCCESS' "$W/log" | sed 's/^/success=/'
      printf 'nars=%s\\n' "$(find "$W/project" -path '*/target/*.nar' | wc -l)"
      printf 'home-after=[%s]\\n' "$(ls -A /home/builder2 | tr '\\n' ' ')"
      tail -30 "$W/log" >&2
    `,
      ['--network', 'none', '-e', 'NAR_BUILDER_BUILD_USER=builder2', '-v', `${src}:/src:ro`]
    );
    // Read, not assumed: against an image with no seed every line below is
    // false for a reason that has nothing to do with the home.
    expect(r.stdout).not.toContain('NO-SEED');
    expect(r.stdout).toContain('rc=0');
    expect(r.stdout).toContain('success=1');
    expect(r.stdout).toContain('nars=1');
    expect(r.stdout).toContain('home-after=[]');
  }, 900_000);
});
