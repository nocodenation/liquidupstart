/**
 * M-A3 · Contract · Host key verification rests on a real trust anchor
 *
 * Purpose:  Pre-seeding known_hosts is only worth anything if host key checking
 *           stays on, and only trustworthy if the seeded keys are GitHub's. The
 *           two assertions belong together: disabling the check would make the
 *           file decorative, and seeding an unverified key would make the check
 *           meaningless. The fingerprints are compared against the ones GitHub
 *           publishes at api.github.com/meta rather than a constant copied into
 *           this repository, so the test still holds when GitHub rotates a key.
 * Given:    A generated volumes/_git-secrets/known_hosts.
 * When:     Its github.com entries are fingerprinted and compared with the
 *           published set, and the repository is searched for a disabled check.
 * Then:     Every seeded github.com key is one GitHub publishes, and the
 *           disabling option appears nowhere on the configuration surface —
 *           compose.yml, config/, scripts/ and the dashboard source. The test
 *           tree is excluded on purpose: assertions about a forbidden string
 *           necessarily contain it.
 * Covers:   A3-3, A3-4, FR4
 * Unhappy:  A seeded key GitHub does not publish fails the comparison, which is
 *           the machine-in-the-middle case this exists for.
 */
import { test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const knownHosts = join(repoRoot, 'volumes/_git-secrets/known_hosts');

test('A3-3 known_hosts is seeded with github.com entries', () => {
  expect(existsSync(knownHosts)).toBe(true);
  const text = readFileSync(knownHosts, 'utf8');
  expect(text).toContain('github.com');
  expect(text.trim().split('\n').filter((l) => l.trim() && !l.startsWith('#')).length).toBeGreaterThan(0);
});

test('A3-3 every seeded github.com key is one GitHub publishes', () => {
  const published = sh([
    'curl', '-s', '--max-time', '20', 'https://api.github.com/meta'
  ]);
  expect(published.code).toBe(0);
  const fps: string[] = Object.values(
    JSON.parse(published.stdout).ssh_key_fingerprints as Record<string, string>
  ).map((f) => `SHA256:${f}`);
  expect(fps.length).toBeGreaterThan(0);

  const listed = sh(['ssh-keygen', '-l', '-f', knownHosts]);
  expect(listed.code).toBe(0);
  const seeded = listed.stdout
    .trim()
    .split('\n')
    .filter((l) => l.includes('github.com'))
    .map((l) => l.split(/\s+/)[1]);
  expect(seeded.length).toBeGreaterThan(0);
  for (const f of seeded) expect(fps).toContain(f);
});

test('A3-4 host key checking is never disabled anywhere in the repository', () => {
  const r = sh([
    'grep', '-rIl', '--exclude-dir=node_modules', 'StrictHostKeyChecking=no',
    'compose.yml', 'config', 'scripts', 'dashboard/src'
  ]);
  expect(r.stdout.trim()).toBe('');
});
