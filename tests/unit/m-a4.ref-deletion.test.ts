/**
 * M-A4 · Unit · Deleting a branch on the remote is refused
 *
 * Purpose:  A deletion destroys work that no local clone need hold, it leaves
 *           nothing behind to recover from, and no use case asks an agent to do
 *           it. The pushed ref arrives at the hook with an all-zero local sha,
 *           which is the only signal that a deletion is what is being asked for.
 * Given:    hookFixture(), with feature/probe already pushed successfully — so
 *           the branch exists on the remote and the deletion is the only
 *           operation under test.
 * When:     `git push origin --delete feature/probe` runs.
 * Then:     Non-zero exit, the branch still listed on the remote, and the
 *           message names it.
 * Covers:   A4-6, U4
 * Unhappy:  The whole case. Its counterweight is the push in its own first
 *           step: the same branch, the same clone, allowed.
 * M-A6:     The pushes here that are expected to succeed mint the publication
 *           token first (pushSanctioned), because M-A6 added a hook rule
 *           refusing any push that did not come through git-publish. That
 *           rule is evaluated last, so every refusal below is still the
 *           M-A4 rule the case names, and A6-9 is what holds that order.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync } from 'node:fs';
import { hookFixture, git, remoteHas, pushSanctioned } from '../lib/gitfixture';

const fx = hookFixture('lu-a4-delete-');
afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

test('A4-6 deleting a remote branch is refused and the branch survives', () => {
  expect(pushSanctioned(fx.clone, ['origin', 'feature/probe']).code).toBe(0);
  expect(remoteHas(fx, 'refs/heads/feature/probe')).toBe(true);

  const r = git(fx.clone, ['push', 'origin', '--delete', 'feature/probe']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('feature/probe');
  expect(remoteHas(fx, 'refs/heads/feature/probe')).toBe(true);
});
