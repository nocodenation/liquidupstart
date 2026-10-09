/**
 * M-B6 · Integration · Two builds at once, a hand drop, and a stray fixture
 *
 * Purpose:  B2, S5 and M9 of the 2026-10-01 review -- one change to one block in
 *           `config/nar_builder/build.sh`, because they are three symptoms of the
 *           same code.
 *
 *           **B2.** The build snapshotted the drop directory around the Maven run
 *           and deleted whatever had appeared, on the reasoning that only the
 *           author's pom could have put it there. Measured by the reviewer and
 *           reproduced here: two builds, A sleeping 1s and B sleeping 5s, came
 *           back `A exit 0` and `B exit 2` with the refusal naming A's bundle,
 *           "Those entries have been removed", and an empty drop directory. Two
 *           wrong answers and nothing deployed. An operator's hand drop made
 *           during any build went the same way, and a `refused/` created for the
 *           first time during one took the whole quarantine with it, because the
 *           removal was `rm -rf` on a name that happened to be a directory.
 *           `for name in $intruders` was unquoted as well, so a bundle whose name
 *           held a space survived while two unrelated entries were deleted.
 *
 *           **The snapshot is gone rather than corrected.** Since 2026-10-05 the
 *           build user cannot reach the drop directory at all, so everything that
 *           appears during the window belongs to somebody else -- a concurrent
 *           build, the operator, or the liquid container writing `refused/` --
 *           and there is no reading of it under which deleting is right. What
 *           stands in its place is `drop_is_closed`, which asks whether the
 *           containment holds and refuses the build when it does not. B6-5 holds
 *           that; these cases hold what the removal cost.
 *
 *           **S5.** The failure branch promised "nothing was written to
 *           /nar_extensions" -- a claim about the directory that the script could
 *           not make, since the comparison ran only after Maven succeeded. It now
 *           says what it knows: this build deployed nothing.
 *
 *           **M9.** `find … -name '-.nar' with a '/target/' path filter` counted a fixture
 *           at `target/test-classes/fixture.nar`, so an ordinary project with a
 *           test resource was refused for "producing 2 NAR files". A build
 *           artefact sits directly in a `target/` -- nifi-nar-maven-plugin writes
 *           `<build.directory>/<finalName>.nar` -- and anything nested
 *           deeper is something Maven copied.
 * Given:    The builder image built from `config/nar_builder` in this run and
 *           tagged per run, a drop directory mounted **777** as
 *           `config/scripts/start/liquid.sh:85` makes it, a stub `mvn` that
 *           writes the files each scenario names and sleeps when asked, a stub
 *           `curl`, and `/liquid/api/runtime` holding `nifi_version=2.6.0` and
 *           `java_version=21.0.5`. Each source carries its own `pom.xml`, so the
 *           Java and service-descriptor guards do not apply and the subject is
 *           the deploy step.
 *
 *           Since D2 the probe also supplies a checker that permits and an empty
 *           `/liquid/api/lib-classes.txt`. A build that cannot be judged is refused
 *           now rather than deployed with a warning, and in a throwaway container
 *           neither the mounted checker nor Liquid's index is there -- so without
 *           them every build here would measure D2 instead of this file's subject.
 *           B6-29 and B6-30 are where the gate itself is measured, with the real
 *           checker.
 * When:     Two builds overlap; a hand drop and a first-time quarantine arrive
 *           during a build; a build produces a bundle plus a test fixture; a
 *           build produces two genuine module bundles; a build fails.
 * Then:     Both builds succeed and both bundles are deployed; the hand drop and
 *           the quarantine survive; the fixture is ignored; two genuine bundles
 *           are still refused; and the failure says only what it knows.
 * Covers:   B6-6, B6-7, B6-8, B6-9, FR24, FR30, U10
 * Unhappy:  B6-9's second half is the counterpart that keeps M9 honest -- two
 *           bundles that really are both build artefacts are still refused,
 *           because "deploy the first one in directory order" is a coin toss the
 *           author never sees. Without it M9 could be met by deploying anything.
 *
 * One container run answers all five, because each scenario is a pair of
 * build.sh invocations and the image build is the expensive part.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const RUN = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const IMAGE = `liquidupstart/nar-builder:b6c-${RUN}`;

const work = mkdtempSync(join(tmpdir(), 'm-b6-concurrent-'));
const drop = join(work, 'nar_extensions');
const cache = join(work, 'm2');
mkdirSync(drop, { recursive: true });
mkdirSync(cache, { recursive: true });
chmodSync(drop, 0o777);

// Plain string literals rather than a template literal: `${…}` in one is a
// substitution, and escaping it as `\${…}` writes a backslash into the file.
// The handover records that trap four times now, twice on 2026-10-05 alone.
const PROBE =
  [
    "#!/bin/sh",
    "set -u",
    "DROP=/deploy/nar_extensions",
    "mkdir -p /liquid/api /liquid/logs /repos",
    "printf \"nifi_version=2.6.0\\njava_version=21.0.5\\n\" > /liquid/api/runtime",
    "# The deployment gate, stood down on purpose.",
    "#",
    "# Since D2 build.sh refuses with 2 when it cannot judge a bundle, instead of",
    "# deploying it with a warning. The gate runs when /opt/builder/narcheck.py and",
    "# the load index are both present -- in the stack narcheck is mounted from",
    "# config/liquid/narcheck.py (compose.yml) and Liquid writes the index on every",
    "# start, and in a throwaway container neither is there. This case is about",
    "# project shapes, not about narcheck, so it supplies a checker that permits and",
    "# an empty index rather than the real pair: an EMPTY file, because build.sh runs",
    "# the checker as `python3 narcheck.py`, under which an empty file exits 0.",
    "# B6-29 and B6-30 are where the real gate is measured, with the real checker.",
    ": > /opt/builder/narcheck.py",
    ": > /liquid/api/lib-classes.txt",
    "# The stubs are written OVER the real binaries rather than put first on PATH:",
    "# run_maven goes through `su`, and `su` resets PATH to the system default even",
    "# without `-`, so a stub in /stub was never found and the real Maven ran.",
    "MVN=\"$(command -v mvn)\"",
    "CURL=\"$(command -v curl)\"",
    "printf \"#!/bin/sh\\nexit 0\\n\" > \"$CURL\" && chmod 755 \"$CURL\"",
    "cat > \"$MVN\" <<\"MVN\"",
    "#!/bin/sh",
    "# dependency:list is the api-version probe; package is the build.",
    "case \" $* \" in",
    "  *\" dependency:list \"*)",
    "    echo \"[INFO]    org.apache.nifi:nifi-api:jar:2.6.0:compile\"",
    "    exit 0 ;;",
    "esac",
    "proj=\"\"",
    "for a in \"$@\"; do case \"$a\" in */pom.xml) proj=\"$(dirname \"$a\")\";; esac; done",
    "[ -n \"${MVN_SLEEP:-}\" ] && sleep \"$MVN_SLEEP\"",
    "[ \"${MVN_FAIL:-0}\" = 1 ] && exit 1",
    "for f in ${MVN_MAKES:-}; do mkdir -p \"$(dirname \"${proj}/${f}\")\"; printf \"built\\n\" > \"${proj}/${f}\"; done",
    "exit 0",
    "MVN",
    "chmod 755 \"$MVN\"",
    "# The build user has to be able to run the stubs too.",
    "chmod 755 \"$MVN\" \"$CURL\"",
    "mkpom() { mkdir -p \"/repos/$1\"; printf \"<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>%s</artifactId><version>1.0.0</version></project>\\n\" \"$1\" > \"/repos/$1/pom.xml\"; }",
    "# A submodule needs a pom of its own, because that is the only way Maven can",
    "# put an artefact in its target/ -- and since S7a the builder counts a bundle",
    "# only in a target/ beside a pom.xml.",
    "mksub() { mkdir -p \"/repos/$1/$2\"; printf \"<project><modelVersion>4.0.0</modelVersion><parent><groupId>g</groupId><artifactId>%s</artifactId><version>1.0.0</version></parent><artifactId>%s</artifactId></project>\\n\" \"$1\" \"$2\" > \"/repos/$1/$2/pom.xml\"; }",
    "reset_drop() { rm -rf \"${DROP:?}\"/* 2>/dev/null; mkdir -p \"$DROP\"; }",
    "drop_list() { ls -A \"$DROP\" 2>/dev/null | sort | tr \"\\n\" \" \"; }",
    "",
    "echo \"=== 1: two concurrent builds ===\"",
    "reset_drop; mkpom alpha; mkpom beta",
    "MVN_SLEEP=1 MVN_MAKES=\"target/alpha-1.0.0.nar\" sh /opt/builder/build.sh build alpha >/tmp/a.log 2>&1 &",
    "pid_a=$!",
    "sleep 1",
    "MVN_SLEEP=3 MVN_MAKES=\"target/beta-1.0.0.nar\" sh /opt/builder/build.sh build beta >/tmp/b.log 2>&1 &",
    "pid_b=$!",
    "wait $pid_a; echo \"one-exit=$?\"",
    "wait $pid_b; echo \"two-exit=$?\"",
    "echo \"one-two-drop=[$(drop_list)]\"",
    "",
    "echo \"=== 2: a hand drop and a first-time quarantine during a build ===\"",
    "reset_drop; mkpom gamma",
    "MVN_SLEEP=4 MVN_MAKES=\"target/gamma-1.0.0.nar\" sh /opt/builder/build.sh build gamma >/tmp/c.log 2>&1 &",
    "pid_c=$!",
    "sleep 2",
    "printf \"by hand\\n\" > \"${DROP}/hand-1.0.0.nar\"",
    "mkdir -p \"${DROP}/refused\" && printf \"earlier\\n\" > \"${DROP}/refused/earlier-2.0.0.nar\"",
    "wait $pid_c; echo \"three-exit=$?\"",
    "echo \"three-drop=[$(drop_list)]\"",
    "echo \"three-hand=$([ -f \"${DROP}/hand-1.0.0.nar\" ] && echo kept || echo GONE)\"",
    "echo \"three-quarantine=$([ -f \"${DROP}/refused/earlier-2.0.0.nar\" ] && echo kept || echo GONE)\"",
    "",
    "echo \"=== 3: a stray .nar under target/test-classes ===\"",
    "reset_drop; mkpom delta; mksub delta processors",
    "MVN_MAKES=\"target/delta-1.0.0.nar processors/target/test-classes/fixture.nar\" sh /opt/builder/build.sh build delta >/tmp/d.log 2>&1",
    "echo \"four-exit=$?\"",
    "echo \"four-drop=[$(drop_list)]\"",
    "grep -q \"produced 2 NAR files\" /tmp/d.log && echo \"four-said-two=yes\" || echo \"four-said-two=no\"",
    "",
    "echo \"=== 4: the counterpart, two genuine module bundles ===\"",
    "reset_drop; mkpom epsilon; mksub epsilon one; mksub epsilon two",
    "MVN_MAKES=\"one/target/one-1.0.0.nar two/target/two-1.0.0.nar\" sh /opt/builder/build.sh build epsilon >/tmp/e.log 2>&1",
    "echo \"five-exit=$?\"",
    "grep -q \"produced 2 NAR files\" /tmp/e.log && echo \"five-said-two=yes\" || echo \"five-said-two=no\"",
    "",
    "echo \"=== 5: a build that fails says only what it knows ===\"",
    "reset_drop; mkpom zeta",
    "MVN_FAIL=1 sh /opt/builder/build.sh build zeta >/tmp/f.log 2>&1",
    "echo \"six-exit=$?\"",
    "grep -q \"failed, so nothing was written to\" /tmp/f.log && echo \"six-overclaims=yes\" || echo \"six-overclaims=no\"",
    "grep -q \"failed, so this build deployed\" /tmp/f.log && echo \"six-says-deployed-nothing=yes\" || echo \"six-says-deployed-nothing=no\"",
  ].join('\n') + '\n';

const probe = join(work, 'scenarios.sh');
writeFileSync(probe, PROBE, { mode: 0o755 });

let out = '';
beforeAll(() => {
  const built = sh(['docker', 'build', '-q', '-t', IMAGE, join(repoRoot, 'config/nar_builder')]);
  if (built.code !== 0) throw new Error(`the builder image did not build:\n${built.output}`);
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${drop}:/deploy/nar_extensions`,
    '-v', `${cache}:/m2`,
    '-v', `${probe}:/scenarios.sh:ro`,
    '--entrypoint', '/bin/sh',
    IMAGE, '/scenarios.sh'
  ]);
  out = r.output;
  if (!out.includes('six-exit=')) {
    throw new Error(`the scenarios did not run to the end (exit ${r.code}):\n${out}`);
  }
}, 900_000);

afterAll(() => {
  sh(['docker', 'rmi', '-f', IMAGE]);
  rmSync(work, { recursive: true, force: true });
});

const says = (line) => out.includes(line);
const field = (name) => (out.match(new RegExp(`${name}=([^\\n]*)`)) ?? [, ''])[1];

describe('B6-6 two builds at once do not destroy each other', () => {
  test('B6-6 both succeed', () => {
    // Measured against the unfixed block: `one-exit=0` and `two-exit=2`, the
    // second refusing over the first's bundle.
    expect({ one: field('one-exit'), two: field('two-exit') }).toEqual({ one: '0', two: '0' });
  });

  test('B6-6 and both bundles are in the load path', () => {
    const listed = field('one-two-drop');
    expect(listed).toContain('alpha-1.0.0.nar');
    expect(listed).toContain('beta-1.0.0.nar');
  });
});

describe('B6-7 what arrives during a build is not the build\u0027s to delete', () => {
  test('B6-7 an operator hand drop survives', () => {
    // It was deleted, and the build reported having written nothing.
    expect(field('three-hand')).toBe('kept');
  });

  test('B6-7 and a quarantine created during the build survives with it', () => {
    // The worst of the three: `rm -rf` on a name that was a directory took
    // `refused/` and the bundle inside it.
    expect(field('three-quarantine')).toBe('kept');
  });

  test('B6-7 and the build itself still succeeds and deploys', () => {
    // The counterpart: a build that is left alone must still work, or the
    // assertions above are met by a build that does nothing.
    expect(field('three-exit')).toBe('0');
    expect(field('three-drop')).toContain('gamma-1.0.0.nar');
  });
});

describe('B6-8 a test fixture is not a build artefact', () => {
  test('B6-8 a .nar under target/test-classes is ignored', () => {
    expect({
      exit: field('four-exit'),
      saidTwo: field('four-said-two')
    }).toEqual({ exit: '0', saidTwo: 'no' });
  });

  test('B6-8 and the real bundle is deployed', () => {
    expect(field('four-drop')).toContain('delta-1.0.0.nar');
  });
});

describe('B6-9 but two genuine bundles are still refused', () => {
  test('B6-9 the counterpart: ambiguity is still named rather than guessed', () => {
    expect({
      exit: field('five-exit'),
      saidTwo: field('five-said-two')
    }).toEqual({ exit: '2', saidTwo: 'yes' });
  });

  test('B6-9 and a failed build claims only what it knows', () => {
    // S5. The old sentence promised the drop directory was untouched, which the
    // script had not looked at.
    expect({
      exit: field('six-exit'),
      overclaims: field('six-overclaims'),
      saysDeployed: field('six-says-deployed-nothing')
    }).toEqual({ exit: '2', overclaims: 'no', saysDeployed: 'yes' });
  });
});
