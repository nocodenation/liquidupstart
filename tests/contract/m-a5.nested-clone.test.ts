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
 *
 * Precondition: IN_GIT_REPO -- this checkout is a git repository. The three A5-8
 *           scenarios ask git what it ignores and what it would clean, and a
 *           release installation at `~/.liquidupstart` is not a repository at
 *           all, so there they failed on the absence of `.git` rather than on
 *           anything the rule says. Skipped where it is not one. SP-1, SP-2.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { IN_GIT_REPO } from '../lib/preconditions';
import { sh } from '../lib/shell';
import { git, commit } from '../lib/gitfixture';
import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

// The first two cases read the operator's checkout and write nothing, which is
// what a contract-tier case may do. The third needs a **nested repository** under
// `volumes/repos` to exist, and until 2026-10-17 it made one by running
// `git init` inside whichever checkout the run was started from.
//
// That is the stack tier's privilege, and `tests/run.sh:18-23` says so in as many
// words: those levels "write into volumes/ and restart containers on this
// machine", which is why they are opt-in. This case is in the default tier. It was
// green throughout, because it created everything it asserted against -- so it
// never appeared in a failure set and nothing drew attention to it.
//
// It now builds its own repository in a temporary directory and takes the subject
// of the test with it: the project's **real `.gitignore`**, read from the
// checkout. So a change to that file still reddens the case, which is the whole
// point of it, and the checkout is only ever read.
const reposDir = join(repoRoot, 'volumes', 'repos');
let host = '';
let probe = '';
const rel = (p: string) => p.slice(host.length + 1);

beforeAll(() => {
  host = mkdtempSync(join(tmpdir(), 'lu-a5-nested-'));
  // The subject, copied rather than invented: `volumes/` is ignored by this line
  // and the case is about what git then does with a repository underneath it.
  copyFileSync(join(repoRoot, '.gitignore'), join(host, '.gitignore'));
  sh(['git', 'init', '-q', '-b', 'main', host]);
  commit(host, { 'README.md': 'host\n' }, 'host');
  probe = join(host, 'volumes', 'repos', '.a5-nested-probe');
  mkdirSync(probe, { recursive: true });
  sh(['git', 'init', '-q', '-b', 'main', probe], host);
  commit(probe, { 'README.md': 'probe\n' }, 'probe');
});
afterAll(() => rmSync(host, { recursive: true, force: true }));

const nested = () => {
  const dir = join(host, 'volumes', 'repos');
  return readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, '.git')))
    .map((name) => rel(join(dir, name)));
};

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

test('A5-8 a dry-run clean skips every nested repository rather than offering to remove it', () => {
  // No precondition any more: the repository this reads is one the case made, so
  // it no longer depends on the checkout being a git repository at all. That
  // dependency was the other half of the same defect -- the case needed the
  // operator's checkout to be something.
  const r = sh(['git', 'clean', '-ndx', 'volumes/repos'], host);
  expect(r.code).toBe(0);
  const repos = nested();
  expect(repos).toContain(rel(probe));
  for (const path of repos) {
    expect(r.stdout).toContain(`Would skip repository ${path}`);
    expect(r.stdout).not.toContain(`Would remove ${path}`);
  }
  expect(git(probe, ['log', '-1', '--format=%s']).stdout.trim()).toBe('probe');
  // And the checkout the run was started from is untouched: nothing was written
  // into its volumes/repos, which is the property this repair exists for.
  expect(existsSync(join(reposDir, '.a5-nested-probe'))).toBe(false);
});
