/**
 * M-A4 · Unit · The repository command reports the default branch
 *
 * Purpose:  M-A4's rules turn on the default branch: `protected` forbids pushing
 *           to it, `direct` allows it. The hook computes it from
 *           refs/remotes/origin/HEAD, but an agent about to create a feature
 *           branch cannot ask what to branch *from* — it has to infer, and
 *           inferring is what "facts are computed, conduct is taught" exists to
 *           remove. The value is read out of the clone, so it cannot be right by
 *           coincidence: a repository whose default branch is not `main` has to
 *           be reported as what it actually is.
 * Given:    Two fixture clones — `alpha` whose default branch is `main`, and
 *           `beta` whose default branch is `trunk` and which has no `main` at
 *           all — plus a manifest entry for a repository whose clone failed, so
 *           there is nothing to read the branch from.
 * When:     git-repo-info.sh is asked about each of the three.
 * Then:     alpha reports `main`, beta reports `trunk` and never `main`, and the
 *           repository that is not cloned reports no default branch field.
 * Covers:   A4-17, U3, U4, §1.2
 * Unhappy:  The third case. A command that answered `main` from habit would pass
 *           the first case and fail the other two, which is why the second
 *           fixture's branch is deliberately not the common answer.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { sh } from '../lib/shell';
import { git, commit, writeManifest, askRepoCommand, DECLARED, CLONE_FAILED } from '../lib/gitfixture';

const root = mkdtempSync(join(tmpdir(), 'lu-a4-default-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function cloneWithDefault(name: string, branch: string): string {
  const remote = join(root, `${name}.git`);
  const seed = join(root, `${name}-seed`);
  const clone = join(root, name);
  sh(['git', 'init', '-q', '--bare', `--initial-branch=${branch}`, remote], root);
  mkdirSync(seed, { recursive: true });
  sh(['git', 'init', '-q', '-b', branch, seed], root);
  git(seed, ['config', 'user.name', 'Fixture']);
  git(seed, ['config', 'user.email', 'fixture@local']);
  commit(seed, { 'README.md': `${name}\n` }, 'seed');
  git(seed, ['remote', 'add', 'origin', remote]);
  git(seed, ['push', '-q', 'origin', branch]);
  sh(['git', 'clone', '-q', remote, clone], root);
  return clone;
}

const onMain = cloneWithDefault('alpha', 'main');
const onTrunk = cloneWithDefault('beta', 'trunk');

const manifestPath = writeManifest(
  [
    { ...DECLARED, name: 'alpha', containerClone: onMain },
    { ...DECLARED, name: 'beta', containerClone: onTrunk },
    { ...CLONE_FAILED, name: 'gamma', containerClone: join(root, 'gamma') }
  ],
  'lu-a4-default-manifest-'
);

test('A4-17 the default branch is reported alongside the access and the policy', () => {
  const answer = askRepoCommand(manifestPath, ['alpha']);
  expect(answer.code).toBe(0);
  expect(answer.stdout).toMatch(/default branch\s+main/);
  expect(answer.stdout).toContain(DECLARED.access);
  expect(answer.stdout).toContain(DECLARED.policy);
});

test('A4-17 a repository whose default branch is not main is reported as it is', () => {
  const answer = askRepoCommand(manifestPath, ['beta']);
  expect(answer.code).toBe(0);
  expect(answer.stdout).toMatch(/default branch\s+trunk/);
  expect(answer.stdout).not.toContain('main');
});

test('A4-17 a repository that is not cloned claims no default branch', () => {
  const answer = askRepoCommand(manifestPath, ['gamma']);
  expect(answer.code).toBe(3);
  expect(answer.output).toMatch(/not cloned/i);
  expect(answer.output).not.toMatch(/^\s+default branch\s+\S/m);
});
