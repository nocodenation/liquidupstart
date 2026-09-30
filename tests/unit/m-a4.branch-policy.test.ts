/**
 * M-A4 · Unit · The branch rule follows the declared policy, not a slogan
 *
 * Purpose:  §1.3 lets a repository declare `protected` or `direct`, and the hook
 *           has to enforce what was declared rather than the familiar "never
 *           push to main". Content mode (§1.2) writes the default branch as its
 *           normal working mode, so a blanket ban would forbid a working mode
 *           the use cases require. The default branch is read from the clone's
 *           refs/remotes/origin/HEAD, never assumed to be `main`.
 * Given:    hookFixture(): a bare `remote.git` on `main` holding the seed commit,
 *           a clone of it configured access=write, policy=protected,
 *           core.hooksPath pointing at config/agents/hooks, and a branch
 *           feature/probe carrying `notes.md` with the line `probe`.
 * When:     The feature branch is pushed under `protected`, the default branch
 *           is pushed under `protected`, and the default branch is pushed under
 *           `direct`.
 * Then:     First and third succeed; the second is refused, naming the branch,
 *           the policy and what to do instead.
 * Covers:   A4-1, A4-2, A4-3, U3, U4, §1.2, §1.3
 * Unhappy:  A4-2. Its counterweights are A4-1 (another branch, same policy) and
 *           A4-3 (the same branch, the other policy), so a refusal is
 *           attributable to the one setting each case names.
 * M-A6:     The pushes here that are expected to succeed mint the publication
 *           token first (pushSanctioned), because M-A6 added a hook rule
 *           refusing any push that did not come through git-publish. That
 *           rule is evaluated last, so every refusal below is still the
 *           M-A4 rule the case names, and A6-9 is what holds that order.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync } from 'node:fs';
import { hookFixture, commit, git, remoteSha, remoteHas, pushSanctioned } from '../lib/gitfixture';

const roots: string[] = [];
const fixture = () => {
  const fx = hookFixture('lu-a4-policy-');
  roots.push(fx.root);
  return fx;
};
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

test('A4-1 a feature branch under a protected policy is pushed without a word from the hook', () => {
  const fx = fixture();
  const r = pushSanctioned(fx.clone, ['origin', 'feature/probe']);
  expect(r.code).toBe(0);
  expect(remoteHas(fx, 'refs/heads/feature/probe')).toBe(true);
  expect(r.output).not.toContain('pre-push');
});

test('A4-2 the default branch under a protected policy is refused, and says what to do instead', () => {
  const fx = fixture();
  const seed = remoteSha(fx, 'refs/heads/main');
  git(fx.clone, ['checkout', '-q', 'main']);
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  const r = git(fx.clone, ['push', 'origin', 'main']);
  expect(r.code).not.toBe(0);
  expect(remoteSha(fx, 'refs/heads/main')).toBe(seed);
  expect(r.output).toContain('main');
  expect(r.output).toContain('protected');
  expect(r.output).toContain('feature branch');
});

test('A4-3 the default branch under a direct policy is allowed, as content mode requires', () => {
  const fx = fixture();
  git(fx.clone, ['config', 'liquidupstart.policy', 'direct']);
  git(fx.clone, ['checkout', '-q', 'main']);
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  const local = git(fx.clone, ['rev-parse', 'HEAD']).stdout.trim();
  const r = pushSanctioned(fx.clone, ['origin', 'main']);
  expect(r.code).toBe(0);
  expect(remoteSha(fx, 'refs/heads/main')).toBe(local);
});
