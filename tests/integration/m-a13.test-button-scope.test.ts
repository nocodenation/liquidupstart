/**
 * A13-1 to A13-4 — a dashboard Test touches one repository, and does not wait for anyone.
 *
 * Purpose: findings 1 and 2 of Timur's follow-up review of #9 (2026-09-18), both
 * regressions introduced by the fixes of the day before, and both in the same
 * scenario: the Test button runs `git.sh` with `GIT_ONLY_SLUG`, and `git.sh` now
 * does two things a Test must not do.
 *
 * **It writes the manifest before pass 2.** M-A12 added that write so the
 * repositories card would stop describing the previous start while this one
 * waited. Under `GIT_ONLY_SLUG` pass 1 fills the arrays with **one** repository,
 * so the provisional write puts a one-entry manifest on disk — for the whole
 * Test, up to seven minutes. In the agent containers `git-repo-info flows` then
 * answers "not declared in this stack", and the card lists every other
 * repository as having no deploy key yet. If the run exits non-zero the
 * dashboard returns before merging, and the cut-down manifest stays until the
 * next full start.
 *
 * **And it waits.** M-A9 made a failed clone stop the start and ask for a deploy
 * key. A Test goes through that same pass 2, so pressing Test on a repository
 * whose key is missing waits — the full `SYSTEM_SIGNIN_WAIT_SECONDS`, or until
 * whatever deadline a recent start left behind — and the dashboard's own 420s
 * timer kills it. The operator gets *"did not finish within seven minutes"* for
 * a repository whose key is simply not registered, which is the answer the Test
 * exists to give.
 *
 * A Test is itself the retry. It has an operator in front of it, watching it.
 * Waiting for that operator to do something while they wait for the Test to
 * answer is a deadlock with a timer on it.
 *
 * Given  two declared repositories and a manifest recording both
 * When   `git.sh` runs with `GIT_ONLY_SLUG` naming one of them
 * Then   the manifest on disk is left alone until the end, and a failed clone is
 *        recorded and returned at once, with no wait and no deploy-key banner
 * And    the same failure in a full start still waits, because that is where an
 *        operator can act on it
 *
 * A13-2 and A13-4 are the positive counterparts, and A13-4 carries the weight:
 * the difference between the two runs must be `GIT_ONLY_SLUG` and nothing else,
 * or the fix has simply removed the wait that M-A9 was built for.
 *
 * Test data: `git@github.com:nocodenation/agent-skills.git|read|protected` and
 * `git@github.com:nocodenation/flows.git|write|protected`, slug
 * `github.com_nocodenation_agent-skills` for the tested one. The ssh stand-in
 * sleeps 1 second before refusing, so the manifest can be read repeatedly while
 * the run is in progress rather than once by luck.
 * `SYSTEM_SIGNIN_WAIT_SECONDS=3` keeps A13-4's wait short enough for a suite and
 * long enough to tell from no wait at all.
 *
 * Requirements covered: A13-1 to A13-4, findings 1 and 2 of the #9 follow-up.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedKnownHosts, gitScript } from '../lib/gitfixture';

const work = tempProject('lu-a13-scope-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const project = join(work, 'project');
mkdirSync(project, { recursive: true });
seedKnownHosts(project);
writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=3\n');

const SKILLS = 'git@github.com:nocodenation/agent-skills.git|read|protected';
const FLOWS = 'git@github.com:nocodenation/flows.git|write|protected';
const DECL = `${SKILLS},${FLOWS}`;
const SKILLS_SLUG = 'github.com_nocodenation_agent-skills';

// Refuses, slowly: the delay is what makes "while the run is in progress" a
// window this case can read rather than a moment it might miss.
const bin = join(work, 'slow-bin');
mkdirSync(bin, { recursive: true });
writeFileSync(join(bin, 'ssh'), '#!/bin/sh\nsleep 1\necho "fake-ssh: refused" >&2\nexit 128\n');
chmodSync(join(bin, 'ssh'), 0o755);

const manifestPath = join(project, 'volumes', '_git-secrets', 'repositories.json');
const entries = () => JSON.parse(readFileSync(manifestPath, 'utf8')).repositories as Array<{
  name: string;
  cloned: boolean;
  error: string | null;
}>;

/** A manifest of the shape a full start leaves behind, with both repositories. */
function seedManifest(): void {
  mkdirSync(join(project, 'volumes', '_git-secrets'), { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generated: '2026-09-18T06:00:00Z',
        repositories: [
          { name: 'agent-skills', slug: SKILLS_SLUG, cloned: true, error: null },
          { name: 'flows', slug: 'github.com_nocodenation_flows', cloned: true, error: null }
        ]
      },
      null,
      2
    ) + '\n'
  );
}

function spawnGit(env: Record<string, string>) {
  return Bun.spawn(['bash', gitScript, project], {
    env: { ...(process.env as Record<string, string>), GIT_REPOSITORIES: DECL, PATH: `${bin}:${process.env.PATH}`, ...env },
    stdout: 'pipe',
    stderr: 'pipe'
  });
}

// The runs happen here, at module scope: a `describe` body cannot await, and
// these cases are about what is true *while* a run is in progress.
seedManifest();
const watched = spawnGit({ GIT_ONLY_SLUG: SKILLS_SLUG });
// Every reading taken while the run is in progress, not one at a moment of this
// case's choosing: the defect is a window, so the case watches the window.
const seen: number[] = [];
const watchStarted = Date.now();
while (watched.exitCode === null && Date.now() - watchStarted < 30_000) {
  await Bun.sleep(20);
  try {
    seen.push(entries().length);
  } catch {
    seen.push(-1);
  }
}
const out = `${await new Response(watched.stdout).text()}${await new Response(watched.stderr).text()}`;
const code = await watched.exited;

describe('A13-1 a Test leaves the manifest alone while it runs', () => {
  test('the case really watched the run, not its aftermath', () => {
    // Without readings there is nothing to assert, and a green result would mean
    // the run was over before the first look.
    expect(seen.length).toBeGreaterThan(3);
  });

  test('and no reading during the run showed a manifest cut down to one repository', () => {
    // The last twenty samples -- about 400ms -- are left out, not the last one:
    // the final write at the end of pass 3 does put one entry there for the
    // dashboard to merge, and on a loaded machine several samples can land
    // between that write and this process observing the exit. The window the
    // case is about is everything before it, and it is long: the ssh stand-in
    // sleeps a second. Measured before the fix, 337 readings of one entry;
    // after it, none outside that tail.
    const early = seen.slice(0, Math.max(1, seen.length - 20));
    expect(early.filter((n) => n !== 2)).toEqual([]);
    expect(early.length).toBeGreaterThan(3);
  });

  test('and the run itself succeeded', () => {
    expect(code).toBe(0);
    expect(out).toContain('could not clone');
  });
});

describe('A13-2 and the tested repository is recorded when it is over', () => {
  test('the manifest git.sh leaves holds the tested entry, for the dashboard to merge', () => {
    // The Test's own product: one entry, which `retryRepository` splices into the
    // manifest it read first. What must not happen is that entry reaching disk
    // *before* the merge, which is A13-1.
    const after = entries();
    expect(after.map((e) => e.name)).toEqual(['agent-skills']);
    expect(after[0].cloned).toBe(false);
  });
});

const retryStarted = Date.now();
const retry = spawnGit({ GIT_ONLY_SLUG: SKILLS_SLUG });
const retryOut = `${await new Response(retry.stdout).text()}${await new Response(retry.stderr).text()}`;
const retryCode = await retry.exited;
const retryElapsed = Date.now() - retryStarted;

describe('A13-3 a Test does not wait for a deploy key', () => {
  test('it comes back at once, with the failure recorded', () => {
    // 3s is this fixture's whole wait budget, and the clone stub sleeps 1s, so a
    // run that waited would take at least four. Before the fix it waited, and
    // the dashboard killed it at 420s.
    expect({ code: retryCode, quick: retryElapsed < 3_500, elapsed: retryElapsed }).toEqual({
      code: 0,
      quick: true,
      elapsed: retryElapsed
    });
  });

  test('and asks for no deploy key, because nobody is watching the log', () => {
    // The panel that would ask is not on the screen during a Test: the operator
    // is looking at the card, waiting for this run to answer.
    expect(retryOut).not.toContain('::aiw-git-key-required::');
    expect(retryOut).not.toContain('ACTION REQUIRED');
  });
});

describe('A13-4 a full start still waits, because an operator can act there', () => {
  test('without GIT_ONLY_SLUG the same failure stops and asks', async () => {
    // The counterpart that keeps A13-3 from being "the wait was removed". The
    // difference between the two runs is one environment variable.
    rmSync(join(project, 'volumes', '.start-skip'), { recursive: true, force: true });
    const started = Date.now();
    const child = spawnGit({});
    const out = `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}`;
    const code = await child.exited;
    const elapsed = Date.now() - started;
    expect(out).toContain('::aiw-git-key-required::');
    expect(out).toContain('ACTION REQUIRED');
    expect({ code, waited: elapsed >= 3_000 }).toEqual({ code: 0, waited: true });
  }, 60_000);
});
