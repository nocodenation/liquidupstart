/**
 * B6-46 · Integration · A fault of the installation is not a refusal
 *
 * Purpose:  `B6-45` took "cannot be judged" off status 2. Two more arms of
 *           `build_command` returned 2, the refusal's status, though neither is
 *           about the bundle: the refusal of a builder whose drop directory the
 *           build user could write, and a bundle that was built and could not be
 *           written to the drop directory. The server answers 2 with 422, "your
 *           bundle is unprocessable". Since 2026-10-22 both return 1, as the
 *           third fault beside them -- a judged bundle that cannot be placed --
 *           does, and the server answers 1 with 500. Recorded on #45 on
 *           2026-10-21; no case drove either arm before this one.
 * Given:    The builder image built from this tree; `build.sh` from this
 *           checkout, run whole as root as the server runs it; a runtime record
 *           and a stub `curl`, as B2-3 has them; and a stub `mvn` written over
 *           the real one, which fails the API probe -- so the author pom goes on,
 *           as B2-11 shows -- and then builds a bundle or fails, as
 *           `/tmp/mvn-mode` says.
 * When:     `/repos/authored` is built four times: with the drop directory
 *           opened to the build user; with it closed and the build failing; with
 *           a bundle built and a drop directory that takes the file and then runs
 *           out of room; and with a writable one.
 * Then:     The open directory: status 1, the misconfiguration named, and the
 *           build never reaching Maven -- the API probe before the guard runs
 *           the stub silently, so only the build's Maven would print. The closed one: Maven runs and its failure is still a refusal, 2.
 *           The full one: status 1, and nothing left in it, the partial copy
 *           included. The writable one:
 *           the bundle written and taken to the check, which judges nothing
 *           here -- the checker is bind-mounted in the stack and is not in the
 *           image -- so 5.
 * Covers:   B6-46, FR36a as amended 2026-10-22, FR31, FR25's containment guard
 * Negative: the two 1s are the cases. Their counterparts keep them from passing
 *           on a builder that refuses everything as misconfigured, or on a build
 *           that never writes anything.
 *
 * Test data: the source `/repos/authored` -- `src/main/java/p/C.java` holding
 * `package p;` / `public class C {}`, the service descriptor holding `p.C`, and a
 * `pom.xml` holding `this is not xml`. That is B2-11's, deliberately not XML, so
 * a real Maven that ran in place of the stub would stop at the pom and build
 * nothing. The runtime record holds `nifi_version=2.11.0` and
 * `java_version=21.0.12+10-LTS`; the probe version is `99.99.99`. The stub's
 * bundle is `target/probe-nar-1.0.0.nar` holding 1 MiB of zeros, more than a page; the full drop directory is a tmpfs of 4096 bytes with mode
 * 0755, so the build user cannot write it and `cp` stops with `No space left on
 * device` after writing a partial `.part` of one page; and its lines are
 * `stub mvn: built probe-nar-1.0.0.nar` and `stub mvn: build failed`. Only the
 * second is seen: `build.sh` shows Maven's log when the build fails, so a bundle
 * that was built is read from `build.sh`'s own words about it.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const IMAGE = builderImage();
const BUILD = join(repoRoot, 'config/nar_builder/build.sh');

const work = mkdtempSync(join(tmpdir(), 'm-b6-installation-faults-'));
const src = join(work, 'repos', 'authored');
mkdirSync(join(src, 'src/main/java/p'), { recursive: true });
mkdirSync(join(src, 'src/main/resources/META-INF/services'), { recursive: true });
writeFileSync(join(src, 'src/main/java/p/C.java'), 'package p;\npublic class C {}\n');
writeFileSync(join(src, 'src/main/resources/META-INF/services/org.apache.nifi.processor.Processor'), 'p.C\n');
writeFileSync(join(src, 'pom.xml'), 'this is not xml\n');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const STUB_MVN = [
  '#!/bin/sh',
  'case " $* " in *" dependency:list "*) exit 1 ;; esac',
  'pom=""',
  'while [ $# -gt 0 ]; do [ "$1" = -f ] && pom="$2"; shift; done',
  'm="$(cat /tmp/mvn-mode)"',
  'if [ "$m" = fail ]; then echo "stub mvn: build failed"; exit 1; fi',
  'mkdir -p "$(dirname "$pom")/target"',
  'head -c 1048576 /dev/zero > "$(dirname "$pom")/target/probe-nar-1.0.0.nar"',
  'echo "stub mvn: built probe-nar-1.0.0.nar"'
].join('\n') + '\n';

// Plain string literals, not a template literal.
const PROBE =
  [
    'set -u',
    'mode="$1"; open="$2"',
    'mkdir -p /liquid/api /liquid/logs',
    'printf "nifi_version=2.11.0\\njava_version=21.0.12+10-LTS\\n" > /liquid/api/runtime',
    '# Over the real ones, because run_maven goes through su and su resets PATH.',
    'printf "#!/bin/sh\\nexit 0\\n" > "$(command -v curl)"',
    'chmod 755 "$(command -v curl)"',
    'cp /probe/mvn "$(command -v mvn)"',
    'chmod 755 "$(command -v mvn)"',
    'printf "%s\\n" "$mode" > /tmp/mvn-mode',
    'chmod 644 /tmp/mvn-mode',
    'if [ "$open" = open ]; then chmod 755 /deploy && chmod 777 /deploy/nar_extensions; fi',
    'sh /probe/build.sh build authored 2>&1',
    'echo "exit=$?"',
    'echo "drop=$(ls -A /deploy/nar_extensions | tr \'\\n\' \' \')"'
  ].join('\n') + '\n';

type Run = { code: number; output: string; drop: string };

function build(mode: 'big' | 'fail', open: boolean, mount?: { dir: string } | 'full'): Run {
  const script = join(work, 'probe.sh');
  const mvn = join(work, 'mvn');
  writeFileSync(script, PROBE, { mode: 0o755 });
  writeFileSync(mvn, STUB_MVN, { mode: 0o755 });
  const argv = [
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '-v', `${mvn}:/probe/mvn:ro`,
    '-v', `${join(work, 'repos')}:/repos:ro`,
    '-v', `${script}:/probe.sh:ro`
  ];
  if (mount === 'full') argv.push('--mount', 'type=tmpfs,destination=/deploy/nar_extensions,tmpfs-size=4096,tmpfs-mode=0755');
  else if (mount) argv.push('-v', `${mount.dir}:/deploy/nar_extensions`);
  argv.push('--env', 'NAR_BUILD_API_PROBE_VERSION=99.99.99', '--entrypoint', 'sh', IMAGE, '/probe.sh', mode, open ? 'open' : 'closed');
  const r = sh(argv);
  return {
    code: Number(r.output.match(/^exit=(\d+)$/m)?.[1] ?? -1),
    output: r.output,
    drop: r.output.match(/^drop=(.*)$/m)?.[1].trim() ?? '<not reached>'
  };
}

const writable = join(work, 'drop-rw');
mkdirSync(writable);

let opened: Run, closed: Run, full: Run, written: Run;

beforeAll(() => {
  opened = build('fail', true);
  closed = build('fail', false);
  full = build('big', false, 'full');
  written = build('big', false, { dir: writable });
}, 900_000);

describe('B6-46 a drop directory the build user can write is a fault of the installation', () => {
  test('B6-46 the negative: status 1, not the refusal\'s 2, and the build never reaches Maven', () => {
    expect({
      code: opened.code,
      named: opened.output.includes('this builder is misconfigured'),
      maven: opened.output.includes('stub mvn:'),
      drop: opened.drop
    }).toEqual({ code: 1, named: true, maven: false, drop: '' });
  });

  test('B6-46 while closed, the same build reaches Maven, and its failure is still a refusal', () => {
    expect({
      code: closed.code,
      misconfigured: closed.output.includes('this builder is misconfigured'),
      maven: closed.output.includes('stub mvn: build failed'),
      refused: closed.output.includes('the build of /repos/authored failed')
    }).toEqual({ code: 2, misconfigured: false, maven: true, refused: true });
  });
});

describe('B6-46 a built bundle the drop directory cannot hold is a fault of the installation', () => {
  test('B6-46 the negative: status 1, and nothing is left in the directory, the partial copy included', () => {
    expect({
      code: full.code,
      named: full.output.includes('the build of /repos/authored succeeded but probe-nar-1.0.0.nar could not be'),
      full: full.output.includes('No space left on device'),
      left: full.drop
    }).toEqual({ code: 1, named: true, full: true, left: '' });
  });

  test('B6-46 while a writable one takes it, and the run goes on to the check', () => {
    // The checker is not in the image, so nothing judges it: 5, B6-45's status.
    expect({
      code: written.code,
      checked: written.output.includes('probe-nar-1.0.0.nar was built but cannot be judged'),
      unwritten: written.output.includes('could not be\nwritten'),
      left: readdirSync(writable)
    }).toEqual({ code: 5, checked: true, unwritten: false, left: [] });
  });
});
