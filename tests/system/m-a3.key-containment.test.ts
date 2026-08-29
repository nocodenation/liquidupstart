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
 */
import { test, expect } from 'bun:test';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';
import { sh } from '../lib/shell';

const MARKER = 'BEGIN OPENSSH PRIVATE KEY';

stackGuard();

test('A3-10 the key is present where it belongs', () => {
  const r = inContainer('openclaw-gateway', `grep -l '${MARKER}' /git-secrets/* 2>/dev/null`);
  expect(r.stdout).toContain('/git-secrets/id_ed25519');
});

test('A3-10 no copy exists in the workspace or the rendered configuration', () => {
  const r = sh([
    'grep', '-rIl', '--exclude-dir=.git', '--exclude-dir=node_modules',
    MARKER, 'volumes/repos', 'config', 'dashboard/src'
  ]);
  expect(r.stdout.trim()).toBe('');
});

test('A3-10 no copy has leaked outside the secrets mount inside the container', () => {
  const r = inContainer(
    'openclaw-gateway',
    `grep -rIl '${MARKER}' /repos /data /bun_app /tmp 2>/dev/null; echo DONE`
  );
  expect(r.stdout.replace('DONE', '').trim()).toBe('');
});
