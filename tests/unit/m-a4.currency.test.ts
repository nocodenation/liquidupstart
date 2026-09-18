/**
 * M-A4 · Unit · A branch behind the remote is refused, not silently rebased
 *
 * Purpose:  FR14. An agent pushing at machine pace onto a shared branch makes
 *           every other collaborator integrate, every time. The hook could
 *           fetch and rebase by itself; it deliberately does not, because a
 *           rebase that hits a conflict rewrites history that belongs to someone
 *           else. It refuses and says which two commands the operator runs. The
 *           clone has not fetched, so it does not even hold the remote's commit
 *           — the hook has to treat an object it cannot see as commits it does
 *           not have, rather than crashing or waving the push through.
 * Given:    hookFixture(), feature/probe pushed and therefore shared.
 * When:     Another clone adds `theirs.md` on feature/probe and pushes it, then
 *           this clone commits `mine.md` without fetching and pushes; and,
 *           separately, a clone pushes with nothing having changed on the remote.
 * Then:     The first is refused, naming fetch and rebase, with the remote still
 *           at `theirs`; the second goes through.
 * Covers:   A4-11, A4-12, U4, FR14
 * Unhappy:  A4-11. A4-12 is its counterweight: a rule that refused whenever it
 *           could not prove currency would block ordinary work.
 * M-A6:     The pushes here that are expected to succeed mint the publication
 *           token first (pushSanctioned), because M-A6 added a hook rule
 *           refusing any push that did not come through git-publish. That
 *           rule is evaluated last, so every refusal below is still the
 *           M-A4 rule the case names, and A6-9 is what holds that order.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync } from 'node:fs';
import { hookFixture, commitOnRemote, commit, git, remoteSha, remoteFile, pushSanctioned } from '../lib/gitfixture';

const roots: string[] = [];
const fixture = () => {
  const fx = hookFixture('lu-a4-currency-');
  roots.push(fx.root);
  return fx;
};
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

test('A4-11 a branch the remote has moved past is refused, and the operator is told how to integrate', () => {
  const fx = fixture();
  expect(pushSanctioned(fx.clone, ['origin', 'feature/probe']).code).toBe(0);
  commitOnRemote(fx, 'feature/probe', { 'theirs.md': 'theirs\n' }, 'theirs');
  const theirs = remoteSha(fx, 'refs/heads/feature/probe');

  commit(fx.clone, { 'mine.md': 'mine\n' }, 'mine');
  const r = git(fx.clone, ['push', 'origin', 'feature/probe']);

  expect(r.code).not.toBe(0);
  expect(r.output).toContain('fetch');
  expect(r.output).toContain('rebase');
  expect(remoteSha(fx, 'refs/heads/feature/probe')).toBe(theirs);
});

test('A4-12 a branch the remote holds nothing extra on is pushed', () => {
  const fx = fixture();
  expect(pushSanctioned(fx.clone, ['origin', 'feature/probe']).code).toBe(0);
  commit(fx.clone, { 'mine.md': 'mine\n' }, 'mine');
  const local = git(fx.clone, ['rev-parse', 'HEAD']).stdout.trim();

  const r = pushSanctioned(fx.clone, ['origin', 'feature/probe']);
  expect(r.code).toBe(0);
  expect(remoteSha(fx, 'refs/heads/feature/probe')).toBe(local);
  expect(remoteFile(fx, 'refs/heads/feature/probe', 'mine.md')).toBe('mine\n');
});
