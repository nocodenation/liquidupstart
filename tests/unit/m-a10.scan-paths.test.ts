/**
 * A10-14, A10-15, A10-20 to A10-22 — the scan reads every path, and a template is not a secret.
 *
 * Purpose: findings 6 and 7 of Timur's code review of #9, both in the same loop,
 * duplicated in `config/agents/hooks/pre-push` and
 * `config/agents/bin/git-publish.sh`:
 *
 *   for path in $(git diff-tree -r -m --root --no-commit-id --name-only \
 *                 --diff-filter=AM "$commit" 2>/dev/null || true); do
 *     case "$base" in .env|.env.*) refuse ;; esac
 *
 * **Finding 6 — `.env.*` matches `.env.example`.** A checked-in env template is
 * the opposite of a secret: it is the file that documents which keys exist, with
 * the values left empty. This repository ships one, and its own hook would
 * refuse any commit that touched it — so an agent working on Liquid Upstart
 * could never publish a change to `.env.example`.
 *
 * **Finding 7 — the unquoted `$(…)` splits paths on whitespace.** A private key
 * committed as `deploy key.pem` becomes two words, `git show "$commit:deploy"`
 * fails, the failure is swallowed by `2>/dev/null`, and the `PRIVATE KEY` grep
 * never sees the file: the push goes through. Two further gaps ride along — the
 * unquoted expansion also globs, and git's default `core.quotePath` writes
 * non-ASCII names in escaped quotes, which `git show` then cannot resolve.
 *
 * Given  a clone whose pushes go through the hook, and the same scan in git-publish
 * When   commits add a template, a real env file, and key files whose names carry
 *        a space, a non-ASCII letter and a glob character
 * Then   the template passes, the env file is refused, and every key file is
 *        refused with its name shown
 *
 * A10-14 and A10-22 are the positive halves: the guard has to keep letting
 * ordinary work through, and a path containing `[` must not be read as a
 * pattern. A10-15 is the negative counterpart to A10-14 — without it, an
 * allowlist that swallowed `.env` itself would pass.
 *
 * Test data: `.env.example` holding `POSTGRES_PASSWORD=` (the key with no
 * value, as a template has it) and `.env.local` holding
 * `POSTGRES_PASSWORD=hunter2`. The key files are `deploy key.pem`,
 * `schlüssel.pem` and `notes[1].md`; the first two hold
 * `-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAFIXTURENOTAREALKEY\n-----END OPENSSH PRIVATE KEY-----`,
 * which has the header the scan greps for and no key in it. `notes[1].md` holds
 * the line `probe` and must reach the remote.
 *
 * Requirements covered: A10-14, A10-15, A10-20 to A10-22, findings 6 and 7 of
 * the #9 code review.
 */
import { test, expect, afterAll, describe } from 'bun:test';
import { rmSync } from 'node:fs';
import { hookFixture, commit, git, remoteFile, pushSanctioned } from '../lib/gitfixture';

const roots: string[] = [];
const fixture = () => {
  const fx = hookFixture('lu-a10-scan-');
  roots.push(fx.root);
  return fx;
};
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const FIXTURE_KEY =
  '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAFIXTURENOTAREALKEY\n-----END OPENSSH PRIVATE KEY-----\n';

describe('A10-14 a checked-in template is not a credential', () => {
  for (const name of ['.env.example', '.env.sample', '.env.template', '.env.dist']) {
    test(`${name} reaches the remote`, () => {
      const fx = fixture();
      commit(fx.clone, { [name]: 'POSTGRES_PASSWORD=\n' }, `add ${name}`);
      const r = pushSanctioned(fx.clone, ['origin', 'feature/probe']);
      expect(r.code).toBe(0);
      expect(remoteFile(fx, 'feature/probe', name)).toContain('POSTGRES_PASSWORD=');
    });
  }
});

describe('A10-15 a real env file is still refused', () => {
  for (const name of ['.env', '.env.local', '.env.production']) {
    test(`${name} is refused, and named`, () => {
      // The counterpart that keeps the allowlist honest: it lists four exact
      // names, and everything else beginning `.env.` stays refused.
      const fx = fixture();
      commit(fx.clone, { [name]: 'POSTGRES_PASSWORD=hunter2\n' }, `add ${name}`);
      const r = git(fx.clone, ['push', 'origin', 'feature/probe']);
      expect(r.code).not.toBe(0);
      expect(r.output).toContain(name);
    });
  }
});

describe('A10-20 a key file whose name carries a space is still seen', () => {
  test('the push is refused and the file is named', () => {
    // The finding: word splitting turned this into `deploy` and `key.pem`,
    // `git show "$commit:deploy"` failed into /dev/null, and the grep for the
    // key header never ran. The push went through with the key in it.
    const fx = fixture();
    commit(fx.clone, { 'deploy key.pem': FIXTURE_KEY }, 'add key with a space in its name');
    const r = git(fx.clone, ['push', 'origin', 'feature/probe']);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('deploy key.pem');
  });
});

describe('A10-21 a non-ASCII name is still seen', () => {
  test('the push is refused and the file is named', () => {
    // git's default core.quotePath wraps this name in quotes with octal escapes,
    // so `git show` could not resolve what the scan handed it. The scan now asks
    // for the unquoted form.
    const fx = fixture();
    commit(fx.clone, { 'schlüssel.pem': FIXTURE_KEY }, 'add key with a non-ascii name');
    const r = git(fx.clone, ['push', 'origin', 'feature/probe']);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('ssel.pem');
  });
});

describe('A10-22 an ordinary path with a glob character still passes', () => {
  test('it reaches the remote, unexpanded', () => {
    // The positive half of finding 7: the unquoted expansion also globbed, so a
    // path could be replaced by whatever it happened to match in the working
    // directory. Turning globbing off must not cost an ordinary file its push.
    const fx = fixture();
    commit(fx.clone, { 'notes[1].md': 'probe\n' }, 'add a file with a glob character');
    const r = pushSanctioned(fx.clone, ['origin', 'feature/probe']);
    expect(r.code).toBe(0);
    expect(remoteFile(fx, 'feature/probe', 'notes[1].md')).toContain('probe');
  });
});
