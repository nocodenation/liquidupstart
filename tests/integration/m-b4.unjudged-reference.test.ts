/**
 * M-B4 · Integration · What the check cannot see, it does not judge
 *
 * Purpose:  The floor under FR36, and the second of the two cases that decide
 *           whether this milestone is worth having. A NAR may legitimately
 *           reference org.apache.nifi classes that reach it through a parent
 *           bundle or through a jar the distribution loads elsewhere; refusing
 *           those would break working deployments to catch a case nobody has
 *           met. The check therefore has two floors, and this case asserts both
 *           rather than the one the specification named.
 * Given:    Three things, all read from the running distribution rather than
 *           described. (a) probe-web-1.0.0.nar: a WebProcessor whose onTrigger
 *           logs NiFiWebConfigurationContext.class, so
 *           org/apache/nifi/web/NiFiWebConfigurationContext is a genuine class
 *           constant and not a string; its pom.xml names nifi-api 2.10.0 and
 *           nifi-framework-api 2.11.0 at provided scope, because the class
 *           cannot be compiled against nifi-api alone. (b) The sixteen jars of
 *           the running liquid container's lib/. (c) For the package filter, the
 *           probe-mismatch-1.0.0.nar of B4-4, run a second time against a lib
 *           directory holding one jar, nifi-api-0.0.0-probe.jar, carrying the
 *           single entry org/apache/nifi/processor/AbstractProcessor.class and
 *           nothing else -- an API jar that provides org.apache.nifi.processor
 *           and does not provide org.apache.nifi.controller.
 * When:     narcheck.py check is run against each.
 * Then:     probe-web is not refused. The specification said this was the
 *           package filter at work, because org.apache.nifi.web is not a package
 *           nifi-api provides. Measured against nifi-api-2.10.0.jar that is
 *           false -- it provides four classes in that package -- so the
 *           reference is judged, and it is permitted because it resolves from
 *           nifi-framework-api-2.11.0.jar in the same lib/. The case asserts
 *           what is true: the class is absent from the API jar, the package is
 *           not, and the bundle is permitted because some jar in lib/ carries
 *           the class. The package filter is then asserted on its own, with the
 *           one bundle known to be refused: the same NAR, the same class, an API
 *           jar that does not reach into org.apache.nifi.controller, and no
 *           refusal -- against B4-4's refusal on the real lib/, which is the
 *           positive half of the same decision.
 * Covers:   B4-6, FR36
 * Unhappy:  B4-4 is the counterpart throughout: the same NAR must be refused
 *           where the reference is both judged and unresolvable.
 */
import { test, expect, afterAll } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildNar,
  classFromNar,
  referenceSet,
  guard,
  stageLib,
  apiJar,
  jarsCarrying,
  packagesOf,
  fakeApiJar,
  pom,
  scratch,
  discardScratch,
  requireBuilt,
  FRAMEWORK_API_DEPENDENCY,
  WEB_SOURCE,
  MISMATCH_SOURCE,
  WEB_CLASS,
  MISSING_CLASS
} from '../lib/narcheckfixture';

const WEB_NAR = 'probe-web-1.0.0.nar';
const BAD_NAR = 'probe-mismatch-1.0.0.nar';
const WEB_PACKAGE = WEB_CLASS.slice(0, WEB_CLASS.lastIndexOf('/'));
const CONTROLLER_PACKAGE = MISSING_CLASS.slice(0, MISSING_CLASS.lastIndexOf('/'));
const FAKE_API = 'nifi-api-0.0.0-probe.jar';
const FAKE_API_ENTRY = 'org/apache/nifi/processor/AbstractProcessor.class';

const lib = join(scratch(), 'b4-6-lib');
const narrowLib = join(scratch(), 'b4-6-narrow-lib');
mkdirSync(lib, { recursive: true });
const staged = stageLib(lib);
fakeApiJar(narrowLib, FAKE_API, [FAKE_API_ENTRY]);

const web = buildNar(
  '.b4-web',
  'WebProcessor',
  WEB_SOURCE,
  WEB_NAR,
  pom('probe-web', '2.10.0', FRAMEWORK_API_DEPENDENCY)
);
const bad = buildNar('.b4-mismatch-filter', 'MismatchProcessor', MISMATCH_SOURCE, BAD_NAR, pom('probe-mismatch', '2.11.0'));

afterAll(() => discardScratch());

test('B4-6 the fixtures built and the lib/ of the running distribution is staged', () => {
  expect(staged.code).toBe(0);
  requireBuilt(web, bad);
});

test('B4-6 the reference is a class constant, not a string', () => {
  const classFile = classFromNar(web.nar, 'org/nocodenation/probe/WebProcessor', join(scratch(), 'web-open'));
  expect(referenceSet(classFile)).toContain(WEB_CLASS);
});

test('B4-6 the class is absent from the nifi-api jar Liquid loads', () => {
  expect(packagesOf(apiJar(lib)).has(WEB_PACKAGE)).toBe(true);
  expect(jarsCarrying(lib, WEB_CLASS)).not.toContain(apiJar(lib).split('/').pop());
});

test('B4-6 the bundle is not refused on account of that reference', () => {
  const r = guard(web.nar, lib);
  expect(r.code).toBe(0);
  expect(r.output.trim()).toBe('');
});

test('B4-6 and the reason is that a jar in lib/ carries the class', () => {
  expect(jarsCarrying(lib, WEB_CLASS).length).toBeGreaterThan(0);
});

test('B4-6 a reference whose package the API jar does not provide is not judged', () => {
  expect(packagesOf(apiJar(narrowLib)).has(CONTROLLER_PACKAGE)).toBe(false);
  expect(jarsCarrying(narrowLib, MISSING_CLASS)).toEqual([]);
  const r = guard(bad.nar, narrowLib);
  expect(r.code).toBe(0);
});

test('B4-6 the same NAR against the real lib/ is refused, which is what makes that a decision', () => {
  expect(packagesOf(apiJar(lib)).has(CONTROLLER_PACKAGE)).toBe(true);
  expect(jarsCarrying(lib, MISSING_CLASS)).toEqual([]);
  const r = guard(bad.nar, lib);
  expect(r.code).toBe(1);
  expect(r.output).toContain(MISSING_CLASS.replace(/\//g, '.'));
});
