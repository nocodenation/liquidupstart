/**
 * A10-23 — no fixture can reach the working copy it is testing.
 *
 * Purpose: found by running the suite on 2026-09-17, not by review. The chain
 * fixtures build under `volumes/repos/.a7-<tag>-<pid>` — **inside this working
 * copy**, because the containers reach them through the `/repos` bind mount.
 * They create those directories first and clone into them afterwards. When the
 * clone does not happen — a stack that is not running, a start script that
 * failed — the directory exists and holds no repository, and git's upward search
 * then finds the enclosing repository: this one.
 *
 * What that did, measured: a suite run committed the whole working tree as `1`
 * onto `feature/liquid-java-extensions` under the fixture's identity, created
 * `agent/probe-2` from `main`, committed `2` onto it, checked out
 * `agent/probe-3`, and left HEAD there. Every test that ran afterwards read a
 * tree from another branch, so 19 cases failed for reasons that had nothing to
 * do with them. Nothing was lost and nothing was pushed, and neither of those
 * was to the suite's credit.
 *
 * `GIT_CEILING_DIRECTORIES` stops the upward search before this working copy, in
 * the one place every fixture goes through. A directory that is not a repository
 * then answers "not a git repository" instead of silently being this one.
 *
 * Given  a directory inside this working copy that holds no repository
 * When   the fixture helper runs git in it
 * Then   git refuses to find a repository, and this working copy is untouched
 * And    the helper still works in a real fixture clone outside the tree
 *
 * The second half is the counterpart: a ceiling that broke every fixture would
 * pass the first assertion and make the suite useless.
 *
 * Test data: `volumes/repos/.a10-ceiling-probe`, created empty and removed
 * afterwards — the same shape and the same place as `.a7-race-<pid>`, which is
 * what walked up. The commands are `git status` and `git commit --allow-empty -m
 * probe`, the second being what actually happened.
 *
 * Requirements covered: A10-23, and the 2026-09-17 incident.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { git, seedRepo, tempProject } from '../lib/gitfixture';

const probe = join(repoRoot, 'volumes', 'repos', '.a10-ceiling-probe');
const work = tempProject('lu-a10-ceiling-');
afterAll(() => {
  rmSync(probe, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe('A10-23 a directory that is not a repository is not this repository', () => {
  mkdirSync(probe, { recursive: true });

  test('git in it finds nothing, rather than finding the working copy', () => {
    const r = git(probe, ['status', '--short']);
    expect(r.code).not.toBe(0);
    expect(r.output.toLowerCase()).toContain('not a git repository');
  });

  test('and a commit there changes nothing here', () => {
    // The command that did the damage. The branch and the HEAD of this working
    // copy are read through git's own answer rather than assumed.
    const before = git(repoRoot, ['rev-parse', 'HEAD']).stdout.trim();
    const branchBefore = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();

    const r = git(probe, ['commit', '--allow-empty', '-m', 'probe']);

    expect(r.code).not.toBe(0);
    expect(git(repoRoot, ['rev-parse', 'HEAD']).stdout.trim()).toBe(before);
    expect(git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()).toBe(branchBefore);
  });
});

describe('A10-23 the ceiling costs a real fixture nothing', () => {
  test('a clone outside the working copy still works', () => {
    // The counterpart. Fixtures live in temporary directories most of the time,
    // and the ones that do not still have to work once they hold a repository.
    const bare = seedRepo(work, 'probe');
    const clone = join(work, 'clone');
    expect(git(work, ['clone', '-q', bare, clone]).code).toBe(0);
    expect(existsSync(join(clone, '.git'))).toBe(true);
    expect(git(clone, ['rev-parse', '--is-inside-work-tree']).stdout.trim()).toBe('true');
  });

  test('and a repository inside the working copy is still found from inside itself', () => {
    // The ceiling stops the walk *above* a directory; it does not hide a
    // repository that is right there. A chain fixture that did clone keeps
    // working, which is the whole point of stopping the walk rather than
    // forbidding the place.
    const inner = join(probe, 'real');
    mkdirSync(inner, { recursive: true });
    expect(git(inner, ['init', '-q']).code).toBe(0);
    expect(git(inner, ['rev-parse', '--is-inside-work-tree']).stdout.trim()).toBe('true');
  });
});
