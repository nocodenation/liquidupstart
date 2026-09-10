/**
 * M-A3 · Unit · Key generation produces a usable key and never replaces one
 *
 * Purpose:  The deploy key is registered with GitHub by hand, so regenerating it
 *           silently revokes access the operator has already arranged. That
 *           failure would surface much later as a confusing permission error,
 *           far from its cause, which is why idempotence is asserted as firmly
 *           as generation itself.
 * Given:    A temporary project directory.
 * When:     The start script runs against it, then runs again.
 * Then:     An ed25519 keypair exists, the private key is mode 600, and the
 *           second run leaves the existing key byte-for-byte unchanged.
 * Covers:   A3-1, A3-2, FR3, NFR1
 * Unhappy:  The second run is the unhappy path — a script that overwrites here
 *           passes generation and still breaks the feature.
 *
 * Budget:   Sixty seconds, not bun's five-second default. The script generates a
 *           key *and* seeds known_hosts, which means ssh-keyscan and a call to
 *           api.github.com. Under the full suite this exceeded five seconds and
 *           turned the run red for reasons unrelated to the code — twice before
 *           it was diagnosed, once unexplained. A budget that does not cover what
 *           the test actually does produces intermittent red, and an
 *           intermittently red suite teaches everyone to ignore red.
 */
import { test, expect, afterAll } from 'bun:test';
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const script = join(repoRoot, 'config/scripts/start/git.sh');
const project = mkdtempSync(join(tmpdir(), 'lu-a3-'));
afterAll(() => rmSync(project, { recursive: true, force: true }));

const secrets = join(project, 'volumes', '_git-secrets');
const priv = join(secrets, 'id_ed25519');
const pub = join(secrets, 'id_ed25519.pub');
const mode = (p: string) => (statSync(p).mode & 0o777).toString(8);

import { START_SCRIPT_BUDGET } from '../lib/gitfixture';

const BUDGET = START_SCRIPT_BUDGET;

test('A3-1 the first run creates an ed25519 keypair', () => {
  const r = sh(['bash', script, project]);
  expect(r.code).toBe(0);
  expect(existsSync(priv)).toBe(true);
  expect(existsSync(pub)).toBe(true);
  expect(readFileSync(pub, 'utf8')).toStartWith('ssh-ed25519 ');
}, BUDGET);

test('A3-1 the private key is not readable by anyone else', () => {
  expect(mode(priv)).toBe('600');
});

test('A3-2 a second run leaves the existing key untouched', () => {
  const before = readFileSync(priv);
  const beforePub = readFileSync(pub, 'utf8');
  const r = sh(['bash', script, project]);
  expect(r.code).toBe(0);
  expect(readFileSync(priv).equals(before)).toBe(true);
  expect(readFileSync(pub, 'utf8')).toBe(beforePub);
}, BUDGET);
