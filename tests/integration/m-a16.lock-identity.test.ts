/**
 * M-A16 · Integration · A pid is a number, and the table it belongs to is not written on it
 *
 * Purpose:  The lock M-A15 introduced decides whether it is held by asking
 *           `kill -0 <pid>`. That question is only meaningful inside one
 *           process table, and this lock directory is shared across two:
 *           `run.sh` mounts the project into the dashboard container at the
 *           same path and passes no `--pid=host`. Measured on 2026-09-21, a
 *           live host pid is simply absent inside a container, so a dashboard
 *           Test judged the start's lock stale and took it over — reintroducing
 *           exactly the concurrency the lock exists to prevent. In the other
 *           direction the container's own pids are 1 and 7, numbers certainly
 *           alive and unrelated on the host. Finding 2 of the 2026-09-21 review.
 *
 *           The same function had a second hole: between `mkdir` and writing the
 *           pid into it, another run reads an empty file and concludes nobody is
 *           behind it, so both runs end up holding one lock.
 * Given:    One declared repository, `git@github.com:nocodenation/agent-skills.git`,
 *           clonable through the suite's fake ssh, and a lock directory seeded
 *           by hand with each shape of holder in turn.
 * When:     A run reaches that repository.
 * Then:     A holder from another identity is honoured without the pid being
 *           consulted at all; an empty pid file counts as held; and the file the
 *           fix writes carries `<identity>:<pid>` so there is something to
 *           compare.
 * Covers:   A16-7, A16-8, A16-9, A16-10, A16-11, FR3, NFR1
 * Unhappy:  A16-8 is the positive counterpart and it is the one that matters:
 *           a lock left by a dead process on *this* identity is still taken
 *           over. Without it the fix could satisfy every other case here by
 *           never releasing anything, which is A15-4's failure — one killed
 *           start sealing a repository forever.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedKnownHosts, seedRepo, fakeSsh, gitScript } from '../lib/gitfixture';

const work = tempProject('lu-a16-identity-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const project = join(work, 'project');
mkdirSync(project, { recursive: true });
seedKnownHosts(project);
writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=0\n');

const SLUG = 'github.com_nocodenation_agent-skills';
const DECL = 'git@github.com:nocodenation/agent-skills.git|read|protected';
const bin = fakeSsh(work, [{ match: 'agent-skills', bare: seedRepo(work, 'agent-skills') }]);
const lockDir = join(project, 'volumes', '_git-secrets', 'locks', SLUG);
const clone = join(project, 'volumes', 'repos', 'agent-skills');
const thisHost = Bun.spawnSync(['hostname']).stdout.toString().trim();

const env = {
  ...(process.env as Record<string, string>),
  GIT_REPOSITORIES: DECL,
  PATH: `${bin}:${process.env.PATH}`
};

function runAgainst(holder: string | null, seeded = false) {
  if (!seeded) {
    rmSync(clone, { recursive: true, force: true });
    rmSync(lockDir, { recursive: true, force: true });
    if (holder !== null) {
      mkdirSync(lockDir, { recursive: true });
      writeFileSync(join(lockDir, 'pid'), holder);
    }
  }
  const p = Bun.spawnSync(['bash', gitScript, project], {
    env: { ...env, GIT_ONLY_SLUG: SLUG },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  return {
    code: p.exitCode,
    output: `${p.stdout?.toString() ?? ''}${p.stderr?.toString() ?? ''}`,
    cloned: existsSync(join(clone, '.git'))
  };
}

describe('A16-10 a holder from another identity is honoured', () => {
  // The container's hostname, which is what the dashboard writes. The pid it
  // names is 7 -- alive on the host, and nothing to do with this lock.
  const r = runAgainst('some-other-container:7');

  test('the run does not take the lock over', () => {
    expect(r.code).toBe(4);
    expect(r.output).toContain('::aiw-git-busy::');
  });

  test('and it does not touch the directory it did not get', () => {
    expect(r.cloned).toBe(false);
  });
});

describe('A16-9 an empty pid file is somebody, not nobody', () => {
  const r = runAgainst('');

  test('the instant between mkdir and the write counts as held', () => {
    expect(r.code).toBe(4);
    expect(r.cloned).toBe(false);
  });
});

describe('A16-8 a dead process on this identity still lets go', () => {
  const r = runAgainst(`${thisHost}:999999`);

  test('one killed run does not seal the repository forever', () => {
    // A15-4's promise, which the fix above could otherwise have quietly
    // withdrawn by treating everything as held.
    expect(r.code).toBe(0);
    expect(r.cloned).toBe(true);
  });
});

describe('A16-7 and a live process on this identity is honoured', () => {
  // A process this user owns, so `kill -0` can actually answer about it.
  const holder = Bun.spawn(['sleep', '30']);
  const r = runAgainst(`${thisHost}:${holder.pid}`);
  holder.kill();

  test('the lock is held while its process lives', () => {
    expect(r.code).toBe(4);
    expect(r.cloned).toBe(false);
  });
});

describe('A16-11 the lock names an identity, not a bare number', () => {
  test('what the fix writes can be compared at all', async () => {
    rmSync(clone, { recursive: true, force: true });
    rmSync(lockDir, { recursive: true, force: true });
    // A stand-in that sleeps, so the lock is observable while it is held rather
    // than in a race with the clone finishing.
    const slow = join(work, 'slow-bin');
    mkdirSync(slow, { recursive: true });
    writeFileSync(join(slow, 'ssh'), '#!/bin/sh\nsleep 3\nexit 128\n');
    chmodSync(join(slow, 'ssh'), 0o755);
    const run = Bun.spawn(['bash', gitScript, project], {
      env: { ...env, PATH: `${slow}:${process.env.PATH}` },
      stdout: 'pipe',
      stderr: 'pipe'
    });
    await Bun.sleep(900);
    const file = join(lockDir, 'pid');
    const holder = existsSync(file) ? readFileSync(file, 'utf8') : '';
    run.kill();
    await run.exited;

    expect(holder).toMatch(/^.+:[0-9]+$/);
    expect(holder.split(':')[0]).toBe(thisHost);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// A16-20 to A16-22 — the blocker of the 2026-09-28 review, and a regression of
// A15-4 introduced by A16-10. A foreign holder was honoured with no liveness
// check and no age limit. The identity is the hostname, and every run gets a
// fresh container: a dashboard start runs in a new `aiw-toolbox-start`, a Test
// in the dashboard container, whose hostname changes whenever run.sh recreates
// it. So a holder killed without its EXIT trap could never be matched again --
// and `docker rm -f` on the toolbox runs before every task, which is what
// closing a tab and pressing Start again does.
// ---------------------------------------------------------------------------

const OLD = new Date(Date.now() - 36 * 3600 * 1000);

function seedLock(holder: string | null, when?: Date) {
  rmSync(clone, { recursive: true, force: true });
  rmSync(lockDir, { recursive: true, force: true });
  mkdirSync(lockDir, { recursive: true });
  if (holder !== null) writeFileSync(join(lockDir, 'pid'), holder);
  if (when) {
    if (holder !== null) utimesSync(join(lockDir, 'pid'), when, when);
    utimesSync(lockDir, when, when);
  }
}

describe('A16-20 a foreign lock nobody can ask about is not forever', () => {
  test('A16-20 one older than any legitimate hold is taken over', () => {
    // The longest a lock may honestly be held is the deploy-key wait plus the
    // clone timeout. Past that, the holder is gone and nothing in the stack
    // clears the directory -- so every later start waited 300s and recorded
    // "another run is preparing", and every Test answered 409, until somebody
    // deleted volumes/_git-secrets/locks/<slug> by hand.
    seedLock('some-other-container:7', OLD);
    const r = runAgainst(null, true);
    expect(r.code).toBe(0);
    expect(r.cloned).toBe(true);
  });

  test('A16-20 and the run says it did so', () => {
    seedLock('some-other-container:7', OLD);
    const r = runAgainst(null, true);
    expect(r.output).toMatch(/stale|took over|abandoned/i);
  });
});

describe('A16-21 but a fresh foreign lock is still honoured', () => {
  test('A16-21 the counterpart: a lock being held right now is left alone', () => {
    // Without this, A16-20 could be met by ignoring foreign locks entirely,
    // which is the concurrency A15 exists to prevent.
    seedLock('some-other-container:7');
    const r = runAgainst(null, true);
    expect(r.code).toBe(4);
    expect(r.cloned).toBe(false);
  });
});

describe('A16-22 an abandoned mkdir is not forever either', () => {
  test('A16-22 an empty pid file older than any hold is taken over', () => {
    // A16-9 made an empty pid file count as held, which is right for the
    // instant between mkdir and the write. A run killed in that instant left
    // it empty for good.
    seedLock('', OLD);
    const r = runAgainst(null, true);
    expect(r.code).toBe(0);
    expect(r.cloned).toBe(true);
  });

  test('A16-22 and a fresh one is still held', () => {
    seedLock('');
    const r = runAgainst(null, true);
    expect(r.code).toBe(4);
  });
});
