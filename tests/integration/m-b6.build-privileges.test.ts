/**
 * M-B6 · Integration · What build-time code can reach
 *
 * Purpose:  Everything Maven runs during a build is the author's -- the pom, its
 *           plugins, its dependencies -- and it ran as root. B1 of the
 *           2026-10-01 review measured what that reached, through a pom with
 *           `maven-antrun-plugin` bound to `validate` and real Maven: `uid=0`,
 *           a line appended to `/repos/victim/.git/config` (another
 *           repository's clone), a marker in the shared `/m2` that every later
 *           build resolves from, and a line appended to `/opt/builder/build.sh`
 *           which came back as line 18 of the next, unrelated build. The
 *           response to the build that did all that said only "succeeded but
 *           produced no .nar".
 *
 *           It matters because the agents run git in those clones and hold
 *           `/git-secrets`, so it is a path from the credential-free builder to
 *           the credential holders. `build.sh` also carries the narcheck gate,
 *           and stayed rewritten until the container was recreated.
 *
 *           **These cases assert the property, not the exploit.** A case built
 *           on `maven-antrun-plugin` would need that plugin downloaded -- it is
 *           not in the cache this stack ships -- which is S9's complaint about
 *           machine state, one layer in. What the repair changes is what the
 *           build user can reach, so that is what is measured, and it is
 *           measured against an image built in the run rather than whatever
 *           `liquidupstart/nar-builder:latest` on this host happens to be.
 * Given:    An image built from `config/nar_builder` at this head, tagged per
 *           run, with `/repos` mounted read-only and holding a second clone
 *           `victim/.git/config`, and a writable `/m2`.
 * When:     The unprivileged build user, and root, each try to write the four
 *           places a build could reach.
 * Then:     The build user is refused `/repos`, `/opt/builder` and
 *           `/nar_extensions`; root is refused `/repos` as well, because the
 *           mount is read-only; and `run_maven` out of the shipped `build.sh`
 *           runs its command as a non-root user.
 * Covers:   B6-1, B6-2, B6-3, B6-4, FR25, NFR2
 * Unhappy:  B6-1 and B6-4 are the refusals. B6-2 is the counterpart and it is
 *           the one that stops the repair being met by a user that can do
 *           nothing: the build user must still read the source it compiles and
 *           write the shared cache, or no build works at all.
 *
 * Deliberately not asserted: that a real Maven build still produces a NAR. It
 * needs the stack, and the stack-tier M-B cases hold it. Measured by hand on
 * 2026-10-04 instead -- `run_maven` taken out of the image's own `build.sh`,
 * `mvn -o ... validate` against the shipped cache: exit 0, `Building probe
 * 1.0.0`, as uid 1500. The first attempt failed with `su: invalid option --
 * 'o'`, which is why `--` is in the call.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const RUN = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const IMAGE = `liquidupstart/nar-builder:b6-${RUN}`;
const BUILD_SH = join(repoRoot, 'config/nar_builder/build.sh');

const work = mkdtempSync(join(tmpdir(), 'm-b6-privileges-'));
const repos = join(work, 'repos');
const cache = join(work, 'm2');
// 777, because that is what `config/scripts/start/liquid.sh:85` makes it on a
// real installation -- Liquid runs as nifi and rootless Docker leaves the bind
// mount owned by container root, which is blocker 4 of the 2026-09-28 review.
// The first version of this file mounted nothing here and so measured the
// image's own root-owned 755 directory: the refusal passed for the wrong reason,
// and in production the build user could write the load path. Corrected
// 2026-10-05, with the measurement in the block header.
const drop = join(work, 'nar_extensions');
const probe = join(work, 'probe.sh');

mkdirSync(join(repos, 'victim', '.git'), { recursive: true });
writeFileSync(join(repos, 'victim', '.git', 'config'), '[core]\n');
mkdirSync(cache, { recursive: true });
mkdirSync(join(drop, 'refused'), { recursive: true });
chmodSync(drop, 0o777);
chmodSync(join(drop, 'refused'), 0o777);

// One container, every question, so the file costs one `docker run`. The script
// is built from plain string literals rather than a template literal, because
// `${t}` in a template literal is a substitution and escaping it as `\\${t}`
// writes a literal backslash into the file. That cost a run here, and the
// handover records it as the third time.
const PROBE =
  [
    "#!/bin/sh",
    "echo \"build-user-line: $(getent passwd builder || echo MISSING)\"",
    "# Whether su can become that user at all, kept apart from what it may write.",
    "# Without this the refusals below pass when the user does not exist, which is",
    "# how the control first came back 4/4 green against the unrepaired image: a",
    "# negative reading satisfied by the mechanism being absent.",
    "if su builder -s /bin/sh -c true 2>/dev/null; then have_user=yes; else have_user=no; fi",
    "echo \"builder-usable: ${have_user}\"",
    "for t in /repos/victim /opt/builder /deploy/nar_extensions /m2; do",
    "  if [ \"$have_user\" = no ]; then",
    "    echo \"builder-writes ${t}: no-such-user\"",
    "  elif su builder -s /bin/sh -c \"touch ${t}/b6-probe 2>/dev/null\"; then",
    "    echo \"builder-writes ${t}: yes\"",
    "  else",
    "    echo \"builder-writes ${t}: refused\"",
    "  fi",
    "done",
    "if su builder -s /bin/sh -c 'cat /repos/victim/.git/config >/dev/null 2>&1'; then",
    "  echo \"builder-reads /repos: yes\"",
    "else",
    "  echo \"builder-reads /repos: no\"",
    "fi",
    "if [ \"$have_user\" = no ]; then",
    "  echo \"quarantine-removed: no-such-user\"",
    "elif su builder -s /bin/sh -c 'rm -rf /deploy/nar_extensions/refused 2>/dev/null'; then",
    "  echo \"quarantine-removed: yes\"",
    "else",
    "  echo \"quarantine-removed: refused\"",
    "fi",
    "if touch /repos/victim/root-probe 2>/dev/null; then",
    "  echo \"root-writes /repos: yes\"",
    "else",
    "  echo \"root-writes /repos: no\"",
    "fi",
    "# A stub mvn that answers with its own uid: no Maven, no cache, no network.",
    "# The question is only which user run_maven hands its command to. Written",
    "# over the real mvn rather than put first on PATH, because `su` resets PATH",
    "# to the system default even without `-`, so a stub in /tmp was never found.",
    "stub=$(command -v mvn)",
    "printf '#!/bin/sh\\nid -u\\n' > \"$stub\"",
    "chmod 755 \"$stub\"",
    "eval \"$(sed -n '/^BUILD_USER=/p;/^run_maven() {/,/^}/p' /opt/builder/build.sh)\"",
    "echo \"run_maven-uid: $(run_maven -q 2>/dev/null | tail -1)\"",
  ].join('\n') + '\n';

writeFileSync(probe, PROBE, { mode: 0o755 });

let out = '';
beforeAll(() => {
  const built = sh(['docker', 'build', '-q', '-t', IMAGE, join(repoRoot, 'config/nar_builder')]);
  if (built.code !== 0) throw new Error(`the builder image did not build:\n${built.output}`);
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${repos}:/repos:ro`,
    '-v', `${cache}:/m2`,
    '-v', `${drop}:/deploy/nar_extensions`,
    '-v', `${probe}:/probe.sh:ro`,
    '--entrypoint', '/bin/sh',
    IMAGE, '/probe.sh'
  ]);
  if (r.code !== 0) throw new Error(`the probe did not run:\n${r.output}`);
  out = r.output;
}, 600_000);

afterAll(() => {
  sh(['docker', 'rmi', '-f', IMAGE]);
  rmSync(work, { recursive: true, force: true });
});

const says = (line: string) => out.includes(line);

describe('B6-1 build-time code cannot reach what it has no business with', () => {
  test('B6-1 the premise: su can become the build user at all', () => {
    // Asserted first and on its own, because every refusal below is read off a
    // `su` that ran. Against the unrepaired image this file came back 4 pass /
    // 4 fail with all three refusals among the passes -- `su builder` failed,
    // the touch never happened, and "refused" looked the same as "no such user".
    expect(out).toContain('builder-usable: yes');
  });

  test('B6-1 it cannot write another repository\u0027s clone', () => {
    // The leg that matters most: the agents run git in these clones and hold
    // /git-secrets, so a write here is a path from the builder to the keys.
    expect({ repos: says('builder-writes /repos/victim: refused') }).toEqual({ repos: true });
  });

  test('B6-1 it cannot rewrite the script that holds the narcheck gate', () => {
    expect({ builder: says('builder-writes /opt/builder: refused') }).toEqual({ builder: true });
  });

  test('B6-1 and it cannot write the load path, which is mounted 777', () => {
    // build.sh, which is root, is what puts a judged bundle there. The leaf's
    // own mode closes nothing -- the host directory is 777 and this case mounts
    // it that way on purpose. What closes it is the parent: /deploy is
    // root-owned and 700 in the image, and traversal is the parent's decision.
    //
    // Measured before that move, against the same 777 mount: "builder writes the
    // 777 drop directory: YES" and "builder removes the quarantine: YES" -- so a
    // bundle could reach NiFi's autoloader without passing narcheck, which is
    // blocker 6 of the 2026-09-28 review, by the one route the intruder check
    // was added to catch.
    expect({
      drop: says('builder-writes /deploy/nar_extensions: refused'),
      quarantineSurvives: says('quarantine-removed: refused')
    }).toEqual({ drop: true, quarantineSurvives: true });
  });
});

describe('B6-2 the counterpart: it can still do its work', () => {
  test('B6-2 the build user exists in the image', () => {
    expect(out).toMatch(/build-user-line: builder:/);
  });

  test('B6-2 it reads the source it compiles and writes the shared cache', () => {
    // Without this, B6-1 is satisfied by a user that cannot build anything,
    // which is the same shape as a guard that only ever refuses.
    expect({
      reads: says('builder-reads /repos: yes'),
      cache: says('builder-writes /m2: yes')
    }).toEqual({ reads: true, cache: true });
  });
});

describe('B6-3 Maven runs as that user, not as root', () => {
  test('B6-3 run_maven out of the shipped build.sh drops the privilege', () => {
    // Read out of /opt/builder/build.sh inside the image, so this is the file
    // that ships rather than a copy of it. The stub mvn answers with its uid.
    const m = out.match(/run_maven-uid: (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThan(0);
  });
});

describe('B6-4 and the mount itself is read-only', () => {
  test('B6-4 the premise: a read-only bind mount refuses root as well', () => {
    // A premise about docker on this host, not a statement about the product --
    // this file mounts `/repos:ro` itself, so it passed in the control against
    // the unrepaired tree too, and it was the only one that did. It is kept
    // because the compose declaration below is worth nothing if `:ro` does not
    // hold for uid 0, and that is the case the next test relies on.
    expect({ root: says('root-writes /repos: no') }).toEqual({ root: true });
  });

  test('B6-4 compose declares it read-only', () => {
    const compose = sh(['sed', '-n', '/nar_builder:/,/^  [a-z]/p', join(repoRoot, 'compose.yml')]);
    expect(compose.stdout).toMatch(/\.\/volumes\/repos:\/repos:ro/);
  });
});
