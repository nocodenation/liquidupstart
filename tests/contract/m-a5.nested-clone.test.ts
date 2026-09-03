/**
 * M-A5 · Contract · The nested-clone arrangement is recorded, not guaranteed against
 *
 * Purpose:  volumes/repos/liquidupstart will be a clone of the repository it
 *           sits inside. It is git-ignored, so it never appears in the
 *           operator's status, and a dry-run clean reports "Would skip
 *           repository" — git declines to remove nested repositories unless
 *           forced. That is safe, and safe by accident rather than by design.
 *           This asserts the arrangement, as A1-10 does for confinement, so a
 *           later reader does not mistake the absence of an incident for a
 *           guarantee. It is not a guarantee: `git clean -ffdx` would remove
 *           the clone, no requirement forbids that, and nothing here prevents it.
 * Given:    The project root and its ignore rules, whatever volumes/repos holds,
 *           plus a nested repository `.a5-nested-probe` created under it for
 *           the duration of the test so the clean check is never vacuous.
 * When:     `git check-ignore -v volumes/repos` and `git clean -ndx volumes/repos`
 *           run at the project root. Both assertions read git's own wording,
 *           which is translated, so sh() pins LC_ALL=C for every child process;
 *           without that this case fails on a German machine and passes on an
 *           English one, which is a property of the tester, not of the system.
 * Then:     The path is ignored by the `volumes/` rule in .gitignore, every
 *           nested repository — the probe and each existing clone — is reported
 *           as skipped rather than as removable, and nothing under volumes/
 *           appears in `git status`.
 * Covers:   A5-8; documents the boundary of U7
 * Unhappy:  None. The counterpart — that a forced clean does remove it — is
 *           deliberately not run, because running it against the operator's
 *           workspace would be the incident this test exists to describe.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { git, commit } from '../lib/gitfixture';

const reposDir = join(repoRoot, 'volumes', 'repos');
const probe = join(reposDir, '.a5-nested-probe');
const rel = (p: string) => p.slice(repoRoot.length + 1);

beforeAll(() => {
  rmSync(probe, { recursive: true, force: true });
  mkdirSync(probe, { recursive: true });
  sh(['git', 'init', '-q', '-b', 'main', probe], reposDir);
  commit(probe, { 'README.md': 'probe\n' }, 'probe');
});
afterAll(() => rmSync(probe, { recursive: true, force: true }));

const nested = () =>
  readdirSync(reposDir)
    .filter((name) => existsSync(join(reposDir, name, '.git')))
    .map((name) => rel(join(reposDir, name)));

test('A5-8 volumes/repos is ignored, by the volumes/ rule in .gitignore', () => {
  const r = sh(['git', 'check-ignore', '-v', 'volumes/repos'], repoRoot);
  expect(r.code).toBe(0);
  expect(r.stdout).toMatch(/^\.gitignore:\d+:volumes\/\tvolumes\/repos$/m);
});

test('A5-8 nothing under volumes/ shows in the operator\'s status', () => {
  const r = sh(['git', 'status', '--short', '--ignored=no', '--', 'volumes'], repoRoot);
  expect(r.code).toBe(0);
  expect(r.stdout).toBe('');
});

test('A5-8 a dry-run clean skips every nested repository rather than offering to remove it', () => {
  const r = sh(['git', 'clean', '-ndx', 'volumes/repos'], repoRoot);
  expect(r.code).toBe(0);
  const repos = nested();
  expect(repos).toContain(rel(probe));
  for (const path of repos) {
    expect(r.stdout).toContain(`Would skip repository ${path}`);
    expect(r.stdout).not.toContain(`Would remove ${path}`);
  }
  expect(git(probe, ['log', '-1', '--format=%s']).stdout.trim()).toBe('probe');
});
