/**
 * M-A4 · Unit · The diff is scanned before the push, not after
 *
 * Purpose:  A remote never forgets what reaches it, so a credential has to be
 *           caught on the way out. The two shapes that matter in this stack are
 *           a private key and a `.env` file: `.env` holds every provider key at
 *           the project root, and a deploy key is what the stack itself hands
 *           the agents. The third case is the counterweight — a scan that
 *           refuses ordinary work is not a guardrail, it is an outage.
 * Given:    hookFixture(): a clone with access=write, policy=protected, on
 *           branch feature/probe, which the remote does not yet have.
 * When:     A file holding an OpenSSH private key header is pushed, a `.env`
 *           file is pushed, and ordinary prose and a shell script are pushed.
 * Then:     The first two are refused naming the offending file; the third
 *           reaches the remote intact.
 * Covers:   A4-7, A4-8, A4-9, U3, U4, NFR1
 * Unhappy:  A4-7 and A4-8. A4-9 is their counterweight, deliberately ordinary:
 *           prose and a script, nothing base64-shaped, nothing named like a
 *           credential.
 * M-A6:     The pushes here that are expected to succeed mint the publication
 *           token first (pushSanctioned), because M-A6 added a hook rule
 *           refusing any push that did not come through git-publish. That
 *           rule is evaluated last, so every refusal below is still the
 *           M-A4 rule the case names, and A6-9 is what holds that order.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync } from 'node:fs';
import { hookFixture, commit, git, remoteFile, pushSanctioned } from '../lib/gitfixture';

const roots: string[] = [];
const fixture = () => {
  const fx = hookFixture('lu-a4-secret-');
  roots.push(fx.root);
  return fx;
};
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const FIXTURE_KEY =
  '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAFIXTURENOTAREALKEY\n-----END OPENSSH PRIVATE KEY-----\n';

test('A4-7 a commit adding a private key is refused, and the file is named', () => {
  const fx = fixture();
  commit(fx.clone, { deploy_key: FIXTURE_KEY }, 'add deploy key');
  const r = git(fx.clone, ['push', 'origin', 'feature/probe']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('deploy_key');
});

test('A4-8 a commit adding a .env file is refused, and the file is named', () => {
  const fx = fixture();
  commit(fx.clone, { '.env': 'API_KEY="fixture-not-a-real-secret"\n' }, 'add env file');
  const r = git(fx.clone, ['push', 'origin', 'feature/probe']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('.env');
});

test('A4-9 ordinary source and prose pass the scan and reach the remote', () => {
  const fx = fixture();
  commit(
    fx.clone,
    {
      'docs/notes.md': 'A note about the probe.\n',
      'bin/probe.sh': '#!/usr/bin/env sh\necho probe\n'
    },
    'add notes and a probe script'
  );
  const r = pushSanctioned(fx.clone, ['origin', 'feature/probe']);
  expect(r.code).toBe(0);
  expect(remoteFile(fx, 'refs/heads/feature/probe', 'docs/notes.md')).toBe(
    'A note about the probe.\n'
  );
  expect(remoteFile(fx, 'refs/heads/feature/probe', 'bin/probe.sh')).toContain('echo probe');
});
