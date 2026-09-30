/**
 * M-B1 · Unit · The target version is read from the running Liquid, not written down
 *
 * Purpose:  FR23 made assertable. A declared version drifts the moment the
 *           Liquid image is rebuilt, and the drift does not fail loudly: a NAR
 *           compiled against the wrong nifi-api is never loaded, the processor
 *           never appears, and nothing says why. The case asserts the shape — a
 *           NiFi version of the form 2.x.y and a Java major of 21 — and not the
 *           literal 2.11.0, because pinning the literal would fail on the next
 *           image bump for a reason that has nothing to do with this tool.
 * Given:    The running stack: Liquid, which today reports NiFi 2.11.0 on
 *           OpenJDK 21.0.12, and opencode, which carries nar-build.
 * When:     nar-build --target is run inside opencode.
 * Then:     It reports a 2.x.y NiFi version and Java major 21, names where it
 *           read them, and .env declares no such version key — so the answer
 *           cannot have come from configuration.
 * Covers:   B1-3, FR23
 * Unhappy:  B1-4 is the counterpart: the same resolution pointed at a container
 *           that does not exist refuses instead of guessing.
 */
import { test, expect } from 'bun:test';
import { stackGuard } from '../lib/guard';
import { envExampleText } from '../lib/compose-file';
import { target, targetField } from '../lib/narfixture';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const resolved = target();

test('B1-3 the resolution answers at all', () => {
  expect(resolved.code).toBe(0);
});

test('B1-3 the NiFi version has the shape of a NiFi 2 release', () => {
  expect(targetField(resolved.stdout, 'nifi_version')).toMatch(/^2\.\d+\.\d+$/);
});

test('B1-3 the Java major is the one Liquid runs on', () => {
  expect(targetField(resolved.stdout, 'java_major')).toBe('21');
  expect(targetField(resolved.stdout, 'java_version')).toMatch(/^21\./);
});

test('B1-3 it says where it read them', () => {
  expect(targetField(resolved.stdout, 'read_from')).toContain('liquid');
});

test('B1-3 nothing in the contract declares a NiFi or Java version', () => {
  const keys = envExampleText()
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1])
    .filter((k) => /NIFI|JAVA|JDK/.test(k));
  expect(keys).toEqual([]);
});
