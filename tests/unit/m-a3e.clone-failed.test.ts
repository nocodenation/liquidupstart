/**
 * M-A3e · Unit **unhappy** · Declared but not cloned is its own answer
 *
 * Purpose:  A3c-7 made "declared but not cloned" a normal state — it is what the
 *           stack looks like between declaring a repository and registering its
 *           deploy key with the host. Reporting it as undeclared would send the
 *           operator to edit .env, which is already correct, instead of
 *           registering the key. The two answers must therefore differ in prose
 *           and in exit code, and the failed answer must carry the reason the
 *           manifest recorded rather than a generic apology.
 * Given:    A fixture manifest whose entry has cloned false and an error string.
 * When:     The command is asked about that repository, and about an undeclared
 *           one for comparison.
 * Then:     It reports the repository as declared but not cloned, quotes the
 *           reason, names the deploy key by path, and is distinguishable from
 *           the undeclared answer both in text and in exit code.
 * Covers:   A3e-4, U1, U2
 * Unhappy:  This is the unhappy case; A3e-1 covers the cloned counterpart.
 */
import { test, expect } from 'bun:test';
import { askRepoCommand, writeManifest, DECLARED, CLONE_FAILED } from '../lib/gitfixture';

const manifest = writeManifest([DECLARED, CLONE_FAILED]);
const answer = askRepoCommand(manifest, [CLONE_FAILED.name]);
const undeclared = askRepoCommand(manifest, ['ghost-repo']);

test('A3e-4 the repository is reported as declared, not as absent', () => {
  expect(answer.output).toMatch(/\bdeclared\b/i);
  expect(answer.output).not.toMatch(/not declared/i);
});

test('A3e-4 the answer says the clone is not there', () => {
  expect(answer.output).toMatch(/not cloned|no clone/i);
});

test('A3e-4 the answer carries the reason from the manifest', () => {
  expect(answer.output).toContain('Repository not found');
});

test('A3e-4 the answer names the deploy key to register, by path', () => {
  expect(answer.output).toContain(`${CLONE_FAILED.containerKey}.pub`);
  expect(answer.output).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
});

test('A3e-4 it is distinguishable from the undeclared answer', () => {
  expect(undeclared.output).toMatch(/not declared/i);
  expect(answer.output).not.toBe(undeclared.output);
  expect(answer.code).not.toBe(undeclared.code);
});

test('A3e-4 the access and branch policy are still reported', () => {
  expect(answer.output).toContain(CLONE_FAILED.access);
  expect(answer.output).toContain(CLONE_FAILED.policy);
});
