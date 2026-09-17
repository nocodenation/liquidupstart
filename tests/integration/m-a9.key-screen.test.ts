/**
 * A9-6, A9-7 — the deploy key is asked for in the flow, not discovered later.
 *
 * Purpose: a clone that fails during `start.sh` used to print two lines —
 * "Warning: could not clone …" and "register the key, then start again" — and the
 * start moved on. The operator met the public key later, in the dashboard card,
 * with the start already finished. Every other credential in this stack stops and
 * waits: Claude, Codex, Copilot, Grok. Review point 1 of #9 asks for the deploy
 * key to be treated the same.
 *
 * Given  a declared repository whose key the remote does not accept, and
 *        SYSTEM_SIGNIN_WAIT_SECONDS small enough for a case
 * When   `git.sh` runs
 * Then   it prints the key, the add-key form's address and the skip command,
 *        keeps retrying the clone, and comes back at the deadline
 * And    the same run with a key the remote accepts clones at once and prints no
 *        banner at all
 *
 * A9-7 is the half that keeps A9-6 honest: a banner on every start, including the
 * ones that work, would be noise the operator learns to scroll past.
 *
 * Test data: `git@github.com:nocodenation/agent-skills.git|read|protected`, and
 * a second run declared `|write|protected` to reach the checkbox instruction. The
 * refusing remote is `fakeSsh` with no match for the repository, which is what an
 * unregistered key looks like from here.
 *
 * Requirements covered: A9-6, A9-7, review points 1, 3 and 4 of #9.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh, runStart } from '../lib/gitfixture';

const work = tempProject('lu-a9-key-');
const project = join(work, 'project');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const skills = seedRepo(work, 'agent-skills');
seedKnownHosts(project);

// Accepts nothing: from git.sh this is indistinguishable from a key the remote
// does not have, which is the situation under test. Separate roots on purpose --
// fakeSsh always writes <root>/fake-bin/ssh, so two of them under one root are
// one script, and the second call silently decides what the first one does.
const refusing = fakeSsh(join(work, 'refuse'), []);
const accepting = fakeSsh(join(work, 'accept'), [{ match: 'agent-skills', bare: skills }]);

const READ = 'git@github.com:nocodenation/agent-skills.git|read|protected';
const WRITE = 'git@github.com:nocodenation/agent-skills.git|write|protected';
const clone = join(project, 'volumes', 'repos', 'agent-skills');

// Two seconds: long enough to show the wait is real, short enough for a suite.
// Written into the project's .env rather than passed as an environment variable,
// because that is where get_env looks -- .env is this stack's one config source,
// and a value exported into the shell would simply have been ignored. Found by
// running it: three waits of the default fifteen minutes each.
mkdirSync(project, { recursive: true });
writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=2\n');

describe('A9-6 an unregistered key stops and says so, in the flow', () => {
  const started = Date.now();
  const run = runStart(project, READ, { pathPrefix: refusing });
  const elapsed = Date.now() - started;
  // Read now, not in the assertion: every describe body in this file runs before
  // any test body, so by then the accepting run below has created the clone.
  const clonedAfterThisRun = existsSync(join(clone, '.git'));

  test('it shows the key and the form that takes it', () => {
    expect(run.output).toContain('ACTION REQUIRED');
    expect(run.output).toContain('ssh-ed25519');
    expect(run.output).toContain('https://github.com/nocodenation/agent-skills/settings/keys/new');
  });

  test('and the marker the dashboard watches for', () => {
    // The same shape as ::aiw-codex-auth-required::, which TaskRunner matches on.
    expect(run.output).toContain('::aiw-git-key-required::');
  });

  test('and the command that skips just this one step', () => {
    expect(run.output).toMatch(/touch .*\.start-skip\/git-key-/);
  });

  test('and it waits, then comes back rather than hanging', () => {
    // The deadline is 2s here. Without the wait this returned at once; without a
    // deadline it would never return at all, which is the failure a start script
    // must not have.
    expect({ waited: elapsed >= 2000, returned: run.code === 0 }).toEqual({
      waited: true,
      returned: true
    });
    expect(clonedAfterThisRun).toBe(false);
  });

  test('and the start continues: a missing key does not bring the stack down', () => {
    expect(run.code).toBe(0);
  });
});

describe('A9-6 a write declaration names the checkbox', () => {
  const run = runStart(project, WRITE, { pathPrefix: refusing });

  test('because it is off by default and the push fails much later', () => {
    expect(run.output).toContain('Allow write access');
  });
});

describe('A9-7 a key the remote accepts produces no banner at all', () => {
  const run = runStart(project, READ, { pathPrefix: accepting });

  test('it clones, and says nothing about deploy keys', () => {
    expect(run.code).toBe(0);
    expect(existsSync(join(clone, '.git', 'HEAD'))).toBe(true);
  });

  test('and prints neither the banner nor the marker', () => {
    // A banner on every start is noise an operator learns to scroll past.
    expect(run.output).not.toContain('ACTION REQUIRED');
    expect(run.output).not.toContain('::aiw-git-key-required::');
  });
});
