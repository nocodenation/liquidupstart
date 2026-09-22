/**
 * M-A16 · Integration · A refused lock is not a clone result
 *
 * Purpose:  M-A15 stopped two runs preparing one repository at once, and
 *           introduced the defect this case holds: the refusal was written into
 *           the manifest the way a failed clone is. A start holds one lock per
 *           declared repository and releases them all only when it exits, so a
 *           start waiting for one deploy key held the locks of every repository
 *           it had already finished — for up to the whole start budget. A Test
 *           on one of those healthy repositories then answered that it was
 *           unreachable, flipped `cloned` to false underneath it, and sent the
 *           operator to register a deploy key for a clone that was on disk and
 *           working. Finding 1 of the 2026-09-21 review, reproduced before it
 *           was touched.
 * Given:    Two declared repositories. `agent-skills` clones cleanly from a
 *           local bare repository through the suite's fake ssh;
 *           `liquid-flows` has no route, so its clone fails and a deploy key is
 *           asked for. `SYSTEM_SIGNIN_WAIT_SECONDS=90`, so the start is really
 *           inside its wait while it is measured, rather than past it.
 * When:     The start is at the deploy-key wait for `liquid-flows`, and a
 *           dashboard Test (`GIT_ONLY_SLUG`) runs against `agent-skills`.
 * Then:     The settled repository's lock is already released, the Test runs
 *           normally, and the manifest still records it as cloned with no
 *           error. A Test against the repository that *is* held answers exit 4
 *           and writes nothing at all.
 * Covers:   A16-1, A16-2, A16-5, A16-6, FR3, U1
 * Unhappy:  A16-1 is the refusal. A16-2 is its counterpart — a run that can
 *           take the lock still writes its result, so A16-1 cannot pass by
 *           nothing ever being written.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedKnownHosts, seedRepo, fakeSsh, gitScript } from '../lib/gitfixture';

const work = tempProject('lu-a16-outcome-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const project = join(work, 'project');
mkdirSync(project, { recursive: true });
seedKnownHosts(project);
writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=90\n');

const SKILLS = 'github.com_nocodenation_agent-skills';
const FLOWS = 'github.com_nocodenation_liquid-flows';
const DECL =
  'git@github.com:nocodenation/agent-skills.git|read|protected,' +
  'git@github.com:nocodenation/liquid-flows.git|write|protected';

const bin = fakeSsh(work, [{ match: 'agent-skills', bare: seedRepo(work, 'agent-skills') }]);
const locks = join(project, 'volumes', '_git-secrets', 'locks');
const manifestPath = join(project, 'volumes', '_git-secrets', 'repositories.json');
const entry = (name: string) =>
  JSON.parse(readFileSync(manifestPath, 'utf8')).repositories.find((e: any) => e.name === name);

const env = {
  ...(process.env as Record<string, string>),
  GIT_REPOSITORIES: DECL,
  PATH: `${bin}:${process.env.PATH}`
};

const start = Bun.spawn(['bash', gitScript, project], { env, stdout: 'pipe', stderr: 'pipe' });

// Read until the start says it is waiting, rather than sleeping a guessed
// interval: the measurement has to happen inside the wait or it measures
// nothing.
let announced = '';
{
  const reader = start.stderr.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + 60_000;
  while (!announced.includes('::aiw-git-key-required::') && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    announced += decoder.decode(value);
  }
}

const reachedTheWait = announced.includes('::aiw-git-key-required::');
const skillsClonedOnDisk = existsSync(join(project, 'volumes/repos/agent-skills/.git'));
const skillsAfterPassOne = entry('agent-skills');
const heldOnWaited = existsSync(join(locks, FLOWS));
const heldOnSettled = existsSync(join(locks, SKILLS));

const testRun = (slug: string) => {
  const p = Bun.spawnSync(['bash', gitScript, project], {
    env: { ...env, GIT_ONLY_SLUG: slug, SYSTEM_SIGNIN_WAIT_SECONDS: '0' },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  return {
    code: p.exitCode,
    output: `${p.stdout?.toString() ?? ''}${p.stderr?.toString() ?? ''}`
  };
};

const onSettled = testRun(SKILLS);
const settledAfter = entry('agent-skills');
const generatedAfterSettled = JSON.parse(readFileSync(manifestPath, 'utf8')).generated;
const onHeld = testRun(FLOWS);
const generatedAfterHeld = JSON.parse(readFileSync(manifestPath, 'utf8')).generated;

start.kill();
await start.exited;

describe('A16-6 a start holds only what it is still waiting for', () => {
  test('the wait was actually reached, so the rest measures something', () => {
    expect(reachedTheWait).toBe(true);
  });

  test('the repository being waited on is held', () => {
    expect(heldOnWaited).toBe(true);
  });

  test('the repository that is settled is not', () => {
    // The whole of finding 1's second half. Before the fix this was true, and
    // every Test on a finished repository failed for the length of the wait.
    expect(heldOnSettled).toBe(false);
  });
});

describe('A16-2 a run that gets the lock still writes its result', () => {
  test('pass 1 recorded the clone it made', () => {
    expect(skillsClonedOnDisk).toBe(true);
    expect(skillsAfterPassOne.cloned).toBe(true);
  });

  test('and the Test on it runs and reports', () => {
    expect(onSettled.code).toBe(0);
    expect(settledAfter.cloned).toBe(true);
    expect(settledAfter.error).toBeNull();
  });
});

describe('A16-1 a refused lock is never written as a clone result', () => {
  test('the Test on the held repository says busy, with its own status', () => {
    // 4, not 0 and not 1: the dashboard has to tell "another run holds it"
    // apart from "the clone failed", because only one of them is about a
    // deploy key.
    expect(onHeld.code).toBe(4);
    expect(onHeld.output).toContain('::aiw-git-busy::');
  });

  test('and it wrote nothing at all', () => {
    // Not merely "wrote something harmless": the manifest is byte-identical,
    // so nothing downstream can have read a refusal as a result.
    expect(generatedAfterHeld).toBe(generatedAfterSettled);
    expect(entry('agent-skills').cloned).toBe(true);
  });
});

describe('A16-5 a start waits for a lock rather than recording an error', () => {
  test('the wait is bounded and the bound is configurable', () => {
    // A bound that cannot be set is a bound no case can reach. The default is
    // the other run's own ceiling: a Test bounds its clone at 300s.
    const script = readFileSync(gitScript, 'utf8');
    expect(script).toContain('GIT_LOCK_WAIT_SECONDS:-300');
    expect(script).toContain('lu_take_lock_waiting');
  });

  test('and a Test does not wait, because an operator is in front of it', () => {
    // The deadlock pass 2 already avoids for deploy keys, one layer down.
    const script = readFileSync(gitScript, 'utf8');
    expect(script).toMatch(/ONLY_SLUG.*\n\s*lu_take_lock "\$1"/);
  });
});
