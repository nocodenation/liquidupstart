/**
 * M-B4 · Integration · The deployment check runs where deployment happens.
 *
 * Premise: FR36 defined "refused" as *not copied into lib/*. That was never a
 * refusal. `nifi.nar.library.autoload.directory` points at the drop directory,
 * so NiFi loads whatever sits there at runtime — no restart, no lib/. Measured
 * 2026-09-09, and again on 2026-09-14 in nifi-app.log:
 *
 *   20:07:48,634  Found .../probe-good-...nar in auto-load directory
 *   20:07:53,648  Loaded NAR file: ...-unpacked
 *
 * Five seconds. So the entrypoint's check, which runs at container start, sat on
 * a path nothing takes, while the path agents do take — nar-build writing into
 * the drop directory — was unchecked.
 *
 * The check now runs at the moment of placement, between the copy and the
 * rename, while the artifact is still a dot-file the auto-loader skips. What it
 * judges against is an index of the running Liquid's lib/, written by narcheck.py
 * itself on every start: 1512 class names and 49 API packages, 75KB. Handing the
 * builder the nifi-api jar alone was tried first and is wrong — `check` resolves
 * against every jar in lib/ while judging only the API's packages, and 85 classes
 * live in an API package without being in the API jar, so a builder holding only
 * that jar would refuse bundles this Liquid loads.
 *
 * Given:    a running stack, and two bundles built through nar-build — one that
 *           links against the API Liquid loads, one that references
 *           org.apache.nifi.controller.NodeConnectionState, which it does not
 * When:     each is built by an agent the ordinary way
 * Then:     the sound one reaches the drop directory and Liquid loads it; the
 *           other never enters the drop directory at all, is kept in refused/,
 *           and the builder's verdict is the one liquid's own check would give
 * Covers:   B4-9, B4-10, B4-11, FR29, FR30, FR36
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { stackGuard } from '../lib/guard';
import {
  buildNar,
  discardScratch,
  requireBuilt,
  pom,
  MISMATCH_SOURCE,
  MISSING_CLASS
} from '../lib/narcheckfixture';
import { PROBE_SOURCE } from '../lib/narfixture';

stackGuard(['liquid', 'nar_builder']);

const DROP = join(repoRoot, 'volumes/nar_extensions');
const BAD = 'probe-placement-bad-1.0.0.nar';
// The artifact name comes from the directory when nar-build synthesises the
// pom, and from the pom when the author ships one.
const GOOD = 'b4-place-good-nar-1.0.0.nar';
const DOTTED = MISSING_CLASS.replace(/\//g, '.');

const bad = buildNar('.b4-place-bad', 'MismatchProcessor', MISMATCH_SOURCE, BAD, pom('probe-placement-bad', '2.11.0'));
const good = buildNar('.b4-place-good', 'ProbeProcessor', PROBE_SOURCE, GOOD);

afterAll(() => {
  for (const f of [join(DROP, GOOD), join(DROP, BAD), join(DROP, 'refused', BAD)]) {
    rmSync(f, { force: true });
  }
  discardScratch();
});

describe('B4-9 a bundle that cannot link never enters the drop directory', () => {
  test('nar-build refuses it, naming the bundle and the class', () => {
    requireBuilt(bad);
    expect(bad.build.code).not.toBe(0);
    expect(bad.build.output).toContain('nar-build refused');
    expect(bad.build.output).toContain(BAD);
    expect(bad.build.output).toContain(DOTTED);
  });

  test('and says where the bundle itself is, outside the load path', () => {
    // Kept, because it is the author's work and the only thing they can inspect;
    // out of the drop directory, because that directory is the load path.
    expect(bad.build.output).toContain('refused/');
    expect(bad.build.output).toContain('outside the load path');
  });

  test('and the drop directory never held it', () => {
    // Both halves on purpose. Reading the directory alone proves nothing here:
    // buildNar collects the artifact whichever place it lands in, so the file is
    // gone by now even in the version that deployed it. What discriminates is
    // nar-build saying it placed nothing -- run against the pre-fix build.sh on
    // 2026-09-14, the directory assertion passed and this one did not.
    expect(bad.build.output).toContain(`Nothing was placed in`);
    expect(readdirSync(DROP).filter((n) => n.endsWith('.nar'))).not.toContain(BAD);
  });
});

describe('B4-10 a sound bundle is deployed and loaded without a restart', () => {
  test('nar-build writes it into the drop directory', () => {
    requireBuilt(good);
    expect({ code: good.build.code, wrote: good.build.output.includes(GOOD) }).toEqual({
      code: 0,
      wrote: true
    });
  });

  test('and does not ask for a restart, because none is needed', () => {
    // The message this replaces said "Liquid loads NARs from /nar_extensions at
    // startup only. Ask the operator to restart it" -- printed to every agent,
    // and false. FR29 rested on it.
    expect(good.build.output).toContain('autoloads');
    expect(good.build.output).not.toMatch(/restart it|docker compose restart liquid/);
  });
});

describe('B4-11 the builder and Liquid reach the same verdict', () => {
  // The builder judges against an index; liquid reads lib/ directly. Two inputs,
  // one implementation -- and this is what holds them to the same answer on the
  // same bundle. A builder that is stricter than Liquid refuses work that would
  // have run, which is worse than not checking at all.
  const inLiquid = (nar: string) =>
    sh([
      'docker', 'compose', 'exec', '-T', 'liquid',
      'python3', '/opt/nifi/scripts/narcheck.py', 'check', nar, '/opt/nifi/nifi-current/lib'
    ]);

  test('the index the builder reads holds what lib/ holds', () => {
    const r = sh([
      'docker', 'compose', 'exec', '-T', 'liquid', 'python3', '-c',
      [
        'import importlib.util,os',
        's=importlib.util.spec_from_file_location("nc","/opt/nifi/scripts/narcheck.py")',
        'nc=importlib.util.module_from_spec(s); s.loader.exec_module(nc)',
        'L="/opt/nifi/nifi-current/lib"; I="/opt/nifi/nifi-current/api"',
        'r,j=nc.lib_index(L)',
        'ri=set(open(os.path.join(I,nc.CLASSES_FILE)).read().split())',
        'ji=set(open(os.path.join(I,nc.PACKAGES_FILE)).read().split())',
        'print("classes", r==ri, len(r)); print("packages", j==ji, len(j))'
      ].join('\n')
    ]);
    expect(r.output).toContain('classes true'.replace('true', 'True'));
    expect(r.output).toContain('packages true'.replace('true', 'True'));
  });

  test('and liquid refuses the same bundle the builder refused', () => {
    // Put it back where nar-build left it: buildNar collects the artifact out of
    // refused/ so the case can hold it, which empties the very directory this
    // comparison reads.
    requireBuilt(bad);
    mkdirSync(join(DROP, 'refused'), { recursive: true });
    copyFileSync(bad.nar, join(DROP, 'refused', BAD));
    const r = inLiquid(`/opt/nifi/nifi-current/nar_extensions/refused/${BAD}`);
    expect({ refused: r.output.includes('REFUSED'), names: r.output.includes(DOTTED) }).toEqual({
      refused: true,
      names: true
    });
  });
});
