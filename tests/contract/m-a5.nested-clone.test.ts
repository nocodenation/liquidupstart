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
 * Given:    The project root and its ignore rules; whatever clones its
 *           volumes/repos already holds, read and never written; and two
 *           throwaway host repositories in `mkdtemp` directories, each holding one
 *           nested repository, `volumes/repos/.a5-nested-probe`, so the clean
 *           checks are never vacuous and nothing is written into the checkout.
 * When:     `git check-ignore -v volumes/repos` and `git status` at the project
 *           root; `git clean -ndx volumes/repos` in the first host, and at the
 *           project root over the clones it holds; `git clean -ffdx volumes/repos`
 *           in the second host. The assertions read git's own wording, which is
 *           translated, so sh() pins LC_ALL=C for every child process; without
 *           that this case fails on a German machine and passes on an English one,
 *           which is a property of the tester, not of the system.
 * Then:     The path is ignored by the `volumes/` rule in .gitignore, nothing under
 *           volumes/ appears in `git status`, every nested repository — the probe
 *           and each existing clone — is reported as skipped rather than as
 *           removable, a forced clean does remove the probe, and the checkout's
 *           volumes/repos lists the same top-level entries afterwards as before.
 * Covers:   A5-8; documents the boundary of U7
 * Unhappy:  The forced clean. It was left out while the only nested repository
 *           to run it on was in the operator's workspace; in a host of its own it
 *           shows the arrangement is not a guarantee without risking anything.
 *
 * `git clean -x` does not read the ignore rules, so what a dry run reports does
 *           not depend on `.gitignore`: the rule is the first scenario's subject,
 *           and the hosts need none.
 *
 * Precondition: IN_GIT_REPO -- this checkout is a git repository -- for the three
 *           scenarios that read it. A release installation at `~/.liquidupstart`
 *           is not a repository, so there they failed on the absence of `.git`
 *           rather than on anything the rule says. The clones scenario also skips
 *           where volumes/repos holds no clone, a worktree the stack never ran in,
 *           because there is nothing to read. The host scenarios need nothing of
 *           the checkout. SP-1, SP-2.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { IN_GIT_REPO } from '../lib/preconditions';
import { sh } from '../lib/shell';
import { git, commit } from '../lib/gitfixture';

const reposDir = join(repoRoot, 'volumes', 'repos');
const listing = () => (existsSync(reposDir) ? readdirSync(reposDir).sort() : []);
const clones = listing()
  .filter((name) => existsSync(join(reposDir, name, '.git')))
  .map((name) => `volumes/repos/${name}`);

function hostWithProbe(prefix: string) {
  const host = mkdtempSync(join(tmpdir(), prefix));
  sh(['git', 'init', '-q', '-b', 'main', host]);
  const probe = join(host, 'volumes', 'repos', '.a5-nested-probe');
  mkdirSync(probe, { recursive: true });
  sh(['git', 'init', '-q', '-b', 'main', probe], host);
  commit(probe, { 'README.md': 'probe\n' }, 'probe');
  return { host, probe };
}

let before: string[] = [];
let dry = { host: '', probe: '' };
let forced = { host: '', probe: '' };
beforeAll(() => {
  before = listing();
  dry = hostWithProbe('lu-a5-nested-');
  forced = hostWithProbe('lu-a5-forced-');
});
afterAll(() => {
  for (const h of [dry.host, forced.host]) if (h) rmSync(h, { recursive: true, force: true });
});

test.skipIf(!IN_GIT_REPO)('A5-8 volumes/repos is ignored, by the volumes/ rule in .gitignore', () => {
  const r = sh(['git', 'check-ignore', '-v', 'volumes/repos'], repoRoot);
  expect(r.code).toBe(0);
  expect(r.stdout).toMatch(/^\.gitignore:\d+:volumes\/\tvolumes\/repos$/m);
});

test.skipIf(!IN_GIT_REPO)('A5-8 nothing under volumes/ shows in the operator\'s status', () => {
  const r = sh(['git', 'status', '--short', '--ignored=no', '--', 'volumes'], repoRoot);
  expect(r.code).toBe(0);
  expect(r.stdout).toBe('');
});

test('A5-8 a dry-run clean skips a nested repository rather than offering to remove it', () => {
  const r = sh(['git', 'clean', '-ndx', 'volumes/repos'], dry.host);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('Would skip repository volumes/repos/.a5-nested-probe');
  expect(r.stdout).not.toContain('Would remove volumes/repos/.a5-nested-probe');
  expect(git(dry.probe, ['log', '-1', '--format=%s']).stdout.trim()).toBe('probe');
});

test.skipIf(!IN_GIT_REPO || clones.length === 0)('A5-8 and so is every clone the checkout already holds', () => {
  // `-n`: read, never written.
  const r = sh(['git', 'clean', '-ndx', 'volumes/repos'], repoRoot);
  expect(r.code).toBe(0);
  for (const path of clones) {
    expect(r.stdout).toContain(`Would skip repository ${path}`);
    expect(r.stdout).not.toContain(`Would remove ${path}`);
  }
});

test('A5-8 the negative: a forced clean does remove it, so this is an arrangement and not a guarantee', () => {
  const r = sh(['git', 'clean', '-ffdx', 'volumes/repos'], forced.host);
  expect(r.code).toBe(0);
  expect(existsSync(forced.probe)).toBe(false);
});

test('A5-8 and the case wrote nothing into the checkout it was started from', () => {
  // Against the listing taken before the hosts were made, so a leftover from
  // another run does not turn this red and a write under any name does.
  for (const h of [dry.host, forced.host]) expect(h.startsWith(`${repoRoot}/`)).toBe(false);
  expect(listing()).toEqual(before);
});
