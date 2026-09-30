/**
 * M-A6 · Unit · Every other way into git-publish, so no branch of it is unproven
 *
 * Purpose:  §6 sets 100% branch coverage for this command, the standard M-A4
 *           earned, because it decides what leaves the stack. A6-1 to A6-5 cover
 *           the five paths the signed-off cases name; this file covers the rest
 *           of them, so that a decision inside the command cannot be wrong
 *           without a test going red. Each case here is also an FR20 obligation:
 *           a refusal an agent meets while getting the invocation wrong is
 *           exactly where a dead end costs most.
 * Given:    publishFixture(), and for two cases a directory that is not a
 *           repository at all.
 * When:     The command is asked for help, given two arguments, run outside a
 *           repository, run on a detached HEAD, pointed at a remote that does
 *           not exist, run in a clone declared `read`, run in a clone carrying
 *           no declaration, run with nothing new to publish, run over a commit
 *           adding `.env`, and run where the remote holds a commit the clone
 *           does not.
 * Then:     Help exits 0; every refusal exits non-zero, names its own reason and
 *           a next step, and leaves `beta.git` as it was; the empty publish
 *           exits 0 saying there was nothing to send; and the rejected push
 *           reports what refused it and leaves no token behind.
 * Covers:   §6 (M-A6 branch coverage), FR17, FR18, FR20
 * Unhappy:  All but two. The help case and the nothing-to-publish case are the
 *           counterparts that keep the command from being merely a refusal
 *           machine, and A6-1 and A6-3 carry the substantive positive halves.
 * Data:     The `.env` body is `API_KEY="fixture-not-a-real-secret"`, the same
 *           synthetic value A4-8 and A5-5 use: no real credential is written
 *           even into a temporary fixture.
 */
import { test, expect, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  publishFixture,
  publish,
  commit,
  git,
  hasToken,
  remoteHas,
  remoteSha,
  commitOnRemote
} from '../lib/gitfixture';

const roots: string[] = [];
const fixture = (opts: { access?: string; policy?: string } = {}) => {
  const fx = publishFixture({ prefix: 'lu-a6-guards-', ...opts });
  roots.push(fx.root);
  return fx;
};
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const onAgentBranch = (opts: { access?: string; policy?: string } = {}) => {
  const fx = fixture(opts);
  git(fx.clone, ['checkout', '-q', '-b', 'agent/probe']);
  return fx;
};

test('git-publish --help explains itself and exits 0', () => {
  const fx = fixture();
  const r = publish(fx.clone, ['--help']);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('Usage: git-publish');
  expect(r.stdout).toContain('agent/');
});

test('git-publish given more than a remote refuses and shows the usage', () => {
  const fx = fixture();
  const r = publish(fx.clone, ['origin', 'agent/probe']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('Usage: git-publish');
});

test('git-publish outside a repository says so and names where repositories live', () => {
  const outside = mkdtempSync(join(tmpdir(), 'lu-a6-outside-'));
  roots.push(outside);
  const r = publish(outside);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('/repos');
});

test('git-publish on a detached HEAD refuses and names the branch to make', () => {
  const fx = onAgentBranch();
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  git(fx.clone, ['checkout', '-q', '--detach', 'HEAD']);
  const r = publish(fx.clone);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('git switch -c agent/');
});

test('git-publish pointed at a remote that does not exist names the command that answers', () => {
  const fx = onAgentBranch();
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  const r = publish(fx.clone, ['upstream']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('upstream');
  expect(r.output).toContain('git-repo-info');
});

test('git-publish in a clone declared read refuses before any branch rule', () => {
  const fx = onAgentBranch({ access: 'read' });
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  const r = publish(fx.clone);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('read');
  expect(remoteHas(fx, 'refs/heads/agent/probe')).toBe(false);
});

test('git-publish in a clone carrying no declaration refuses and names git-repo-info', () => {
  const fx = onAgentBranch();
  git(fx.clone, ['config', '--unset', 'liquidupstart.access']);
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  const r = publish(fx.clone);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('git-repo-info');
  expect(remoteHas(fx, 'refs/heads/agent/probe')).toBe(false);
});

test('git-publish with nothing new to send says so and exits 0', () => {
  const fx = onAgentBranch();
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  expect(publish(fx.clone).code).toBe(0);
  const again = publish(fx.clone);
  expect(again.code).toBe(0);
  expect(again.output).toMatch(/nothing to publish/i);
  expect(hasToken(fx.clone)).toBe(false);
});

test('git-publish refuses a commit adding .env, naming the file', () => {
  const fx = onAgentBranch();
  commit(fx.clone, { '.env': 'API_KEY="fixture-not-a-real-secret"\n' }, 'add env file');
  const r = publish(fx.clone);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('git-publish refused');
  expect(r.output).toContain('.env');
  expect(remoteHas(fx, 'refs/heads/agent/probe')).toBe(false);
});

test('a push the hook rejects is reported by git-publish, and spends no token', () => {
  const fx = onAgentBranch();
  commit(fx.clone, { 'notes.md': 'probe\n' }, 'add probe note');
  expect(publish(fx.clone).code).toBe(0);
  commitOnRemote(fx, 'agent/probe', { 'theirs.md': 'theirs\n' }, 'theirs');
  const theirs = remoteSha(fx, 'refs/heads/agent/probe');
  commit(fx.clone, { 'mine.md': 'mine\n' }, 'add mine');

  const r = publish(fx.clone);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('pre-push refused');
  expect(remoteSha(fx, 'refs/heads/agent/probe')).toBe(theirs);
  expect(hasToken(fx.clone)).toBe(false);
});
