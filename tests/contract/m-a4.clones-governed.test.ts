/**
 * M-A4 · Contract · Every clone in the workspace still points at the hook
 *
 * Purpose:  §3.1 accepts that an agent running as root can delete the hook,
 *           redirect core.hooksPath or change the remote, and that none of it
 *           leaves a trace. A4-15 asks once, by observation, whether an agent
 *           does. This asks the state on every suite run, which closes the gap
 *           between runs. It cannot close the gap during one — an agent that
 *           removed the hook, pushed and put it back would pass — and that is
 *           not a reason to omit it: most ways a guardrail stops working are
 *           careless rather than deliberate, and those this catches.
 * Given:    Whatever volumes/repos holds. At the time of writing that is
 *           agent-skills, cloned by the start script, and csv-columns, left in
 *           place by the A2-5 observation — so the check is exercised against a
 *           clone this feature did not create.
 * When:     Each clone's core.hooksPath is read, and the shared hook is stat-ed.
 * Then:     All name /git-secrets/hooks, and the pre-push file there exists and
 *           is executable.
 * Covers:   A4-16, U4, §3.1
 * Unhappy:  A clone that has lost the pointer is named in the failure, rather
 *           than the run passing because the other clones are fine.
 *
 * Precondition: STARTED -- a start has run in this checkout. Skipped where it does not,
 *           because `config/scripts/start/git.sh` is the only thing that creates
 *           `volumes/_git-secrets`, so its presence is the question. Measured 2026-10-08: the
 *           whole default tier from a feature worktree gave 9 failures and 1
 *           error, every one of them a case of this kind, and the release
 *           installation gave the same count for the opposite reason. Neither
 *           place satisfies the whole suite, so the precondition is a value
 *           asked for rather than a directory prescribed. SP-1, SP-2.
 */
import { test, expect } from 'bun:test';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { STARTED } from '../lib/preconditions';
import { git, HOOKS_MOUNT } from '../lib/gitfixture';

const reposDir = join(repoRoot, 'volumes', 'repos');
const hook = join(repoRoot, 'volumes', '_git-secrets', 'hooks', 'pre-push');

const clones = existsSync(reposDir)
  ? readdirSync(reposDir).filter((name) => existsSync(join(reposDir, name, '.git')))
  : [];

test.skipIf(!STARTED)('A4-16 the shared hook is present and executable', () => {
  expect(existsSync(hook)).toBe(true);
  expect(statSync(hook).mode & 0o111).not.toBe(0);
});

test('A4-16 every clone in the workspace still points at it', () => {
  const astray = clones
    .map((name) => ({
      name,
      hooksPath: git(join(reposDir, name), ['config', '--get', 'core.hooksPath']).stdout.trim()
    }))
    .filter((c) => c.hooksPath !== HOOKS_MOUNT)
    .map((c) => `${c.name} points at "${c.hooksPath || '(nothing)'}"`);
  expect(astray).toEqual([]);
});
