/**
 * M-A7 · Integration · Two clones publishing at the same time do not interfere
 *
 * Purpose:  The positive half of concurrency, and the one that says what
 *           "shared" means here. The proof of passage lives at
 *           `.git/liquidupstart-publish` inside each clone, so two clones have
 *           two permissions and should not see each other at all. That is a
 *           claim about the design and it has never been checked — every earlier
 *           token case works in one clone, where the claim cannot be false.
 *           FR33 requires both halves: that overlapping publications are safe or
 *           refuse (A7-4), and that publications with nothing in common are not
 *           made to refuse each other, which is this.
 * Given:    One throwaway declaration naming two local bare repositories,
 *           `git@localhost:alpha.git|write|protected,git@localhost:beta.git|write|protected`,
 *           in a temporary project under `volumes/repos/.a7-pair-<pid>`; each
 *           remote seeded from `README.md` holding `seed` on `main`, and each
 *           clone the one the start script made. In alpha's clone, `notes.md`
 *           holding `alpha` committed as `add alpha note` on `agent/probe`; in
 *           beta's, `notes.md` holding `beta` committed as `add beta note` on
 *           the same branch name — the same name on purpose, so that a token
 *           read across clones would have somewhere to go wrong. `.env` is not
 *           read or written.
 * When:     `git-publish` is started in alpha's clone and, before it has
 *           returned, in beta's; both are waited for. Then, with both finished,
 *           a permission is written by hand into alpha's clone and a raw
 *           `git push` of `agent/second` — `later.md` holding `later`, committed
 *           as `add later note` — is attempted in beta's.
 * Then:     Both publications succeed. `alpha.git` holds `agent/probe` at
 *           alpha's sha carrying `alpha`, `beta.git` holds it at beta's carrying
 *           `beta`, and neither holds the other's commit. The two permissions
 *           are two paths, one inside each clone, and neither remains once its
 *           publication has returned. The raw push in beta is refused by the
 *           hook naming `git-publish`, and alpha's hand-written permission is
 *           still there afterwards: it was neither honoured nor consumed by a
 *           push in another clone.
 * Covers:   A7-3, FR33, FR18
 * Unhappy:  The closing probe is the unhappy half and it is what makes the case
 *           more than an assumption: without it, "they share no token" would be
 *           asserted only by two publications that would also have succeeded if
 *           they had shared one. A7-4 is the milestone's other unhappy
 *           counterpart, where the two publications do share a clone.
 * Note:     `ssh` is stood in for on PATH and routes `git-upload-pack` and
 *           `git-receive-pack` to the local bare repositories; the declaration
 *           parser accepts SSH URLs only and no sshd runs here. Everything else
 *           — the clones, the hook, the identity, the command — is the stack's.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  chainFixture,
  dropChainFixture,
  commit,
  git,
  gitOnHost,
  publishOnHost,
  sanction,
  tokenPath,
  PUBLISH_TOKEN,
  START_SCRIPT_BUDGET
} from '../lib/gitfixture';

const fx = chainFixture('pair', ['alpha', 'beta'], 'host');
afterAll(() => dropChainFixture(fx));

const clones = { alpha: fx.clone('alpha'), beta: fx.clone('beta') };
const bares = { alpha: fx.bare('alpha'), beta: fx.bare('beta') };
const local: Record<string, string> = {};

if (fx.start.code === 0) {
  for (const name of ['alpha', 'beta'] as const) {
    git(clones[name], ['checkout', '-q', '-b', 'agent/probe']);
    commit(clones[name], { 'notes.md': `${name}\n` }, `add ${name} note`);
    local[name] = git(clones[name], ['rev-parse', 'HEAD']).stdout.trim();
  }
}

const alphaRun = publishOnHost(clones.alpha, fx.hostBin, { A7_SSH_DELAY: '0.5' }).then((r) => ({
  ...r,
  at: Date.now()
}));
await Bun.sleep(50);
const betaStartedAt = Date.now();
const betaRun = publishOnHost(clones.beta, fx.hostBin, { A7_SSH_DELAY: '0.5' }).then((r) => ({
  ...r,
  at: Date.now()
}));
const [alpha, beta] = await Promise.all([alphaRun, betaRun]);

const remote = (name: 'alpha' | 'beta', ref: string) =>
  git(bares[name], ['rev-parse', '--verify', '--quiet', ref]).stdout.trim();

sanction(clones.alpha);
commit(clones.beta, { 'later.md': 'later\n' }, 'add later note');
git(clones.beta, ['branch', '-q', 'agent/second']);
const crossPush = gitOnHost(clones.beta, ['push', 'origin', 'agent/second'], fx.hostBin);
const alphaTokenAfter = existsSync(tokenPath(clones.alpha));
rmSync(tokenPath(clones.alpha), { force: true });

test('A7-3 the start script made both clones from one declaration', () => {
  expect(fx.start.code).toBe(0);
  expect(fx.declaration).toContain('alpha.git');
  expect(fx.declaration).toContain('beta.git');
  for (const name of ['alpha', 'beta'] as const) {
    expect(readFileSync(`${clones[name]}/README.md`, 'utf8')).toBe('seed\n');
    expect(git(clones[name], ['config', '--get', 'liquidupstart.access']).stdout.trim()).toBe('write');
  }
}, START_SCRIPT_BUDGET);

test('A7-3 the second publication began before the first had returned', () => {
  expect(betaStartedAt).toBeLessThan(alpha.at);
  expect(betaStartedAt).toBeLessThan(beta.at);
});

test('A7-3 both publications succeed', () => {
  expect(alpha.code).toBe(0);
  expect(beta.code).toBe(0);
  expect(alpha.output).toContain('published agent/probe to origin');
  expect(beta.output).toContain('published agent/probe to origin');
});

test('A7-3 each remote holds its own commit and neither holds the other\'s', () => {
  expect(remote('alpha', 'refs/heads/agent/probe')).toBe(local.alpha);
  expect(remote('beta', 'refs/heads/agent/probe')).toBe(local.beta);
  expect(local.alpha).not.toBe(local.beta);
  expect(git(bares.alpha, ['cat-file', '-e', local.beta]).code).not.toBe(0);
  expect(git(bares.beta, ['cat-file', '-e', local.alpha]).code).not.toBe(0);
  expect(git(bares.alpha, ['show', 'agent/probe:notes.md']).stdout).toBe('alpha\n');
  expect(git(bares.beta, ['show', 'agent/probe:notes.md']).stdout).toBe('beta\n');
});

test('A7-3 the two permissions are two paths, and neither outlives its publication', () => {
  expect(tokenPath(clones.alpha)).not.toBe(tokenPath(clones.beta));
  expect(tokenPath(clones.alpha)).toEndWith(`/.git/${PUBLISH_TOKEN}`);
  expect(tokenPath(clones.beta)).toEndWith(`/.git/${PUBLISH_TOKEN}`);
  expect(existsSync(tokenPath(clones.beta))).toBe(false);
});

test('A7-3 a permission in one clone admits nothing in the other', () => {
  expect(crossPush.code).not.toBe(0);
  expect(crossPush.output).toContain('pre-push refused');
  expect(crossPush.output).toContain('did not come through git-publish');
  expect(remote('beta', 'refs/heads/agent/second')).toBe('');
  expect(alphaTokenAfter).toBe(true);
});
