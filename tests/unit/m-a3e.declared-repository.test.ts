/**
 * M-A3e · Unit · A declared repository is answered for in one call
 *
 * Purpose:  The milestone replaces a rule an agent has to remember with a
 *           question it can ask. That only holds if one call returns everything
 *           the agent then needs: where the clone is, what it may do with it,
 *           and what the branch policy is. An answer that merely says "yes, it
 *           is declared" would leave the agent guessing again.
 * Given:    A fixture manifest in a temporary directory declaring one
 *           repository with access read, policy protected and cloned true, with
 *           the command pointed at it through GIT_REPOSITORIES_MANIFEST.
 * When:     The command is asked about that repository by its bare name.
 * Then:     It exits 0 and names the clone path, the access and the branch
 *           policy, and it names the deploy key by path only.
 * Covers:   A3e-1, U1, U5, U8
 * Unhappy:  Covered by A3e-2 (undeclared) and A3e-4 (declared, not cloned).
 */
import { test, expect } from 'bun:test';
import { askRepoCommand, writeManifest, DECLARED } from '../lib/gitfixture';

const manifest = writeManifest([DECLARED]);
const answer = askRepoCommand(manifest, [DECLARED.name]);

test('A3e-1 asking about a declared repository succeeds', () => {
  expect(answer.code).toBe(0);
});

test('A3e-1 the answer says the repository is declared', () => {
  expect(answer.stdout).toMatch(/\bdeclared\b/i);
  expect(answer.stdout).toContain(DECLARED.name);
});

test('A3e-1 the answer names the clone path inside the container', () => {
  expect(answer.stdout).toContain(DECLARED.containerClone);
});

test('A3e-1 the answer names the access and the branch policy', () => {
  expect(answer.stdout).toContain(DECLARED.access);
  expect(answer.stdout).toMatch(/branch polic/i);
  expect(answer.stdout).toContain(DECLARED.policy);
});

test('A3e-1 the answer says the clone is there', () => {
  expect(answer.stdout).toMatch(/cloned|clone is present|clone at/i);
  expect(answer.stdout).not.toMatch(/not cloned/i);
});

test('A3e-1 the key is named as a path and no key material is printed', () => {
  expect(answer.stdout).toContain(`${DECLARED.containerKey}.pub`);
  expect(answer.stdout).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  expect(answer.stdout).not.toMatch(/ssh-ed25519 AAAA/);
});
