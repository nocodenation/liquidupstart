/**
 * M-B1 · Unit · unhappy · A build that cannot read the target version stops
 *
 * Purpose:  The counterpart to B1-3, and the case that decides whether FR23 is a
 *           guarantee or a hope. Guessing produces an artifact that looks built
 *           and is never loaded, which is the silent-failure class this feature
 *           exists to refuse.
 *
 *           **Rebuilt 2026-10-07, and the reason is the point.** It used to run
 *           `nar-build` inside the opencode container with
 *           `NAR_BUILD_LIQUID_HOST=liquid-absent`, which the agent script turns
 *           into an `X-Liquid-Host` header -- and the builder honours that header
 *           only when `NAR_BUILDER_TEST_HOOKS=1`. The hook is off by default,
 *           deliberately: blocker 6 of the 2026-09-28 review made it so, because
 *           at 1 any caller past the vhost can point the version probe at a host
 *           of its choosing. So this case could pass only on an installation
 *           configured less safely than a real one, and on the operator's stack
 *           it did not pass at all -- the build succeeded against the real Liquid
 *           and left an artefact behind that the case did not expect and did not
 *           clean up.
 *
 *           A verification that costs the operator a weaker setting is a
 *           verification nobody runs, and a case nobody runs is a claim. The
 *           condition is set directly instead: `build.sh` reads
 *           `NAR_BUILD_LIQUID_HOST` itself, so a throwaway container with that
 *           variable produces exactly the same state with no hook, no server and
 *           no stack. What the old shape additionally proved -- that the agent
 *           path carries a header -- was scaffolding here rather than the
 *           subject, and the vhost is held by B5-13 and B6-21.
 * Given:    The builder image built from `config/nar_builder` in this run, a
 *           source that compiles -- `p/C.java` and an SPI descriptor naming
 *           `p.C` -- mounted read-only at /repos/probe, an empty drop directory,
 *           and the version resolution pointed at `liquid-absent`, a name no
 *           container answers to.
 * When:     build.sh builds that source.
 * Then:     Non-zero exit; the message says the target version could not be read
 *           and names what to do; no version is printed as if it had been read;
 *           and the drop directory is the listing it was before.
 * Covers:   B1-4, FR23, FR24, FR20's property
 * Unhappy:  This is the negative case. Its positive counterparts are B1-3 (the
 *           same resolution, answered) and B1-5 (the same fixture, built), both
 *           of which still run against the stack.
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

// A source that compiles, so the only thing wrong is the one thing under test.
const work = mkdtempSync(join(tmpdir(), 'm-b1-noversion-'));
const src = join(work, 'repos', 'probe');
const drop = join(work, 'nar_extensions');
mkdirSync(join(src, 'src/main/java/p'), { recursive: true });
mkdirSync(join(src, 'src/main/resources/META-INF/services'), { recursive: true });
mkdirSync(drop, { recursive: true });
writeFileSync(join(src, 'src/main/java/p/C.java'), 'package p;\npublic class C {}\n');
writeFileSync(
  join(src, 'src/main/resources/META-INF/services/org.apache.nifi.processor.Processor'),
  'p.C\n'
);

let run = { code: -1, output: '' };
let after: string[] = [];

beforeAll(() => {
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '-v', `${join(work, 'repos')}:/repos:ro`,
    '-v', `${drop}:/deploy/nar_extensions`,
    '--env', 'NAR_BUILD_LIQUID_HOST=liquid-absent',
    '--entrypoint', 'sh', IMAGE, '-c', 'sh /probe/build.sh build probe 2>&1; echo "exit=$?"'
  ]);
  const m = r.output.match(/exit=(\d+)\s*$/);
  run = { code: m ? Number(m[1]) : -1, output: r.output };
  after = readdirSync(drop).sort();
}, 900_000);

describe('B1-4 a build that cannot read the target version stops', () => {
  test('B1-4 the build refuses', () => {
    expect(run.code).not.toBe(0);
  });

  test('B1-4 it says the target version could not be read', () => {
    expect(run.output.toLowerCase()).toContain('target version');
    expect(run.output).toMatch(/could not be read|not be read/);
  });

  test('B1-4 it names what to do next', () => {
    expect(run.output).toMatch(/start\.sh|docker compose (start|restart|up)/);
  });

  test('B1-4 it never names a version it guessed', () => {
    expect(run.output).not.toMatch(/nifi_version\s+\d/);
  });

  test('B1-4 the drop directory is unchanged', () => {
    expect(after).toEqual([]);
  });
});

afterAll(() => rmSync(work, { recursive: true, force: true }));
