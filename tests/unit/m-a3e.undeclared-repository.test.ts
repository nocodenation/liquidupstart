/**
 * M-A3e · Unit **unhappy** · An undeclared repository is named as such
 *
 * Purpose:  This is the case the milestone exists for. Before it, an agent
 *           meeting a repository the stack does not know got "could not read
 *           Username" from git and drew its own conclusion — in A3-11, the wrong
 *           one. The command has to say plainly that the repository is not
 *           declared, that no key for it exists here, and what the operator has
 *           to do, and it has to say it in the exit code as well as in prose so
 *           a script or an agent can branch without reading English.
 * Given:    The fixture manifest declaring one repository.
 * When:     The command is asked about a repository absent from it.
 * Then:     It reports the repository as undeclared, says the stack holds no key
 *           for it, names the operator action, and exits non-zero.
 * Covers:   A3e-2, U1, U5
 * Unhappy:  This is the unhappy case; A3e-1 is its positive counterpart, and
 *           A3e-4 proves a failed clone is not folded into it.
 */
import { test, expect } from 'bun:test';
import { askRepoCommand, writeManifest, DECLARED } from '../lib/gitfixture';

const manifest = writeManifest([DECLARED]);
const answer = askRepoCommand(manifest, ['ghost-repo']);

test('A3e-2 an undeclared repository is reported as not declared', () => {
  expect(answer.output).toContain('ghost-repo');
  expect(answer.output).toMatch(/not declared/i);
});

test('A3e-2 the answer says the stack holds no key for it', () => {
  expect(answer.output).toMatch(/no (deploy )?key|holds no key/i);
});

test('A3e-2 the answer names what the operator must do', () => {
  expect(answer.output).toMatch(/operator/i);
  expect(answer.output).toContain('GIT_REPOSITORIES');
  expect(answer.output).toMatch(/\.env\b/);
  expect(answer.output).toMatch(/start|restart/i);
});

test('A3e-2 the exit code is non-zero so a caller can branch on it', () => {
  expect(answer.code).not.toBe(0);
});

test('A3e-2 asking nothing is a usage error, not an answer', () => {
  const usage = askRepoCommand(manifest, []);
  expect(usage.code).not.toBe(0);
  expect(usage.output).toMatch(/usage/i);
});
