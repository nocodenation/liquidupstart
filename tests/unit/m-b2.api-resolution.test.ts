/**
 * M-B2 · Unit · The nifi-api version comes from the distribution, not from its number
 *
 * Purpose:  FR27, and the half of FR23 M-B1 got wrong. M-B1 read NiFi 2.11.0
 *           from the running Liquid and pinned nifi-api to 2.11.0, while the
 *           distribution ships and loads nifi-api-2.10.0.jar. Compiling against
 *           a newer API than the one that loads is the dangerous direction: it
 *           compiles cleanly and dies at runtime with NoSuchMethodError, when
 *           somebody runs the flow. Explicit means stated, not pinned — so the
 *           value is resolved through org.apache.nifi:nifi-utils at the NiFi
 *           version read, and written into the generated project.
 * Given:    The running stack. Liquid reports NiFi 2.11.0 on OpenJDK 21 today;
 *           org.apache.nifi:nifi-utils at that version resolves nifi-api 2.10.0,
 *           which is on disk in volumes/nar_builder/m2 from M-B1's own cache.
 *           The expected value is computed here by an independent Maven
 *           resolution inside nar_builder — a `dependency:list` over a probe pom
 *           depending only on nifi-utils at the NiFi version — so the assertion
 *           does not read back the number under test from the tool that produced
 *           it. The literal 2.10.0 is deliberately NOT asserted: it would fail on
 *           the next NiFi release for a reason that has nothing to do with this
 *           tool.
 * When:     nar-build --target is run inside opencode.
 * Then:     The reported nifi_api_version equals the independently resolved one;
 *           it is not simply the NiFi version copied across while the two differ;
 *           and the project the builder synthesises carries that value rather
 *           than the NiFi version — asserted against the synthesiser's own pom
 *           template, which manages nifi-api at a separate property.
 * Covers:   B2-1, FR27, FR23, U9
 * Unhappy:  B2-3 is the counterpart: a resolution that cannot answer refuses
 *           rather than falling back to the distribution's number.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import { target, targetField, resolvedApi, builderScript } from '../lib/narfixture';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const reported = target();
const nifi = targetField(reported.stdout, 'nifi_version');
const expected = nifi ? resolvedApi(nifi) : '';
const synthesiser = readFileSync(builderScript, 'utf8');

test('B2-1 the resolution answers, and nifi-utils resolves an API version', () => {
  expect(reported.code).toBe(0);
  expect(nifi).toMatch(/^2\.\d+\.\d+$/);
  expect(expected).toMatch(/^\d+\.\d+\.\d+$/);
});

test('B2-1 the reported nifi-api version is the one nifi-utils resolves', () => {
  expect(targetField(reported.stdout, 'nifi_api_version')).toBe(expected);
});

test('B2-1 it is not the NiFi version copied across, when the two differ', () => {
  if (expected === nifi) return;
  expect(targetField(reported.stdout, 'nifi_api_version')).not.toBe(nifi);
});

test('B2-1 the synthesised project manages nifi-api at its own resolved version', () => {
  expect(synthesiser).toContain('<nifi.api.version>');
  expect(synthesiser).toMatch(/<artifactId>nifi-api<\/artifactId>\s*\n\s*<version>\\?\$\{nifi\.api\.version\}/);
  expect(synthesiser).toMatch(/<artifactId>nifi-utils<\/artifactId>\s*\n\s*<version>\\?\$\{nifi\.version\}/);
});
