/**
 * M-A6 · Component · The hook refuses a push that did not come through the path
 *
 * Purpose:  A command an agent may use is a convenience; a command it must use
 *           is a guardrail. The difference is this rule, and the rule has to be
 *           evaluated last so that a push which is wrong on its own merits is
 *           still refused for the reason that actually applies — otherwise A4-3,
 *           A5-4 and A5-5 would go on passing while asserting nothing. The proof
 *           of passage is a single-use file: written by git-publish, consumed
 *           and deleted by the hook, so one permission cannot escort two pushes.
 *           §3.1 stands: root can write that file by hand, and the point of the
 *           design is that doing so is a deliberate act with a trace.
 * Given:    publishFixture(): a bare `beta.git` seeded with `README.md` holding
 *           `seed` on `main`, and a clone declared access=write, policy=protected
 *           and governed by config/agents/hooks.
 * When:     A6-6 pushes `agent/probe` by hand with no token present. A6-7
 *           publishes the same branch through git-publish. A6-8 commits
 *           `add second note` on top and pushes by hand, on the token A6-7 spent.
 *           A6-9 pushes `main` by hand, with no token, so both the policy rule
 *           and the path rule apply and only their order decides the message.
 * Then:     A6-6 and A6-8 are refused naming git-publish; A6-7 succeeds and the
 *           token file is gone afterwards; A6-9 is refused naming `main` and
 *           `protected`, and not for the missing token.
 * Covers:   A6-6, A6-7, A6-8, A6-9, FR18, FR20, §3.1
 * Unhappy:  A6-6, A6-8 and A6-9. A6-7 is the counterpart in the same clone: the
 *           mechanism must permit as well as refuse, or it is an outage.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync } from 'node:fs';
import { publishFixture, publish, commit, git, hasToken, remoteHas, remoteSha } from '../lib/gitfixture';

const TOKEN_REFUSAL = 'did not come through git-publish';

const roots: string[] = [];
const fixture = () => {
  const fx = publishFixture({ prefix: 'lu-a6-hook-' });
  roots.push(fx.root);
  git(fx.clone, ['checkout', '-q', '-b', 'agent/probe']);
  return fx;
};
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

test('A6-6 a raw push with no token is refused, and told what to run instead', () => {
  const fx = fixture();
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');

  const r = git(fx.clone, ['push', 'origin', 'agent/probe']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('pre-push refused');
  expect(r.output).toContain('git-publish');
  expect(remoteHas(fx, 'refs/heads/agent/probe')).toBe(false);
});

test('A6-7 a push carrying a valid token is permitted, and the token is spent', () => {
  const fx = fixture();
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  const local = git(fx.clone, ['rev-parse', 'HEAD']).stdout.trim();

  const r = publish(fx.clone);
  expect(r.code).toBe(0);
  expect(remoteSha(fx, 'refs/heads/agent/probe')).toBe(local);
  expect(hasToken(fx.clone)).toBe(false);
});

test('A6-8 a second push cannot ride on the token the first one consumed', () => {
  const fx = fixture();
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  expect(publish(fx.clone).code).toBe(0);
  const first = remoteSha(fx, 'refs/heads/agent/probe');

  commit(fx.clone, { 'second.md': 'second\n' }, 'add second note');
  const r = git(fx.clone, ['push', 'origin', 'agent/probe']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('pre-push refused');
  expect(r.output).toContain('git-publish');
  expect(remoteSha(fx, 'refs/heads/agent/probe')).toBe(first);
});

test('A6-9 a push to the protected default branch is refused for being that, not for its path', () => {
  const fx = fixture();
  git(fx.clone, ['checkout', '-q', 'main']);
  const seed = remoteSha(fx, 'refs/heads/main');
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');

  const r = git(fx.clone, ['push', 'origin', 'main']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('pre-push refused');
  expect(r.output).toContain('main');
  expect(r.output).toContain('protected');
  expect(r.output).not.toContain(TOKEN_REFUSAL);
  expect(remoteSha(fx, 'refs/heads/main')).toBe(seed);
});
