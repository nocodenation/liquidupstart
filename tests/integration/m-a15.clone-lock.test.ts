/**
 * A15-1 to A15-4 — two runs never prepare the same repository at once.
 *
 * Purpose: found by the operator on 2026-09-18, pressing **Test this repository**
 * while a start was still waiting for that repository's deploy key. The card
 * answered *"github.com/nocodenation/does-not-exist is reachable — its clone is
 * in ./volumes/repos/does-not-exist"* for a repository that does not exist,
 * whose clone was not on disk, and which the manifest recorded as unreachable
 * both before and after.
 *
 * The mechanism, reproduced: `git clone` creates `dest/.git` and writes the
 * remote into it **within 20 ms**, long before it learns whether the remote will
 * answer —
 *
 *   t=20ms: target/.git EXISTS   HEAD=fatal: ambiguous argument 'HEAD'
 *
 * — and a start that is waiting retries the same clone into the same directory
 * every five seconds. The Test landed inside that window, found `.git` with a
 * matching `remote.origin.url`, and adopted it: the rule M-A10 introduced for
 * "an existing clone is judged by its origin" cannot tell a finished clone from
 * one that is 20 ms old.
 *
 * Nor can anything else cheaply: a clone in flight and a finished clone of an
 * **empty** repository are the same thing on disk — a repository with a remote
 * and no commits. So the fix is not a better inspection. It is that two runs do
 * not prepare one repository at the same time.
 *
 * Given  a repository whose preparation is already in progress
 * When   a second run reaches it
 * Then   it does not touch the directory, reports that another run holds it, and
 *        does not ask for a deploy key, because no key mends this
 * And    the lock is released when the run ends, however it ends
 *
 * A15-3 is the counterpart: a lock that is never released turns one interrupted
 * start into a repository nothing can ever prepare again.
 *
 * Test data: `git@github.com:nocodenation/agent-skills.git|read|protected`, slug
 * `github.com_nocodenation_agent-skills`; the lock directory
 * `volumes/_git-secrets/locks/<slug>`; an ssh stand-in that sleeps two seconds
 * before refusing, so the first run is demonstrably still inside its clone when
 * the second starts.
 *
 * Requirements covered: A15-1 to A15-4, and the operator's observation of
 * 2026-09-18.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedKnownHosts, gitScript } from '../lib/gitfixture';

const work = tempProject('lu-a15-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const project = join(work, 'project');
mkdirSync(project, { recursive: true });
seedKnownHosts(project);
writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=0\n');

const DECL = 'git@github.com:nocodenation/agent-skills.git|read|protected';
const SLUG = 'github.com_nocodenation_agent-skills';
const lockDir = join(project, 'volumes', '_git-secrets', 'locks', SLUG);

// Sleeps, so "while the first run is inside its clone" is a window rather than a
// coincidence.
const bin = join(work, 'slow-bin');
mkdirSync(bin, { recursive: true });
writeFileSync(join(bin, 'ssh'), '#!/bin/sh\nsleep 2\necho "fake-ssh: refused" >&2\nexit 128\n');
chmodSync(join(bin, 'ssh'), 0o755);

function spawnGit(env: Record<string, string> = {}) {
  return Bun.spawn(['bash', gitScript, project], {
    env: {
      ...(process.env as Record<string, string>),
      GIT_REPOSITORIES: DECL,
      PATH: `${bin}:${process.env.PATH}`,
      ...env
    },
    stdout: 'pipe',
    stderr: 'pipe'
  });
}

const manifest = () =>
  JSON.parse(
    readFileSync(join(project, 'volumes', '_git-secrets', 'repositories.json'), 'utf8')
  ).repositories as Array<{ name: string; cloned: boolean; error: string | null }>;

// The first run, and a second started while it is still working.
const first = spawnGit();
await Bun.sleep(700);
const lockedWhileBusy = existsSync(lockDir);
const second = spawnGit({ GIT_ONLY_SLUG: SLUG });
const secondOut = `${await new Response(second.stdout).text()}${await new Response(second.stderr).text()}`;
const secondCode = await second.exited;
const firstOut = `${await new Response(first.stdout).text()}${await new Response(first.stderr).text()}`;
const firstCode = await first.exited;

describe('A15-1 the run that gets there first holds the repository', () => {
  test('a lock is taken while it works', () => {
    expect(lockedWhileBusy).toBe(true);
  });

  test('and the second run says so instead of guessing', () => {
    // Before this, the second run read a clone that was 20 ms old and reported
    // the repository as reachable -- to an operator, about their own stack.
    //
    // **Changed 2026-09-21, and the change is the point.** This case used to
    // require exit 0 and a manifest entry saying `cloned: false, error: another
    // run is preparing it`. That is the defect Timur's finding 1 names: a
    // refused lock recorded as a clone result, over a repository that may be
    // cloned and healthy. The refusal is now an outcome of its own -- exit 4,
    // nothing written -- and A16-1 holds what replaces it. The assertion that
    // the second run does not guess survives; what it may say has changed.
    expect(secondCode).toBe(4);
    expect(secondOut).toContain('::aiw-git-busy::');
    // And the refusal reached no record. The manifest that exists is the first
    // run's -- it writes one at the end of pass 1 -- and it carries that run's
    // own clone failure, never the other run's refusal.
    const entry = manifest().find((e) => e.name === 'agent-skills')!;
    expect(entry.error).not.toContain('another run');
  });

  test('and it asks for no deploy key, because no key mends this', () => {
    expect(secondOut).not.toContain('::aiw-git-key-required::');
  });
});

describe('A15-2 and it never touches the directory it did not get', () => {
  test('the second run leaves no clone behind', () => {
    // The `rm -rf` in the failure branch belongs to whoever created the
    // directory. A run that never took the lock must not remove another run's
    // work in progress.
    expect(existsSync(join(project, 'volumes', 'repos', 'agent-skills'))).toBe(false);
  });
});

describe('A15-3 the lock is released when the run ends', () => {
  test('the first run finished and let go', () => {
    expect(firstCode).toBe(0);
    expect(firstOut).toContain('could not clone');
    expect(existsSync(lockDir)).toBe(false);
  });

  test('and a later run gets it, so one interruption does not seal the repository', () => {
    // The counterpart, and the failure mode a lock introduces: a lock nobody
    // releases turns one killed start into a repository nothing can prepare
    // again.
    const third = Bun.spawnSync(['bash', gitScript, project], {
      env: {
        ...(process.env as Record<string, string>),
        GIT_REPOSITORIES: DECL,
        PATH: `${bin}:${process.env.PATH}`
      }
    });
    expect(third.exitCode).toBe(0);
    const entry = manifest().find((e) => e.name === 'agent-skills')!;
    expect(entry.error).toContain('Could not read from remote repository');
    expect(existsSync(lockDir)).toBe(false);
  }, 60_000);
});

describe('A15-4 a lock left by a killed run does not seal the repository forever', () => {
  test('a stale lock is taken over, and said so', () => {
    // A run that is killed between mkdir and its trap leaves the directory
    // behind. The lock therefore carries the pid that took it, and a lock whose
    // process is gone is not a lock.
    mkdirSync(lockDir, { recursive: true });
    // The identity as well as the number, because a pid alone cannot say which
    // process table it belongs to -- finding 2 of 2026-09-21. A15-4 is about a
    // *dead* process on this machine, so it names this machine.
    const thisHost = Bun.spawnSync(['hostname']).stdout.toString().trim();
    writeFileSync(join(lockDir, 'pid'), `${thisHost}:999999\n`);
    const r = Bun.spawnSync(['bash', gitScript, project], {
      env: {
        ...(process.env as Record<string, string>),
        GIT_REPOSITORIES: DECL,
        PATH: `${bin}:${process.env.PATH}`
      }
    });
    expect(r.exitCode).toBe(0);
    const entry = manifest().find((e) => e.name === 'agent-skills')!;
    // It got through to the clone, rather than reporting the repository busy.
    expect(entry.error).toContain('Could not read from remote repository');
  }, 60_000);
});
