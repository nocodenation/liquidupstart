/**
 * M-B1 · Integration · unhappy · A source that does not compile fails with the compiler's own words
 *
 * Purpose:  The unhappy path that decides the shape of the whole tool: this
 *           message has to reach the caller, not a log file. It is why the agent
 *           calls a command rather than dropping files into a watched directory
 *           (FR22), and why a failed build must leave the drop directory alone
 *           (FR24).
 * Given:    volumes/repos/.b1-broken: the B1-5 fixture with one line added to
 *           onTrigger — int probe = "probe"; — which javac rejects as
 *           "incompatible types: String cannot be converted to int". A type
 *           error, not a syntax error, so the failure proves compilation was
 *           actually attempted rather than parsing abandoned early.
 * When:     nar-build is run against that directory inside opencode.
 * Then:     Non-zero exit; the output carries javac's own words together with
 *           the file and the line; the drop directory gains nothing.
 * Covers:   B1-7, FR22, FR24
 * Unhappy:  This is the negative case; B1-5 is the same fixture without the
 *           broken line, and it builds.
 */
import { test, expect, afterAll } from 'bun:test';
import { stackGuard } from '../lib/guard';
import { seedSource, dropFixture, narBuild, dropContents } from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b1-broken', { broken: true });
const before = dropContents();
let run: Result;
let after: string[] = [];

afterAll(() => dropFixture(fx));

test('B1-7 the build fails', () => {
  run = narBuild('opencode', fx.container);
  after = dropContents();
  expect(run.output).toBeTruthy();
  expect(run.code).not.toBe(0);
}, 1_200_000);

test("B1-7 javac's own message reaches the caller", () => {
  expect(run.output).toContain('incompatible types');
});

test('B1-7 the message names the file and the line', () => {
  expect(run.output).toContain('ProbeProcessor.java');
  expect(run.output).toMatch(/ProbeProcessor\.java:\[?\d+/);
});

test('B1-7 it names what to do next', () => {
  expect(run.output).toMatch(/nar-build|fix/i);
});

test('B1-7 the drop directory gained nothing', () => {
  expect(after).toEqual(before);
});
