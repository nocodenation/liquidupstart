/**
 * M-A4 · Contract · One hook file governs every clone, including one made later
 *
 * Purpose:  A hook copied into each `.git/hooks` is worth nothing in the clones
 *           it did not reach, and copies drift as soon as one of them is
 *           improved. Installation is therefore by `core.hooksPath`, pointing
 *           every clone at one shared file. The case a copy would miss entirely
 *           is a clone made after the start script ran, which is why the third
 *           clone here is made by hand afterwards: it is covered by the system
 *           git configuration the start script writes, without a further step.
 * Given:    A temporary project with two bare repositories, alpha.git and
 *           beta.git, declared as
 *           GIT_REPOSITORIES="git@localhost:alpha.git|write|protected,
 *           git@localhost:beta.git|read|protected", with M-A3c's ssh stand-in
 *           on PATH so nothing crosses the network.
 * When:     The start script runs, and a third clone of alpha.git is then made
 *           by hand.
 * Then:     All three name the same shared hook directory, and the file there
 *           exists and is executable.
 * Covers:   A4-13, **CM-6**, U7, U8, FR12
 *
 * CM-6 is the commit-message guard in the same place, added 2026-10-20. The
 *           agents in this stack push to declared GitHub repositories and write
 *           the same prose about pull requests that closed one from a `main`
 *           commit on 2026-10-16, and `FEATURE-commit-message-guard.md` neither
 *           covered them nor named them as uncovered -- A3 of the first review
 *           of #35. It is one `install` line beside `pre-push`, because
 *           `core.hooksPath` already points every agent clone here, so the case
 *           is the same case: the file is in the shared directory, it is
 *           executable, and it refuses what it exists to refuse.
 * Unhappy:  A clone that names something else, or names the directory while no
 *           executable hook is in it, fails by name rather than being averaged
 *           away with the clones that are fine.
 *
 * Note on paths: `core.hooksPath` holds the container path /git-secrets/hooks,
 * as core.sshCommand already does for the key, because the clones are worked in
 * from inside the containers. The host equivalent under the temporary project is
 * what this test stats.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh, runStart, git, HOOKS_MOUNT } from '../lib/gitfixture';
import { sh } from '../lib/shell';

const work = tempProject('lu-a4-hookspath-');
const project = join(work, 'project');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const alpha = seedRepo(work, 'alpha');
const beta = seedRepo(work, 'beta');
const bin = fakeSsh(work, [
  { match: 'alpha', bare: alpha },
  { match: 'beta', bare: beta }
]);
seedKnownHosts(project, ['localhost']);

const DECLARATION =
  'git@localhost:alpha.git|write|protected, git@localhost:beta.git|read|protected';
const started = runStart(project, DECLARATION, { pathPrefix: bin });

const hostHooks = join(project, 'volumes', '_git-secrets', 'hooks');
const systemConfig = join(project, 'volumes', '_git-secrets', 'gitconfig');
const asContainer = { GIT_CONFIG_SYSTEM: systemConfig, GIT_CONFIG_NOSYSTEM: '0' };

test('A4-13 both declared clones point at the shared hook directory', () => {
  expect(started.code).toBe(0);
  for (const name of ['alpha', 'beta']) {
    const clone = join(project, 'volumes', 'repos', name);
    expect(existsSync(join(clone, '.git'))).toBe(true);
    expect(git(clone, ['config', '--local', '--get', 'core.hooksPath']).stdout.trim()).toBe(
      HOOKS_MOUNT
    );
  }
});

test('A4-13 a clone made after the start script is governed without a further step', () => {
  const later = join(work, 'later');
  const cloned = git(work, ['clone', '-q', alpha, later], asContainer);
  expect(cloned.code).toBe(0);
  expect(
    git(later, ['config', '--get', 'core.hooksPath'], asContainer).stdout.trim()
  ).toBe(HOOKS_MOUNT);
});

test('A4-13 the shared hook is one file, and it is executable', () => {
  const hook = join(hostHooks, 'pre-push');
  expect(existsSync(hook)).toBe(true);
  expect(statSync(hook).mode & 0o111).not.toBe(0);
});

test('CM-6 the commit-message guard is in the same shared directory, and executable', () => {
  const hook = join(hostHooks, 'commit-msg');
  expect(existsSync(hook), 'the agents have no commit-message guard').toBe(true);
  expect(statSync(hook).mode & 0o111).not.toBe(0);
});

test('CM-6 and it refuses there what it refuses here, on the agents\' own prose', () => {
  // Installed rather than imagined: the file the start script put in the shared
  // directory is the one invoked, with the sentence that closed #18.
  const hook = join(hostHooks, 'commit-msg');
  const msg = join(work, 'cm6-msg');
  writeFileSync(msg, 'docs: x\n\nboth are merged and resolved: #18\n');
  const bad = sh(['sh', hook, msg], work);
  expect(bad.code, bad.output).toBe(1);
  expect(bad.output).toContain('commit-msg refused this message');
  // And the counterpart, so this is not a hook that refuses everything an agent
  // writes -- which would stop the stack's agents committing at all.
  writeFileSync(msg, 'docs: x\n\nthe #18 conflict, answered on #19\n');
  expect(sh(['sh', hook, msg], work).code).toBe(0);
});
