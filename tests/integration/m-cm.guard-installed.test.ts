/**
 * M-CM · Integration · The guard git actually runs, in a repository git actually commits to
 *
 * Purpose:  The unit cases hand the hook a file and read its verdict. **Two
 *           defects lived precisely where that cannot look**, and both reached
 *           the same state: the guard silently off.
 *
 *           **One.** The hook dropped every line beginning with `#`, on the
 *           premise that git strips them. Git strips them only under
 *           `--cleanup=strip`, which is the default *when the message comes from
 *           an editor*. With `-m` or `-F` -- how an agent commits -- the default
 *           is `whitespace` and the lines are stored. Measured by the reviewer on
 *           2026-10-20: `git commit -m 'docs: x' -m '#18 is merged, and this
 *           closes #20'` committed with rc 0, message intact.
 *
 *           **Two.** `install.sh` set `core.hooksPath` to
 *           `<main working tree>/scripts/hooks`, which is content of a checkout.
 *           With the main tree on a branch that predates the guard the directory
 *           is empty, git finds no hooks and proceeds. Reproduced: install, add a
 *           worktree, check out `e3a391a` in the main tree, and the worktree
 *           committed `both are merged and resolved: #18` with rc 0. Every other
 *           open branch of this repository predates `scripts/hooks`, so
 *           `gh pr checkout <n>` was enough to disarm it.
 *
 *           A hook is only a guard if git runs it. So these cases install it the
 *           way an operator does and then commit, in throwaway clones.
 * Given:    a `git clone` of this repository in a temporary directory, carrying
 *           this branch's `scripts/hooks`, and `scripts/hooks/install.sh` run in
 *           it exactly as an operator runs it
 * When:     commits are made with `-m`, with `-F`, from a worktree, and with the
 *           main tree moved to a commit that has no `scripts/hooks`; and when the
 *           installer is given a foreign `core.hooksPath`, a second run, a tree
 *           without the hook, and a sabotaged copy
 * Then:     a message that would close a reference is refused by git itself; the
 *           installer's five outcomes are each what it says; and `--check`
 *           answers whether the guard is on rather than leaving it to memory
 * Covers:   CM-4, CM-5
 * Negative: The refusals, and item 2's checkout scenario is the one that carries
 *           the round: it is the exact state the feature document claimed the
 *           design ruled out. Their counterparts are that ordinary prose still
 *           commits, and that a re-run of the installer changes nothing -- a
 *           guard that refused every commit would satisfy every refusal here.
 *
 * Test data, stated. The refused message is the incident's own sentence,
 *           `both are merged and resolved: #18`, as a `-m` body. The `#`-line
 *           message is `#18 is merged, and this closes #20`, also a `-m` body.
 *           The message that must commit is `the #18 conflict, answered on #19`.
 *           The commit the main tree moves to is **`e3a391a`**, this branch's
 *           merge base, chosen because it is the newest commit in this
 *           repository's history that carries no `scripts/hooks` -- so the
 *           scenario is this repository's real state and not a constructed one.
 *           The foreign hooks path is `/elsewhere`, which cannot exist.
 *
 * Why a clone and not a fixture repository: the installer reads
 *           `git rev-parse --git-common-dir` and the checkout's own
 *           `scripts/hooks`, and the staleness check reads
 *           `origin/main:config/agents/hooks/commit-msg`. A hand-built repository would
 *           have to simulate all three, and simulating the thing under test is
 *           how the first version of this guard came to be tested against its own
 *           assumptions.
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, writeFileSync, chmodSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

// The newest commit in this repository that carries no scripts/hooks: this
// branch's merge base with main.
const BEFORE_THE_GUARD = 'e3a391a';
const REFUSED = 'both are merged and resolved: #18';
const HASH_LINE = '#18 is merged, and this closes #20';
const PASSES = 'the #18 conflict, answered on #19';

let work: string;
let clone: string;
let tree: string;

const git = (cwd: string, ...args: string[]) => sh(['git', ...args], cwd);

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'lu-cm-installed-'));
  clone = join(work, 'clone');
  expect(git(work, 'clone', '--quiet', repoRoot, clone).code, 'clone failed').toBe(0);
  // The branch under test, by its content rather than by its name: the clone's
  // HEAD is whatever the source checkout had, so the hooks are copied in from
  // this working tree to make the case independent of what is committed here.
  // The two files under test, copied in from this working tree so the case
  // measures the code under review rather than whatever the clone's HEAD holds.
  // `mkdirSync` because a source checkout on another branch has neither
  // directory, and a bare ENOENT names nothing.
  for (const [from, to] of [
    ['config/agents/hooks/commit-msg', ['config', 'agents', 'hooks', 'commit-msg']],
    ['scripts/hooks/install.sh', ['scripts', 'hooks', 'install.sh']]
  ] as Array<[string, string[]]>) {
    const target = join(clone, ...to);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(repoRoot, from), 'utf8'));
    chmodSync(target, 0o755);
  }
  git(clone, 'config', 'user.email', 'probe@example.invalid');
  git(clone, 'config', 'user.name', 'probe');
  // Committed so that a later checkout of BEFORE_THE_GUARD is not refused for
  // local modifications -- the override is what it is for.
  //
  // **`--allow-empty`, and this file never ran green without it.** The clone is
  // of this same branch, so when the working tree is clean the two files copied
  // above are byte-identical to the index and `git add -A` stages nothing: the
  // commit exits 1 with `nothing to commit`, the assertion fails, and all twelve
  // cases go with it. It passed only for somebody holding uncommitted edits to
  // those two files, which is the author's state while iterating -- so the
  // "12 / 0" first recorded for this file was measured against a dirty tree and
  // was never true of what was committed. Found by a review on 2026-10-20.
  git(clone, 'add', '-A');
  expect(
    sh(['git', 'commit', '-q', '--allow-empty', '-m', 'probe: the hooks under test'], clone, {
      ALLOW_CLOSING_KEYWORD: '1'
    }).code
  ).toBe(0);
  tree = join(work, 'tree');
  expect(git(clone, 'worktree', 'add', '--quiet', tree, '--detach', 'HEAD').code).toBe(0);
  git(tree, 'config', 'user.email', 'probe@example.invalid');
  git(tree, 'config', 'user.name', 'probe');
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

function install(...args: string[]) {
  return sh(['bash', join(clone, 'scripts/hooks/install.sh'), ...args], clone);
}

function commit(cwd: string, subject: string, body: string) {
  return sh(['git', 'commit', '--allow-empty', '-m', subject, '-m', body], cwd);
}

describe('CM-4 the installer puts the guard where no checkout can empty it', () => {
  test('CM-4 it installs into the shared hooks directory and self-tests', () => {
    const r = install();
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('self-test: refuses a closing keyword');
    // The shared directory, which every worktree of the clone uses and no branch
    // carries. The old answer was a path inside the checkout.
    expect(existsSync(join(clone, '.git', 'hooks', 'commit-msg'))).toBe(true);
    expect(r.output).not.toContain(join(clone, 'config/agents/hooks'));
  });

  test('CM-4 and it writes the source blob id beside the copy, so staleness is computable', () => {
    const stamp = join(clone, '.git', 'hooks', 'commit-msg.blob');
    expect(existsSync(stamp)).toBe(true);
    const blob = readFileSync(stamp, 'utf8').trim();
    expect(blob).toMatch(/^[0-9a-f]{40}$/);
    // And it is the id of what was installed, not of something else.
    expect(blob).toBe(
      git(clone, 'hash-object', join(clone, 'config/agents/hooks/commit-msg')).stdout.trim()
    );
  });

  test('CM-4 the counterpart: a second run is idempotent', () => {
    const r = install();
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('self-test:');
  });

  test('CM-4 the negative: a foreign core.hooksPath is refused and left alone', () => {
    git(clone, 'config', 'core.hooksPath', '/elsewhere');
    try {
      const r = install();
      expect(r.code).toBe(2);
      expect(r.output).toContain('/elsewhere');
      expect(git(clone, 'config', '--get', 'core.hooksPath').stdout.trim()).toBe('/elsewhere');
    } finally {
      git(clone, 'config', '--unset', 'core.hooksPath');
      expect(install().code).toBe(0);
    }
  });

  test('CM-4 the negative: a sabotaged copy fails the self-test rather than reporting success', () => {
    const installed = join(clone, '.git', 'hooks', 'commit-msg');
    const keep = readFileSync(installed, 'utf8');
    try {
      writeFileSync(installed, '#!/bin/sh\nexit 0\n');
      chmodSync(installed, 0o755);
      const r = install('--check');
      expect(r.code).toBe(1);
      expect(r.output).toContain('OFF or broken');
    } finally {
      writeFileSync(installed, keep);
      chmodSync(installed, 0o755);
    }
  });

  test('CM-4 and --check answers whether the guard is on, so nobody has to remember', () => {
    // The author's own comment on this pull request said the guard was off on
    // their machine, and that fact could only be remembered. Now it is asked.
    const r = install('--check');
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('guard: on');
  });
});

describe('CM-5 git itself refuses the message, from a worktree and with the main tree moved', () => {
  test('CM-5 a -m body that would close a reference is refused by git', () => {
    const r = commit(clone, 'docs: x', REFUSED);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('commit-msg refused this message');
  });

  test('CM-5 the negative that a unit case cannot see: a # line is stored by -m, so it is read', () => {
    // Measured at rc 0 before the repair, with the line committed intact.
    const r = commit(clone, 'docs: x', HASH_LINE);
    expect(r.code, r.output).not.toBe(0);
    expect(r.output).toContain('closes #20');
  });

  test('CM-5 and through -F as well, which is the other way an agent commits', () => {
    const file = join(work, 'msg');
    writeFileSync(file, `docs: y\n\n${HASH_LINE}\n`);
    const r = sh(['git', 'commit', '--allow-empty', '-F', file], clone);
    expect(r.code, r.output).not.toBe(0);
  });

  test('CM-5 the counterpart: ordinary prose naming the same numbers commits', () => {
    // Without this the whole file would be satisfied by a guard that refused
    // every commit, which is the failure mode of a guard nobody can use.
    const r = commit(clone, 'docs: x', PASSES);
    expect(r.code, r.output).toBe(0);
  });

  test('CM-5 the negative that was the blocking finding: the main tree moves, the worktree still refuses', () => {
    // install, add a worktree, check out a commit with no guard in the
    // main tree, commit from the worktree. This was rc 0 and committed.
    expect(git(clone, 'checkout', '--quiet', BEFORE_THE_GUARD).code, 'checkout failed').toBe(0);
    try {
      expect(existsSync(join(clone, 'config', 'agents', 'hooks', 'commit-msg'))).toBe(false);
      const r = commit(tree, 'docs: x', REFUSED);
      expect(r.code, r.output).not.toBe(0);
      expect(r.output).toContain('commit-msg refused this message');
      // And the counterpart in the same state, so this is not a worktree that
      // refuses everything.
      expect(commit(tree, 'docs: x', PASSES).code).toBe(0);
    } finally {
      git(clone, 'checkout', '--quiet', '-');
    }
  });

  test('CM-5 and a local merge message is read too, which is how 3a2ef0f-shaped commits arrive', () => {
    // A real divergence, not a branch pointing at HEAD: `git merge` of an
    // ancestor is "Already up to date" and runs no hook, which is how the first
    // version of this case passed for the wrong reason.
    const base = git(clone, 'rev-parse', 'HEAD').stdout.trim();
    expect(git(clone, 'checkout', '--quiet', '-b', 'cm-side').code).toBe(0);
    expect(
      sh(['git', 'commit', '--allow-empty', '-q', '-m', 'probe: a side commit'], clone).code
    ).toBe(0);
    expect(git(clone, 'checkout', '--quiet', base).code).toBe(0);
    try {
      const bad = sh(['git', 'merge', '--no-ff', '-m', 'Merge cm-side, fixes #21', 'cm-side'], clone);
      expect(bad.code, bad.output).not.toBe(0);
      expect(bad.output).toContain('commit-msg refused this message');
      sh(['git', 'merge', '--abort'], clone);
      // The counterpart: the same merge with prose instead of an instruction.
      const ok = sh(['git', 'merge', '--no-ff', '-m', 'Merge cm-side, the #21 round', 'cm-side'], clone);
      expect(ok.code, ok.output).toBe(0);
    } finally {
      sh(['git', 'merge', '--abort'], clone);
      git(clone, 'branch', '-D', 'cm-side');
    }
  });
});
