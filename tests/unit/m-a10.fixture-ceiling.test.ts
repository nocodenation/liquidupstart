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
 * **Proved without writing into this checkout, since 2026-10-21** -- the
 * operator's decision. The case made its probe directory inside this working
 * copy's `volumes/repos`, at collection and from the default tier, which promises
 * not to write there. It now proves the same property in two halves. First, that
 * the ceiling the helper's git process receives is this checkout as git itself
 * names it -- the toplevel `git rev-parse` reports from this file's own directory,
 * read only and absolute, with the fixtures' `volumes/repos` beneath it. Second, that git honours a ceiling given that way,
 * in throwaway hosts of the case's own: a plain repository and a worktree, whose
 * `.git` is a file as in the checkouts here, each with the no-ceiling counterpart
 * showing that the walk-up from the probe is real.
 *
 * Given  the helper `git()` from tests/lib/gitfixture.ts; and two throwaway hosts,
 *        a repository and a worktree of it, each holding an empty
 *        `volumes/repos/.a10-ceiling-probe`
 * When   the ceiling the helper hands git is read, and git runs in each host's
 *        probe with the ceiling at that host and with none
 * Then   the ceiling is this checkout's toplevel; under the ceiling git refuses
 *        to find a repository and the host is untouched; without it the probe
 *        resolves to the host
 * And    the helper still works in a real fixture clone, and finds a repository
 *        inside the probe from inside itself
 *
 * Counterparts: the no-ceiling case keeps the refusal from passing on a probe git
 * would never have walked up from anyway; the clone and the inner repository keep
 * it from passing on a ceiling that breaks every fixture.
 *
 * Test data: the host repository, `git init` in `mkdtemp` with one empty commit
 * `base`; the worktree host, `git worktree add` of it on a branch `wt`; in each,
 * the probe `volumes/repos/.a10-ceiling-probe`, the same shape and place as
 * `.a7-race-<pid>`, which is what walked up. The commands are `git status --short`
 * and `git commit --allow-empty -m probe`, the second being what actually
 * happened; the alias `alias.ceil=!printenv GIT_CEILING_DIRECTORIES`; and, for no
 * ceiling, `GIT_CEILING_DIRECTORIES=''` -- empty rather than unset, because the
 * helper puts this checkout's ceiling back into any environment it is handed
 * without one, and git reads an empty list as no ceiling.
 *
 * Requirements covered: A10-23, and the 2026-09-17 incident.
 *
 * Precondition: IN_GIT_REPO -- this checkout is a git repository -- for the first
 *           case alone, which asks git for this checkout's toplevel. Skipped where
 *           there is none, a release installation at `~/.liquidupstart`: there
 *           is nothing for the ceiling to protect, and an SP-2 case says so. The
 *           other cases build hosts of their own and run everywhere. SP-1, SP-2.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { git, seedRepo, tempProject } from '../lib/gitfixture';
import { REPOS_HOST } from '../lib/narfixture';
import { IN_GIT_REPO } from '../lib/preconditions';

// Paths are filled in beforeAll, so nothing is created while the file loads.
const at: { work: string; plain: string; worktree: string } = { work: '', plain: '', worktree: '' };
const probeIn = (host: string) => join(host, 'volumes', 'repos', '.a10-ceiling-probe');
const HOSTS: Array<[string, 'plain' | 'worktree']> = [
  ['a plain repository', 'plain'],
  ['a worktree, whose .git is a file', 'worktree']
];
afterAll(() => {
  if (at.work) rmSync(at.work, { recursive: true, force: true });
});

beforeAll(() => {
  // The hosts and their probes. In a hook, so a failure is a red case and not a
  // file that cannot load.
  const must = (r: { code: number; output: string }, what: string) => {
    if (r.code !== 0) throw new Error(`${what}: ${r.output}`);
  };
  at.work = tempProject('lu-a10-ceiling-');
  at.plain = join(at.work, 'host');
  at.worktree = join(at.work, 'host-worktree');
  mkdirSync(at.plain, { recursive: true });
  must(git(at.plain, ['init', '-q']), 'git init');
  must(git(at.plain, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'base']), 'the base commit');
  must(git(at.plain, ['worktree', 'add', '-q', '-b', 'wt', at.worktree]), 'git worktree add');
  // The worktree rows rest on this, so it is checked rather than assumed.
  if (!statSync(join(at.worktree, '.git')).isFile()) throw new Error(`${at.worktree}/.git is not a file`);
  for (const [, key] of HOSTS) mkdirSync(probeIn(at[key]), { recursive: true });
});

// Filed under SP-2, not A10-23, so a run without a checkout shows no pass under
// A10-23's id; it asserts the absence, so a checkout brings the case back.
test.skipIf(IN_GIT_REPO)('SP-2 A10-23\'s ceiling case needs a git checkout, which is absent here', () => {
  expect(IN_GIT_REPO).toBe(false);
});

describe('A10-23 a directory that is not a repository is not the repository above it', () => {
  test.skipIf(!IN_GIT_REPO)('the helper hands git a ceiling at this checkout, as git itself names it', () => {
    // What the helper's git process receives: a shell alias prints the variable
    // from inside it, in a directory that is no repository. The expected value is
    // not repoRoot -- the helper takes its ceiling from that same constant -- but
    // git's own read-only answer for the checkout this file lives in.
    const r = git(at.work, ['-c', 'alias.ceil=!printenv GIT_CEILING_DIRECTORIES', 'ceil']);
    // From this file's own directory, so the answer does not come from repoRoot.
    const top = git(import.meta.dir, ['rev-parse', '--show-toplevel'], { GIT_CEILING_DIRECTORIES: '' });
    expect(top.code, top.output).toBe(0);
    const toplevel = realpathSync(top.stdout.trim());
    const ceiling = r.stdout.trim();
    expect({ code: r.code, absolute: isAbsolute(ceiling) }).toEqual({ code: 0, absolute: true });
    expect(realpathSync(ceiling)).toBe(toplevel);
    // And the root the fixtures build under lies beneath it, so it is the walk
    // from there that the ceiling stops. REPOS_HOST is narfixture's; chainFixture
    // builds the same path at tests/lib/gitfixture.ts.
    const fixtures = join(realpathSync(join(REPOS_HOST, '..', '..')), 'volumes', 'repos');
    expect(relative(toplevel, fixtures).startsWith('..')).toBe(false);
  });

  test.each(HOSTS)('git in an empty directory finds nothing, rather than the host above it: %s', (_name, key) => {
    const host = at[key];
    const r = git(probeIn(host), ['status', '--short'], { GIT_CEILING_DIRECTORIES: host });
    expect(r.code).not.toBe(0);
    expect(r.output.toLowerCase()).toContain('not a git repository');
  });

  test.each(HOSTS)('and a commit there changes nothing in the host: %s', (_name, key) => {
    const host = at[key];
    // The command that did the damage. The branch and the HEAD of the host are
    // read through git's own answer rather than assumed.
    const before = git(host, ['rev-parse', 'HEAD']).stdout.trim();
    const branchBefore = git(host, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();

    const r = git(probeIn(host), ['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'probe'], {
      GIT_CEILING_DIRECTORIES: host
    });

    // Refused for the reason under test, so a commit failing on something else
    // -- a signing key, a hook -- cannot stand in for the ceiling.
    expect(r.code).not.toBe(0);
    expect(r.output.toLowerCase()).toContain('not a git repository');
    expect(git(host, ['rev-parse', 'HEAD']).stdout.trim()).toBe(before);
    expect(git(host, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()).toBe(branchBefore);
  });

  test.each(HOSTS)('while without a ceiling the same directory walks up to the host: %s', (_name, key) => {
    const host = at[key];
    // What the ceiling stops is real here, so the refusal above is the ceiling's
    // and not something about where the probe happens to be.
    const r = git(probeIn(host), ['rev-parse', '--show-toplevel'], { GIT_CEILING_DIRECTORIES: '' });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(realpathSync(host));
  });
});

describe('A10-23 the ceiling costs a real fixture nothing', () => {
  test('a clone outside the hosts still works', () => {
    // The counterpart. Fixtures live in temporary directories most of the time,
    // and the ones that do not still have to work once they hold a repository.
    const bare = seedRepo(at.work, 'probe');
    const clone = join(at.work, 'clone');
    expect(git(at.work, ['clone', '-q', bare, clone]).code).toBe(0);
    expect(existsSync(join(clone, '.git'))).toBe(true);
    expect(git(clone, ['rev-parse', '--is-inside-work-tree']).stdout.trim()).toBe('true');
  });

  test('and a repository inside the probe is still found from inside itself', () => {
    // The ceiling stops the walk *above* a directory; it does not hide a
    // repository that is right there. A chain fixture that did clone keeps
    // working, which is the whole point of stopping the walk rather than
    // forbidding the place.
    const inner = join(probeIn(at.plain), 'real');
    mkdirSync(inner, { recursive: true });
    expect(git(inner, ['init', '-q'], { GIT_CEILING_DIRECTORIES: at.plain }).code).toBe(0);
    expect(git(inner, ['rev-parse', '--is-inside-work-tree'], { GIT_CEILING_DIRECTORIES: at.plain }).stdout.trim()).toBe('true');
  });
});
