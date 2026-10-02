/**
 * M-A16 · Integration · Waiting for a lock, and what a timeout may say
 *
 * Purpose:  Two halves of finding 2 of the 2026-09-28 review. The wait itself
 *           was covered only by a text match for `GIT_LOCK_WAIT_SECONDS:-300`
 *           in the script, so reverting the wait entirely failed no test. And a
 *           start that gave up waiting wrote `cloned: false` plus "another run
 *           is preparing" over whatever the manifest already said — describing
 *           a repository that is cloned and healthy as broken, because a
 *           different run happened to hold its lock at that moment.
 * Given:    `git@github.com:nocodenation/agent-skills.git|read|protected`,
 *           clonable through the suite's fake ssh from a local bare
 *           repository, and a lock directory seeded by hand with a fresh
 *           foreign holder so it can only be waited for, never taken over.
 *           `GIT_LOCK_WAIT_SECONDS` is set per case, so the budget is the
 *           case's and not the default 300.
 * When:     A full start meets that lock, once with it released mid-wait and
 *           once with it held throughout.
 * Then:     The released one is picked up and cloned; the held one ends its
 *           budget without cloning and leaves the manifest as it found it.
 * Covers:   A16-27, A16-28, A16-29, FR3, U1
 * Unhappy:  A16-28 is the timeout. A16-27 is its counterpart — the wait really
 *           does acquire a lock that is released, so A16-28 cannot pass by the
 *           wait never working at all.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedKnownHosts, seedRepo, fakeSsh, gitScript, watchOutput } from '../lib/gitfixture';

const work = tempProject('lu-a16-wait-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const bin = fakeSsh(work, [{ match: 'agent-skills', bare: seedRepo(work, 'agent-skills') }]);
const SLUG = 'github.com_nocodenation_agent-skills';

// Each case gets its own project. Sharing one meant A16-28 inherited the clone
// and the manifest A16-27 left, which is how it first came back with exit 128
// for a reason that had nothing to do with the finding.
let n = 0;
function newProject(seedManifest?: unknown) {
  const project = join(work, `p${++n}`);
  mkdirSync(project, { recursive: true });
  seedKnownHosts(project);
  writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=0\n');
  if (seedManifest) {
    mkdirSync(join(project, 'volumes', '_git-secrets'), { recursive: true });
    writeFileSync(
      join(project, 'volumes', '_git-secrets', 'repositories.json'),
      JSON.stringify(seedManifest, null, 2)
    );
  }
  return project;
}

const paths = (project: string) => ({
  lockDir: join(project, 'volumes', '_git-secrets', 'locks', SLUG),
  clone: join(project, 'volumes', 'repos', 'agent-skills'),
  manifest: join(project, 'volumes', '_git-secrets', 'repositories.json')
});

const env = {
  ...(process.env as Record<string, string>),
  GIT_REPOSITORIES: 'git@github.com:nocodenation/agent-skills.git|read|protected',
  PATH: `${bin}:${process.env.PATH}`
};

function holdLock(lockDir: string) {
  // Foreign and fresh: it can only be waited for. A holder this machine owns
  // would be judged by its process table and taken over at once.
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, 'pid'), 'some-other-container:7');
}

const HEALTHY = {
  generated: '2026-09-28T00:00:00Z',
  repositories: [{
    name: 'agent-skills', url: 'git@github.com:nocodenation/agent-skills.git',
    host: 'github.com', path: 'nocodenation/agent-skills', access: 'read',
    policy: 'protected', slug: SLUG,
    keyDir: `volumes/_git-secrets/repos/${SLUG}`,
    publicKeyFile: `volumes/_git-secrets/repos/${SLUG}/id_ed25519.pub`,
    clonePath: 'volumes/repos/agent-skills',
    containerKey: `/git-secrets/repos/${SLUG}/id_ed25519`,
    containerClone: '/repos/agent-skills',
    cloned: true, error: null
  }]
};

describe('A16-27 the wait really waits, and then works', () => {
  test('A16-27 a lock released during the wait is picked up and the clone happens', async () => {
    const project = newProject();
    const { lockDir, clone, manifest } = paths(project);
    holdLock(lockDir);
    const p = Bun.spawn(['bash', gitScript, project], {
      env: { ...env, GIT_LOCK_WAIT_SECONDS: '60' },
      stdout: 'pipe',
      stderr: 'pipe'
    });
    // The lock is released once the run has said it is waiting for it, and not
    // 3000ms after it was spawned.
    //
    // **What stood here could pass over the defect it exists to catch.** It
    // slept 3000ms, released, and asserted that more than 3000ms had gone by --
    // which its own sleep guarantees. A run that had not reached the lock within
    // those 3000ms met no lock at all, took it, cloned, and satisfied every
    // assertion without waiting for anything. Measured 2026-10-02: with
    // `lu_take_lock_waiting` taken out of `git.sh` altogether and the release
    // brought forward, all four cases in this file passed. On an idle host the
    // run arrives in about 250ms and the case does catch it; under load the
    // holder takes 1047 to 1342ms, and the guard is a race rather than a rule.
    const out = watchOutput(p);
    await out.until('Waiting for another run to finish preparing');
    rmSync(lockDir, { recursive: true, force: true });
    await out.finished();
    await p.exited;

    // It waited rather than taking the lock, and the run said so itself -- which
    // is the assertion the elapsed clock was standing in for.
    expect(out.text).toContain(`Waiting for another run to finish preparing ${SLUG}`);
    expect(existsSync(join(clone, '.git'))).toBe(true);
    expect(JSON.parse(readFileSync(manifest, 'utf8')).repositories[0].cloned).toBe(true);
  }, 120_000);
});

describe('A16-28 a start that gives up waiting changes nothing', () => {
  const project = newProject(HEALTHY);
  const { lockDir, clone, manifest } = paths(project);
  holdLock(lockDir);
  const p = Bun.spawnSync(['bash', gitScript, project], {
    env: { ...env, GIT_LOCK_WAIT_SECONDS: '5' },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const out = `${p.stdout?.toString() ?? ''}${p.stderr?.toString() ?? ''}`;

  test('A16-28 the budget ends without a clone', () => {
    expect(p.exitCode).toBe(0);
    expect(existsSync(join(clone, '.git'))).toBe(false);
  });

  test('A16-28 and the manifest still says what the last start found', () => {
    // The finding. A repository that is cloned and working was recorded as
    // `cloned: false` with "another run is preparing it", because a different
    // run held its lock while this one gave up waiting.
    const after = JSON.parse(readFileSync(manifest, 'utf8')).repositories[0];
    expect(after.cloned).toBe(true);
    expect(after.error).toBeNull();
  });

  test('A16-29 and it says what it did instead of writing it down', () => {
    expect(out).toContain('another run is preparing');
    expect(out).toContain('leaving the manifest entry');
  });
});
