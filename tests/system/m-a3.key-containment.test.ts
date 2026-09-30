/**
 * M-A3 · System · Private key material stays in the secrets directory
 *
 * Purpose:  Section 3.1 of the feature document accepts, deliberately, that the
 *           private key sits inside the agent container. What it does not accept
 *           is the key spreading: copied into a repository, echoed into a log,
 *           or rendered into a configuration file. Each copy is a place someone
 *           could later publish by accident, and the accepted risk was for one
 *           location, not for many.
 * Given:    A running stack with the key mounted at /git-secrets.
 * When:     The workspace, the rendered configuration and the logs are searched
 *           for private key material.
 * Then:     It is found only in the secrets directory.
 * Covers:   A3-10, NFR1
 * Unhappy:  Any match outside that directory fails and names the file.
 *
 * Amended during M-A4, 2026-09-02. The search was for the words of the key
 * header alone, which a document that merely names them trips: a skill added
 * under config/agents/skills quoted A4-7's fixture data — the header with the
 * body `AAAAFIXTURENOTAREALKEY` — and was reported as a leaked key. Key material
 * is a header *and* a base64 body, so that is now what the workspace search
 * looks for. It still catches any real key copied into the tree, this stack's or
 * anyone's, and no longer fires on prose about keys.
 */
import { test, expect } from 'bun:test';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';
import { sh } from '../lib/shell';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const MARKER = 'BEGIN OPENSSH PRIVATE KEY';

stackGuard();

test('A3-10 the key is present where it belongs', () => {
  const r = inContainer('openclaw-gateway', `grep -l '${MARKER}' /git-secrets/* 2>/dev/null`);
  expect(r.stdout).toContain('/git-secrets/id_ed25519');
});

const KEY_BODY = /^[A-Za-z0-9+/]{40,}={0,2}$/m;

test('A3-10 no copy exists in the workspace or the rendered configuration', () => {
  const r = sh([
    'grep', '-rIl', '--exclude-dir=.git', '--exclude-dir=node_modules',
    MARKER, 'volumes/repos', 'config', 'dashboard/src'
  ]);
  const carryingKeyMaterial = r.stdout
    .split('\n')
    .filter((f) => f.trim() !== '')
    .filter((f) => KEY_BODY.test(readFileSync(join(repoRoot, f), 'utf8')));
  expect(carryingKeyMaterial).toEqual([]);
});

test('A3-10 no copy has leaked outside the secrets mount inside the container', () => {
  const r = inContainer(
    'openclaw-gateway',
    `grep -rIl '${MARKER}' /repos /data /bun_app /tmp 2>/dev/null; echo DONE`
  );
  expect(r.stdout.replace('DONE', '').trim()).toBe('');
});
