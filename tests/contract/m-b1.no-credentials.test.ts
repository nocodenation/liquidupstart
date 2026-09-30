/**
 * M-B1 · Contract · The builder cannot reach the credentials, checked from inside
 *
 * Purpose:  B1-1 asserts the declaration; this asserts the result. A mount can
 *           be absent from compose.yml and the path still reachable another way
 *           — an inherited environment variable, a shared parent directory —
 *           and §3.2 makes a claim about reachability, not about a file's text.
 * Given:    The running nar_builder container, and the root .env whose
 *           credential values are read here so the check is against the real
 *           secrets rather than against invented ones.
 * When:     The container is asked for /git-secrets, for any deploy key or
 *           known_hosts file on its own filesystem, and for its environment.
 * Then:     No such path exists, no environment key names a credential, and no
 *           value of a credential key in .env appears anywhere in its
 *           environment.
 * Covers:   B1-12, FR25, §3.2
 * Unhappy:  Both halves are negative by construction. The positive counterpart
 *           is B1-5: the same container, with none of this, still builds — so
 *           the boundary is not being met by a container that does nothing.
 */
import { test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { stackGuard } from '../lib/guard';
import { builderCredentialScan, BUILDER_SERVICE } from '../lib/narfixture';

stackGuard([BUILDER_SERVICE]);

const scan = builderCredentialScan();

function credentialValues(): string[] {
  const envFile = join(repoRoot, '.env');
  if (!existsSync(envFile)) return [];
  return readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .filter((m) => /PASSWORD|SECRET|TOKEN|_KEY$|^API_KEY$/.test(m[1]))
    .map((m) => m[2].replace(/^"|"$/g, '').trim())
    .filter((v) => v.length >= 8);
}

test('B1-12 the scan itself ran inside the container', () => {
  expect(scan.code).toBe(0);
  expect(scan.stdout).toContain('END');
});

test('B1-12 no /git-secrets and no key material inside the builder', () => {
  const paths = scan.stdout
    .split('KEYNAMES:')[0]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== 'PATHS:');
  expect(paths).toEqual([]);
});

test('B1-12 no environment key names a credential', () => {
  const keys = scan.stdout
    .split('KEYNAMES:')[1]
    .split('END')[0]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  expect(keys).toEqual([]);
});

test('B1-12 no credential value from .env is present in its environment', () => {
  const values = credentialValues();
  expect(values.length).toBeGreaterThan(2);
  const env = sh(['docker', 'compose', 'exec', '-T', BUILDER_SERVICE, 'env']);
  expect(env.code).toBe(0);
  const leaked = values.filter((v) => env.stdout.includes(v));
  expect(leaked).toEqual([]);
});
