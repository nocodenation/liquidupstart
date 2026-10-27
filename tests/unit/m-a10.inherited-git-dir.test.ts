/**
 * A10-24 — an inherited GIT_DIR does not reach a fixture's git.
 *
 * Purpose: A10-23 holds the ceiling that stops git walking up from a fixture into
 * this working copy. There is a second door to the same room. Git does no
 * discovery when `GIT_DIR` is set, so the ceiling never comes into it, and the
 * fixture helpers handed git the environment the suite was started in. Git
 * exports `GIT_DIR` to the hooks it runs in a linked worktree -- measured
 * 2026-10-21 with git 2.48.1 for `pre-commit`, `commit-msg`, `post-commit`,
 * `pre-push` and `post-checkout`, and every review checkout here is one. A
 * fixture-shaped commit, ceiling set, run from such a hook's `pre-push` exited 0
 * and landed on that worktree's branch. Found by the local review of #46's
 * A10-23 and recorded on #45.
 *
 * Since 2026-10-22 the variables that tell git which repository to use -- the
 * list `git rev-parse --local-env-vars` prints, less GIT_CONFIG and
 * GIT_CONFIG_COUNT, which a person sets -- are removed from the test process when
 * tests/lib/shell.ts loads, and by tests/run.sh before bun starts, so no child
 * inherits them whatever order the files load in. What a case passes on purpose
 * is applied after.
 *
 * Given  a throwaway repository, the victim, and a child bun process started
 *        with `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and `GIT_COMMON_DIR`
 *        at it, as a hook in a linked worktree would have them
 * When   the child loads the fixture library and runs a commit in an empty probe
 *        directory, ceiling at its host, through `git()`, through `sh()` and
 *        through a spawn whose environment it builds from `process.env` by hand;
 *        and seeds a repository through `seedRepo`
 * Then   all three commits answer "not a git repository", the seed lands in its
 *        own repository, and the victim's HEAD and branch are as they were
 * And    a case that passes `GIT_DIR` itself still reaches git; and a file run
 *        by tests/run.sh started with `GIT_DIR`, which loads no library, sees
 *        none
 *
 * Counterparts: the seeded repository holding its commit keeps the scrub from
 * passing by breaking the helpers; `GIT_DIR` passed on purpose keeps it from
 * passing by refusing the variable everywhere, and shows the door is real.
 *
 * Test data: the victim, `git init` in `mkdtemp` with one empty commit `base` on
 * its default branch; the host `<tmp>/host` holding the empty probe
 * `volumes/repos/.a10-24-probe`, the shape that walked up on 2026-09-17; the
 * commit `git -c commit.gpgsign=false commit --allow-empty -m probe`, with the
 * identity `Fixture <fixture@local>` passed to `sh()` as well, so a missing
 * identity cannot stand in for the refusal; `seedRepo(<tmp>, 'seeded')`; and for
 * the runner, a one-file tree whose test prints `git-dir=` and the variable, or
 * `unset`.
 *
 * Requirements covered: A10-24, and the 2026-09-17 incident by another door.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { git, tempProject } from '../lib/gitfixture';
import { REPO_LOCAL_GIT, sh } from '../lib/shell';
import { runnerPath } from '../lib/paths';
import { makeTree, dropTree } from '../lib/fixtures';

const at = { work: '', victim: '', host: '', probe: '' };
const REPO_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];
const reads = makeTree({ 'unit/m-fx.git-dir.test.ts': "import { test } from 'bun:test';\ntest('prints', () => { console.log('git-dir=' + (process.env.GIT_DIR ?? 'unset')); });\n" });
let child: { code: number; out: Record<string, { code: number; output: string }>; err: string } = { code: -1, out: {}, err: '' };
const before = { head: '', branch: '' };

afterAll(() => {
  if (at.work) rmSync(at.work, { recursive: true, force: true });
  dropTree(reads);
});

beforeAll(() => {
  at.work = tempProject('lu-a10-24-');
  at.victim = join(at.work, 'victim');
  at.host = join(at.work, 'host');
  at.probe = join(at.host, 'volumes', 'repos', '.a10-24-probe');
  mkdirSync(at.victim, { recursive: true });
  mkdirSync(at.probe, { recursive: true });
  const must = (r: { code: number; output: string }, what: string) => {
    if (r.code !== 0) throw new Error(`${what}: ${r.output}`);
  };
  must(git(at.victim, ['init', '-q']), 'git init');
  must(git(at.victim, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'base']), 'the base commit');
  before.head = git(at.victim, ['rev-parse', 'HEAD']).stdout.trim();
  before.branch = git(at.victim, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();

  const lib = (f: string) => JSON.stringify(join(import.meta.dir, '..', 'lib', f));
  const script = `
    const vars = ${JSON.stringify(REPO_VARS)};
    const inherited = Object.fromEntries(vars.map((k) => [k, process.env[k] ?? null]));
    const { git, seedRepo } = await import(${lib('gitfixture.ts')});
    const { sh } = await import(${lib('shell.ts')});
    const probe = ${JSON.stringify(at.probe)}, host = ${JSON.stringify(at.host)}, work = ${JSON.stringify(at.work)};
    const commit = ['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'probe'];
    const id = { GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@local', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@local' };
    const out = {};
    out.git = git(probe, commit, { GIT_CEILING_DIRECTORIES: host });
    out.sh = sh(['git', ...commit], probe, { ...id, GIT_CEILING_DIRECTORIES: host });
    const raw = Bun.spawnSync(['git', '-C', probe, ...commit], { env: { ...process.env, ...id, GIT_CEILING_DIRECTORIES: host }, stdout: 'pipe', stderr: 'pipe' });
    out.raw = { code: raw.exitCode, output: raw.stdout.toString() + raw.stderr.toString() };
    out.env = { inherited, after: Object.fromEntries(vars.map((k) => [k, process.env[k] ?? null])) };
    const bare = seedRepo(work, 'seeded');
    out.seeded = git(work, ['--git-dir', bare, 'log', '--format=%s', '-1']);
    out.passed = git(probe, ['rev-parse', '--git-dir'], { GIT_DIR: ${JSON.stringify(join(at.victim, '.git'))} });
    console.log(JSON.stringify(out));
  `;
  const p = Bun.spawnSync([process.execPath, '-e', script], {
    env: {
      ...process.env,
      GIT_DIR: join(at.victim, '.git'),
      GIT_WORK_TREE: at.victim,
      GIT_INDEX_FILE: join(at.victim, '.git', 'index'),
      GIT_COMMON_DIR: join(at.victim, '.git')
    },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const text = p.stdout.toString().trim().split('\n').pop() ?? '';
  child = { code: p.exitCode ?? -1, out: text.startsWith('{') ? JSON.parse(text) : {}, err: p.stderr.toString() };
});

describe('A10-24 an inherited GIT_DIR does not reach a fixture\'s git', () => {
  test('A10-24 the premise: the child inherited all four at the victim, and loading the library removed them', () => {
    // Without the first half, every refusal below could be a child that never
    // had the variables.
    expect(child.code, child.err).toBe(0);
    const v = join(at.victim, '.git');
    expect(child.out.env).toEqual({
      inherited: { GIT_DIR: v, GIT_WORK_TREE: at.victim, GIT_INDEX_FILE: join(v, 'index'), GIT_COMMON_DIR: v },
      after: { GIT_DIR: null, GIT_WORK_TREE: null, GIT_INDEX_FILE: null, GIT_COMMON_DIR: null }
    });
  });

  test('A10-24 and the variables removed are the ones git names, less the configuration a person sets', () => {
    expect({
      missing: [...REPO_VARS, 'GIT_CONFIG_PARAMETERS'].filter((k) => !REPO_LOCAL_GIT.includes(k)),
      kept: ['GIT_CONFIG', 'GIT_CONFIG_COUNT'].filter((k) => REPO_LOCAL_GIT.includes(k))
    }).toEqual({ missing: [], kept: [] });
  });

  test('A10-24 the negative: a commit through git() finds no repository', () => {
    expect(child.out.git?.code).not.toBe(0);
    expect(child.out.git?.output.toLowerCase()).toContain('not a git repository');
  });

  test('A10-24 and through sh() neither', () => {
    expect(child.out.sh?.code).not.toBe(0);
    expect(child.out.sh?.output.toLowerCase()).toContain('not a git repository');
  });

  test('A10-24 and through a spawn built from process.env by hand neither', () => {
    expect(child.out.raw?.code).not.toBe(0);
    expect(child.out.raw?.output.toLowerCase()).toContain('not a git repository');
  });

  test('A10-24 and the victim is as it was, after the seed as well', () => {
    expect({
      head: git(at.victim, ['rev-parse', 'HEAD']).stdout.trim(),
      branch: git(at.victim, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()
    }).toEqual(before);
  });

  test('A10-24 the counterpart: the seed landed in its own repository', () => {
    expect(child.out.seeded?.stdout).toContain('seed');
  });

  test('A10-24 and GIT_DIR passed on purpose still reaches git', () => {
    expect(realpathSync(child.out.passed?.output.trim() ?? '')).toBe(realpathSync(join(at.victim, '.git')));
  });

  test('A10-24 and a file run by tests/run.sh, which loads no library, does not inherit GIT_DIR either', () => {
    // The runner removes them before bun starts, so the order files load in
    // does not decide. runner() itself goes through sh(), which would remove it
    // first, so the variable is passed here on purpose.
    const r = sh([runnerPath, '--root', reads], undefined, { GIT_DIR: join(at.victim, '.git') });
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('git-dir=unset');
  });
});
