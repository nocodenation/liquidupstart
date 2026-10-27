/**
 * M-A6 · Unit · The sanctioned path publishes, and refuses for one reason at a time
 *
 * Purpose:  A5-10 showed that a design an agent may or may not follow produces
 *           no observable failure: an improvised push and a correct one read the
 *           same in a transcript. M-A6 narrows the capability to one command, so
 *           the command itself has to be worth having — it publishes what the
 *           declaration permits, and each refusal names the one rule that fired
 *           and what to do about it. The three refusals here are the rules the
 *           declaration knows about (policy, namespace) and the one it does not
 *           announce at all (the secret scan), which is what makes A6-13
 *           possible.
 * Given:    publishFixture(): a bare `beta.git` seeded with `README.md` holding
 *           `seed` on `main`, and a clone configured liquidupstart.access=write,
 *           liquidupstart.policy=protected, core.hooksPath pointing at
 *           config/agents/hooks. A6-3 uses a second fixture declared `direct`.
 * When:     git-publish runs on `agent/probe` carrying `notes.md` with `probe`;
 *           on `main` under `protected`; on `main` under `direct`; on
 *           `codex/readme-line-20260903`, the literal branch name the A5-10 run
 *           produced; and on `agent/probe` carrying `deploy.key` holding the
 *           fixture private key A4-7 already uses.
 * Then:     The first and third publish and name what they published; the other
 *           three exit non-zero, each naming its own rule and a next step, and
 *           nothing they refused reaches `beta.git`.
 * Covers:   A6-1, A6-2, A6-3, A6-4, A6-5, FR17, FR19, FR20, U1, U3, §1.2, §1.3
 * Unhappy:  A6-2, A6-4 and A6-5. Their counterparts are A6-1 (the same clone,
 *           a permitted branch) and A6-3 (the same branch as A6-2 under the
 *           other policy), so a refusal is attributable to the one setting each
 *           case names rather than to the command refusing everything.
 * Data:     The key in A6-5 is the fixture from §4.2 — well formed, registered
 *           nowhere, and never printed by a test.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync } from 'node:fs';
import {
  publishFixture,
  publish,
  commit,
  git,
  remoteHas,
  remoteSha,
  remoteFile,
  FIXTURE_PRIVATE_KEY
} from '../lib/gitfixture';

const roots: string[] = [];
const fixture = (opts: { policy?: string } = {}) => {
  const fx = publishFixture({ prefix: 'lu-a6-publish-', ...opts });
  roots.push(fx.root);
  return fx;
};
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

test('A6-1 git-publish publishes a branch the declaration permits, and says what it published', () => {
  const fx = fixture();
  git(fx.clone, ['checkout', '-q', '-b', 'agent/probe']);
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  const short = git(fx.clone, ['rev-parse', '--short', 'HEAD']).stdout.trim();

  const r = publish(fx.clone);
  expect(r.output).not.toContain('refused');
  expect(r.code).toBe(0);
  expect(r.output).toContain('agent/probe');
  expect(r.output).toContain(short);
  expect(remoteHas(fx, 'refs/heads/agent/probe')).toBe(true);
  expect(remoteFile(fx, 'refs/heads/agent/probe', 'notes.md')).toBe('probe\n');
});

test('A6-2 the protected default branch is refused, naming the branch, the policy and the way forward', () => {
  const fx = fixture();
  const seed = remoteSha(fx, 'refs/heads/main');
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');

  const r = publish(fx.clone);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('main');
  expect(r.output).toContain('protected');
  expect(r.output).toContain('agent/');
  expect(remoteSha(fx, 'refs/heads/main')).toBe(seed);
});

test('A6-3 the default branch of a repository declared direct still publishes', () => {
  const fx = fixture({ policy: 'direct' });
  commit(fx.clone, { 'notes.md': 'note\n' }, 'add note');
  const local = git(fx.clone, ['rev-parse', 'HEAD']).stdout.trim();

  const r = publish(fx.clone);
  expect(r.output).not.toContain('refused');
  expect(r.code).toBe(0);
  expect(remoteSha(fx, 'refs/heads/main')).toBe(local);
});

test('A6-4 a branch outside the agent namespace is refused, naming the namespace and the branch', () => {
  const fx = fixture();
  git(fx.clone, ['checkout', '-q', '-b', 'codex/readme-line-20260903']);
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');

  const r = publish(fx.clone);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('codex/readme-line-20260903');
  expect(r.output).toContain('agent/');
  expect(remoteHas(fx, 'refs/heads/codex/readme-line-20260903')).toBe(false);
});

test('A6-5 a commit carrying a private key is refused before anything reaches the remote', () => {
  const fx = fixture();
  git(fx.clone, ['checkout', '-q', '-b', 'agent/probe']);
  commit(fx.clone, { 'deploy.key': FIXTURE_PRIVATE_KEY }, 'add deploy key');

  const r = publish(fx.clone);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('deploy.key');
  expect(r.output).toMatch(/private key/i);
  expect(r.output).not.toContain('AAAAFIXTURENOTAREALKEY');
  expect(remoteHas(fx, 'refs/heads/agent/probe')).toBe(false);
});
