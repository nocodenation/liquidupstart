/**
 * M-B4 · Integration · The mismatched NAR is refused and named, the good one
 *                      still deploys · NEGATIVE and its counterpart
 *
 * Purpose:  FR36 at the place it acts. On 2026-09-09 a NAR built against
 *           nifi-api 2.11.0 and referencing a class the loaded 2.10.0 jar does
 *           not carry was copied into lib/, catalogued, and failed only when an
 *           operator tried to add it -- a 500 shown as "Your session has
 *           expired". The refusal has to happen where the operator can act on
 *           it, which is the deployment. B4-5 is in the same run and not beside
 *           it by accident: a guard that refuses everything passes B4-4
 *           perfectly, so the two NARs go into one directory and one pass over
 *           it decides both.
 * Given:    Two bundles nar-build compiled, and the lib/ of the running Liquid.
 *           probe-mismatch-1.0.0.nar carries its own pom.xml naming nifi-api
 *           2.11.0 at provided scope and a MismatchProcessor that returns
 *           NodeConnectionState.CONNECTED and logs it from onTrigger -- the
 *           fixture §4 builds, and org/apache/nifi/controller/NodeConnectionState
 *           is the one class present in 2.11.0 and absent from the 2.10.0 jar
 *           Liquid loads. b3-hand-nar-1.0.0.nar is the B1-5 fixture, plain
 *           source with no pom, so nar-build resolves the API the distribution
 *           actually provides. Both are placed in the drop directory of a
 *           sandbox whose lib/ holds the sixteen jars taken out of the running
 *           liquid container, and scripts/start.sh stands in for the launcher
 *           and records what lib/ held when it ran.
 * When:     config/liquid/entrypoint.sh is executed against that sandbox.
 * Then:     b3-hand reaches lib/ and probe-mismatch does not; the message names
 *           the file, names org.apache.nifi.controller.NodeConnectionState and
 *           the directory that does not provide it, and gives the next step,
 *           which is nar-build --target; the refused file is still in the drop
 *           directory, because it is the operator's; and Liquid is launched
 *           anyway with the good NAR already in lib/, which is the decision
 *           B2-6 took for a failed copy and this milestone keeps.
 * Covers:   B4-4, B4-5, FR36, FR30, FR31, U10
 * Unhappy:  B4-4 is the negative half and B4-5 the positive one, in one run.
 */
import { test, expect, afterAll } from 'bun:test';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, runEntrypoint, libContents, launchSaw, discard } from '../lib/entrypointfixture';
import {
  buildNar,
  stageLib,
  stagedJars,
  discardScratch,
  requireBuilt,
  pom,
  MISMATCH_SOURCE,
  MISSING_CLASS
} from '../lib/narcheckfixture';
import { PROBE_SOURCE } from '../lib/narfixture';
import type { Result } from '../lib/shell';

const BAD_NAR = 'probe-mismatch-1.0.0.nar';
const GOOD_NAR = 'b3-hand-nar-1.0.0.nar';
const DOTTED = MISSING_CLASS.replace(/\//g, '.');

const sb = sandbox();
const staged = stageLib(sb.lib);
const bad = buildNar('.b4-mismatch', 'MismatchProcessor', MISMATCH_SOURCE, BAD_NAR, pom('probe-mismatch', '2.11.0'));
const good = buildNar('.b3-hand', 'ProbeProcessor', PROBE_SOURCE, GOOD_NAR);
let run: Result;

afterAll(() => {
  discard(sb);
  discardScratch();
});

test('B4-4 the sandbox carries the lib/ of the running distribution', () => {
  expect(staged.code).toBe(0);
  expect(stagedJars(sb.lib).filter((j) => j.startsWith('nifi-api-')).length).toBe(1);
});

test('B4-4 both NARs were built, and dropped by hand into one directory', () => {
  requireBuilt(bad, good);
  copyFileSync(bad.nar, join(sb.drop, BAD_NAR));
  copyFileSync(good.nar, join(sb.drop, GOOD_NAR));
  run = runEntrypoint(sb);
  expect(run.output).toBeTruthy();
});

test('B4-4 the mismatched NAR is not in lib/', () => {
  expect(libContents(sb)).not.toContain(BAD_NAR);
});

test('B4-5 the good NAR is', () => {
  expect(libContents(sb)).toContain(GOOD_NAR);
});

test('B4-4 the message names the file, the class and the directory', () => {
  expect(run.output).toContain(BAD_NAR);
  expect(run.output).toContain(DOTTED);
  expect(run.output).toContain(sb.lib);
});

test('B4-4 the message names the next step', () => {
  expect(run.output).toContain('nar-build --target');
});

test('B4-4 the refused file stays in the drop directory', () => {
  expect(readdirSync(sb.drop).sort()).toEqual([BAD_NAR, GOOD_NAR].sort());
  expect(existsSync(join(sb.drop, BAD_NAR))).toBe(true);
});

test('B4-5 the run reports the good NAR deployed, and one of two refused', () => {
  expect(run.output).toContain(GOOD_NAR);
  expect(run.output).toContain(`1 of 2`);
});

test('B4-4 Liquid is launched anyway, with the good NAR already in lib/', () => {
  const seen = launchSaw(sb);
  expect(seen).toContain(GOOD_NAR);
  expect(seen).not.toContain(BAD_NAR);
});
