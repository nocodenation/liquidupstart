/**
 * M-A4 · Unit · The harm is the discarded commit, not the flag
 *
 * Purpose:  A pre-push hook never sees the command line, so it cannot refuse
 *           `--force`. What it can see is whether the remote's current commit is
 *           an ancestor of what is being pushed, and that is also the property
 *           that matters: a force push is harmful exactly when it discards
 *           commits that exist only on the remote. Refusing every force flag
 *           would block a harmless push and still miss the harmful one done by
 *           other means.
 * Given:    hookFixture(): bare `remote.git` on `main` at the seed commit, a
 *           clone with access=write and policy=protected, branch feature/probe
 *           carrying `notes.md` with the line `probe`.
 * When:     A diverged history is force-pushed to `main`, and an unchanged
 *           fast-forward is force-pushed to feature/probe.
 * Then:     The first is refused with the remote untouched; the second goes
 *           through, the flag notwithstanding.
 * Covers:   A4-4, A4-5, U4
 * Unhappy:  A4-4. A4-5 is its counterweight and carries the same `--force`, so
 *           the difference between them is the history, not the flag.
 * M-A6:     The pushes here that are expected to succeed mint the publication
 *           token first (pushSanctioned), because M-A6 added a hook rule
 *           refusing any push that did not come through git-publish. That
 *           rule is evaluated last, so every refusal below is still the
 *           M-A4 rule the case names, and A6-9 is what holds that order.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync } from 'node:fs';
import { hookFixture, commitOnRemote, commit, git, remoteSha, remoteHas, pushSanctioned } from '../lib/gitfixture';

const roots: string[] = [];
const fixture = () => {
  const fx = hookFixture('lu-a4-ff-');
  roots.push(fx.root);
  return fx;
};
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

test('A4-4 a push that is not a fast-forward is refused, force flag or not', () => {
  const fx = hookFixture('lu-a4-ff-');
  roots.push(fx.root);
  const seed = remoteSha(fx, 'refs/heads/main');
  commitOnRemote(fx, 'main', { 'remote.md': 'theirs\n' }, 'remote-only');
  const remoteOnly = remoteSha(fx, 'refs/heads/main');

  git(fx.clone, ['checkout', '-q', 'main']);
  git(fx.clone, ['reset', '-q', '--hard', seed]);
  commit(fx.clone, { 'local.md': 'mine\n' }, 'local-only');

  const r = git(fx.clone, ['push', '--force', 'origin', 'main']);
  expect(r.code).not.toBe(0);
  expect(remoteSha(fx, 'refs/heads/main')).toBe(remoteOnly);
  expect(r.output).toContain('discard commits that exist only on the remote');
});

test('A4-5 a fast-forward push is allowed even when it carries --force', () => {
  const fx = fixture();
  const local = git(fx.clone, ['rev-parse', 'HEAD']).stdout.trim();
  const r = pushSanctioned(fx.clone, ['--force', 'origin', 'feature/probe']);
  expect(r.code).toBe(0);
  expect(remoteHas(fx, 'refs/heads/feature/probe')).toBe(true);
  expect(remoteSha(fx, 'refs/heads/feature/probe')).toBe(local);
  expect(r.output).not.toContain('pre-push');
});
