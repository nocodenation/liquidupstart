/**
 * M-B6 · Integration · A path is judged by where it leads
 *
 * Purpose:  M1 of the 2026-10-01 review. The path guard refused an absolute path
 *           and `..` with a `case` on the string, which is a test of how a path is
 *           *spelled*. A symlink needs neither: measured, `/repos/esc -> /outside`
 *           with the body `esc/api` passed every textual test and a project
 *           outside the workspace was built and deployed as
 *           `escaped-nar-1.0.0.nar`. The agents can write /repos, so they can
 *           plant the symlink.
 *
 *           **And the workspace root came with it.** `.` passed the text check
 *           and was caught one guard later only because /repos happened to hold
 *           no pom.xml. Put one there -- which any agent container can do -- and
 *           `build .` copies every clone under /repos into the work tree and
 *           builds whatever that pom says, while the refusal reports one source
 *           having taken them all. The reviewer named `.` as "accepted too" and
 *           harmless; armed with a pom it is not.
 *
 *           To be exact about what that second one is and is not: the build user
 *           may read /repos already -- B6-2 asserts it, and it must, since that
 *           is where the source comes from. So copying the clones discloses
 *           nothing it could not already read. What it does is build something
 *           nobody asked for and describe it as something else.
 * Given:    The builder image built from `config/nar_builder` in this run; a
 *           workspace holding `inside/proc`, an ordinary project, a symlink
 *           `esc` pointing at `/outside`, and a `pom.xml` at the root so the
 *           second escape is armed; stub `mvn` and `curl` written over the real
 *           binaries, because `run_maven` goes through `su` and `su` resets PATH.
 *           And, since D2, a checker that permits with an empty load index: a
 *           build with no index is refused on purpose now, so without them B6-28
 *           would measure D2 rather than this guard.
 * When:     build.sh is given `esc/api`, then `.`, then `inside/proc`.
 * Then:     The first two are refused, each naming the path it resolved to; the
 *           third builds and deploys.
 * Covers:   B6-27, B6-28, FR24, NFR7, §3.2
 * Unhappy:  B6-27's two refusals are the finding. B6-28 is the counterpart and it
 *           is what stops the repair being met by refusing every path: an
 *           ordinary directory inside the workspace still builds, and resolving
 *           the path must not break the normal case.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const IMAGE = builderImage();
const BUILD = join(repoRoot, 'config/nar_builder/build.sh');
// narcheck is mounted into the builder rather than copied into the image, so a
// throwaway container has to mount it too -- without it the deployment gate
// refuses on the checker's absence and the counterpart can never build.
const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');

const work = mkdtempSync(join(tmpdir(), 'm-b6-paths-'));
const repos = join(work, 'repos');
const outside = join(work, 'outside');
const drop = join(work, 'drop');
afterAll(() => rmSync(work, { recursive: true, force: true }));

function project(at: string): void {
  mkdirSync(join(at, 'src/main/java/p'), { recursive: true });
  mkdirSync(join(at, 'src/main/resources/META-INF/services'), { recursive: true });
  writeFileSync(join(at, 'src/main/java/p/C.java'), 'package p;\npublic class C {}\n');
  writeFileSync(
    join(at, 'src/main/resources/META-INF/services/org.apache.nifi.processor.Processor'),
    'p.C\n'
  );
}

mkdirSync(repos, { recursive: true });
mkdirSync(drop, { recursive: true });
project(join(outside, 'api'));
project(join(repos, 'inside', 'proc'));
// The symlink leads out of the workspace, at the path the container will see.
symlinkSync('/outside', join(repos, 'esc'));
// And the root is armed, so `.` is the second escape rather than a harmless one.
writeFileSync(
  join(repos, 'pom.xml'),
  '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId>' +
    '<artifactId>escaped</artifactId><version>1.0.0</version></project>\n'
);

// Plain string literals, not a template literal.
const PROBE =
  [
    "set -u",
    "mkdir -p /liquid/api",
    "printf \"nifi_version=2.11.0\\njava_version=21.0.1\\n\" > /liquid/api/runtime",
    "# Stubs over the real binaries: run_maven goes through su, which resets PATH.",
    "printf \"#!/bin/sh\\nexit 0\\n\" > \"$(command -v curl)\"; chmod 755 \"$(command -v curl)\"",
    "cat > \"$(command -v mvn)\" <<\"MVN\"",
    "#!/bin/sh",
    "case \" $* \" in *\" dependency:list \"*) echo \"[INFO]    org.apache.nifi:nifi-api:jar:2.10.0:compile\"; exit 0;; esac",
    "proj=\"\"",
    "for a in \"$@\"; do case \"$a\" in */pom.xml) proj=\"$(dirname \"$a\")\";; esac; done",
    "mkdir -p \"${proj}/target\"",
    "python3 -c \"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('notes.txt','probe'); z.close()\" \"${proj}/target/made-1.0.0.nar\"",
    "exit 0",
    "MVN",
    "chmod 755 \"$(command -v mvn)\"",
    "# The load index. D2 made a build without one a refusal rather than an",
    "# unchecked deployment, so the counterpart needs it to reach the load path at",
    "# all: without it this case measures D2 instead of the path guard.",
    "printf \"org/apache/nifi/processor/Processor\\n\" > /liquid/api/lib-classes.txt",
    "printf \"org/apache/nifi/processor\\n\" > /liquid/api/api-packages.txt",
    ": > /liquid/api/nar-classes.txt",
    ": > /liquid/api/nar-parents.txt",
    "ask() { sh /probe/build.sh build \"$1\" > /tmp/o 2>&1; printf \"%s-exit=%s\\n\" \"$2\" \"$?\"; sed -n \"1,2p\" /tmp/o | sed \"s/^/$2-said: /\"; }",
    "ask esc/api symlink",
    "ask . root",
    "ask inside/proc ordinary",
    "printf \"drop=[%s]\\n\" \"$(ls -A /deploy/nar_extensions | tr \"\\n\" \" \")\"",
  ].join('\n') + '\n';

let out = '';
beforeAll(() => {
  const script = join(work, 'probe.sh');
  writeFileSync(script, PROBE, { mode: 0o755 });
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '-v', `${repos}:/repos:ro`,
    '-v', `${outside}:/outside:ro`,
    '-v', `${drop}:/deploy/nar_extensions`,
    '-v', `${script}:/probe.sh:ro`,
    '-v', `${NARCHECK}:/opt/builder/narcheck.py:ro`,
    '--entrypoint', 'sh', IMAGE, '/probe.sh'
  ]);
  out = r.output;
  if (!out.includes('drop=[')) {
    throw new Error(`the path probe did not finish (exit ${r.code}):\n${out}`);
  }
}, 900_000);

const field = (name) => (out.match(new RegExp(`${name}=([^\\n]*)`)) ?? [, ''])[1];
const said = (name) => (out.match(new RegExp(`${name}-said: ([^\\n]*)`)) ?? [, ''])[1];

describe('B6-27 a path that leaves the workspace is refused', () => {
  test('B6-27 a symlink out of /repos is refused, and the refusal names where it led', () => {
    // Before: exit 0, `wrote /deploy/nar_extensions/escaped-nar-1.0.0.nar`.
    expect(field('symlink-exit')).not.toBe('0');
    expect(said('symlink')).toContain('/outside/api');
  });

  test('B6-27 and the workspace root is refused too', () => {
    // Armed with a pom at the root, this built every clone under /repos as one
    // project and called it one source.
    expect(field('root-exit')).not.toBe('0');
    expect(said('root')).toContain('/repos');
  });
});

describe('B6-28 the counterpart: an ordinary directory still builds', () => {
  test('B6-28 a project inside the workspace is built and deployed', () => {
    // Without this the repair is met by refusing every path, which is the
    // failure the documents call worse than no check.
    expect(field('ordinary-exit')).toBe('0');
    expect(field('drop')).toContain('.nar');
  });
});
