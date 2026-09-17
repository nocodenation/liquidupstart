/**
 * A9-13, A9-14 — several missing keys are one queue, announced before the first wait.
 *
 * Purpose: the operator asked what happens when more than one declared
 * repository is waiting on a deploy key. It was worse than it looked. Each clone
 * was attempted at the moment its wait began, so the start learned about the
 * second missing key only after the first had been dealt with: an operator was
 * told "add this key", did it, and was shown another screen with no warning that
 * it was coming. A reachable repository queued behind an unreachable one for the
 * whole deadline, and the deadline itself was per wait, so three missing keys
 * meant three times `SYSTEM_SIGNIN_WAIT_SECONDS` on an unattended host.
 *
 * `git.sh` now runs in three passes: try every clone, then ask for the keys that
 * are missing, then configure and record. Everything the operator is asked for
 * is therefore known before the first wait begins.
 *
 * Given  three declared repositories, one of which the remote accepts
 * When   `git.sh` runs against a remote that routes only that one
 * Then   it clones the reachable one first, names both missing keys and their
 *        count before waiting, numbers them "1 of 2" and "2 of 2", and records
 *        all three in the manifest
 * And    `git-key-all` ends the whole queue at once
 * And    the start budget bounds all the waits together, not each one
 *
 * A9-14's negative half is the run with no `git-key-all`: it waits, so the file
 * is shown to be what ends the queue rather than something else.
 *
 * Test data: `git@github.com:nocodenation/agent-skills.git|read|protected`
 * (routed to a seeded bare repository, so it clones),
 * `git@github.com:nocodenation/flows.git|write|protected` and
 * `git@github.com:nocodenation/portal.git|read|protected` (no route, which is
 * what an unregistered key looks like from here). Slugs
 * `github.com_nocodenation_flows` and `github.com_nocodenation_portal`,
 * `SYSTEM_SIGNIN_WAIT_SECONDS=30`, and the deadline file
 * `<project>/volumes/.start-skip/.deadline`.
 *
 * Requirements covered: A9-11, A9-12, A9-13, A9-14, the operator's question of
 * 2026-09-17.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh, runStart, manifest } from '../lib/gitfixture';

const work = tempProject('lu-a9-many-');
const project = join(work, 'project');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const skills = seedRepo(work, 'agent-skills');
seedKnownHosts(project);

// Routes agent-skills only. flows and portal fall through to "no route", which
// is indistinguishable here from a key the remote has never been given.
const partial = fakeSsh(join(work, 'partial'), [{ match: 'agent-skills', bare: skills }]);

const THREE = [
  'git@github.com:nocodenation/agent-skills.git|read|protected',
  'git@github.com:nocodenation/flows.git|write|protected',
  'git@github.com:nocodenation/portal.git|read|protected'
].join(',');

const skipDir = join(project, 'volumes', '.start-skip');

// Long enough that a run which honours it cannot finish inside the case, so the
// two runs below are distinguished by the sentinel and the budget rather than by
// having no wait at all.
mkdirSync(project, { recursive: true });
// 60s per wait against an 8s start budget: the two must be far enough apart that
// a loaded machine cannot blur them. At 30s and a 2s budget this case failed once
// in a full suite run and passed alone -- pass 1 attempts every clone before the
// first wait begins, and under load that took longer than the whole budget, so
// nothing was left to wait with. The numbers now leave room for that without
// weakening what is asserted: per wait this run would take 120s, and the bound
// below is 45s.
writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=60\n');

describe('A9-13 the queue is known before the first wait', () => {
  // The budget file start.sh writes at the beginning of a start. Eight seconds,
  // so this run proves the second wait inherits what the first left of it.
  mkdirSync(skipDir, { recursive: true });
  writeFileSync(join(skipDir, '.deadline'), String(Math.floor(Date.now() / 1000) + 8));
  const started = Date.now();
  const run = runStart(project, THREE, { pathPrefix: partial });
  const elapsed = Date.now() - started;

  test('the reachable repository is cloned before anything waits', () => {
    // It used to queue behind the first missing key for the whole deadline,
    // although nothing about it needed an operator.
    expect(existsSync(join(project, 'volumes', 'repos', 'agent-skills', '.git'))).toBe(true);
    expect(run.output.indexOf('Cloned git@github.com:nocodenation/agent-skills.git')).toBeLessThan(
      run.output.indexOf('ACTION REQUIRED')
    );
  });

  test('and the dashboard is given the whole list, not one name at a time', () => {
    const line = run.output.match(/::aiw-git-keys-pending::(.*)/)?.[1]?.trim() ?? '';
    expect(line.split(/\s+/).sort()).toEqual([
      'github.com_nocodenation_flows',
      'github.com_nocodenation_portal'
    ]);
    // The one that cloned is not in the queue.
    expect(line).not.toContain('agent-skills');
  });

  test('and the banner states the count and names both repositories', () => {
    expect(run.output).toContain('2 declared repositories could not be cloned');
    expect(run.output).toContain('- github.com/nocodenation/flows');
    expect(run.output).toContain('- github.com/nocodenation/portal');
  });

  test('and each screen says where in the queue it is', () => {
    expect(run.output).toContain('Repository 1 of 2');
    expect(run.output).toContain('Repository 2 of 2');
  });

  test('and the marker the panel follows still names one repository at a time', () => {
    const current = [...run.output.matchAll(/::aiw-git-key-required::(\S+)/g)].map((m) => m[1]);
    expect(current.sort()).toEqual([
      'github.com_nocodenation_flows',
      'github.com_nocodenation_portal'
    ]);
    // And says when each one's wait is over, so the panel closes on the last.
    expect(run.output).toContain('::aiw-git-key-done::github.com_nocodenation_portal');
  });

  test('and the whole start stays inside one budget, not one per key', () => {
    // Two waits, one eight-second budget. Per wait this would be 60s each; the
    // operator's real setting is 900, which is where three keys became three
    // quarters of an hour.
    // `waited` is the counterpart to `withinBudget`: a run that skipped both
    // waits outright would satisfy the bound and prove nothing about it.
    expect({
      code: run.code,
      waited: elapsed >= 2000,
      withinBudget: elapsed < 45_000,
      elapsed
    }).toEqual({ code: 0, waited: true, withinBudget: true, elapsed });
    expect(run.output).toContain('wait budget');
  });

  test('and all three are in the manifest, cloned or not', () => {
    const names = manifest(project).repositories.map(
      (r: { name: string; cloned: boolean }) => `${r.name}:${r.cloned}`
    );
    expect(names.sort()).toEqual(['agent-skills:true', 'flows:false', 'portal:false']);
  });
});

describe('A9-14 one sentinel ends the whole queue', () => {
  test('git-key-all skips every repository still waiting', () => {
    // What the dashboard's "Skip all" button writes, and what the banner tells an
    // operator at a terminal to touch. The budget file is removed first, so this
    // run has the full 60s available and can only finish quickly by skipping.
    rmSync(join(skipDir, '.deadline'), { force: true });
    rmSync(join(project, 'volumes', 'repos', 'flows'), { recursive: true, force: true });
    mkdirSync(skipDir, { recursive: true });
    writeFileSync(join(skipDir, 'git-key-all'), '');
    const started = Date.now();
    const run = runStart(project, THREE, { pathPrefix: partial });
    const elapsed = Date.now() - started;
    expect({ code: run.code, quick: elapsed < 20_000, elapsed }).toEqual({
      code: 0,
      quick: true,
      elapsed
    });
    expect(run.output).toContain('Skipping git-key-github.com_nocodenation_flows');
    expect(run.output).toContain('Skipping git-key-github.com_nocodenation_portal');
    rmSync(join(skipDir, 'git-key-all'), { force: true });
  }, 60_000);
});
