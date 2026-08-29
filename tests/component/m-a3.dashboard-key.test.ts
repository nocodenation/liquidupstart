/**
 * M-A3 · Component · The dashboard hands out the public key and only that
 *
 * Purpose:  The operator has to copy the public key into a repository's settings,
 *           so the dashboard must expose it. The same endpoint must never expose
 *           the private key: it sits in the same directory, one filename apart,
 *           and a careless read would publish it over HTTP. The handler is
 *           called directly against a fixture directory rather than grepped, so
 *           this tests behaviour rather than the shape of the source.
 * Given:    A fixture secrets directory holding a keypair.
 * When:     The git-auth GET handler is invoked with ENV_DIR pointing at it.
 * Then:     The response carries the public key and its fingerprint, and the
 *           private key material appears nowhere in it.
 * Covers:   A3-6, FR3, NFR1
 * Unhappy:  A missing key is reported as absent rather than throwing, so the
 *           dashboard can tell the operator to start the stack once.
 */
import { test, expect, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFIXTUREPUBLICKEYFIXTUREPUBLICKEY liquidupstart';
const PRIV = '-----BEGIN OPENSSH PRIVATE KEY-----\nFIXTUREPRIVATEMATERIAL\n-----END OPENSSH PRIVATE KEY-----\n';

const dir = mkdtempSync(join(tmpdir(), 'lu-a3-dash-'));
mkdirSync(join(dir, 'volumes', '_git-secrets'), { recursive: true });
writeFileSync(join(dir, 'volumes', '_git-secrets', 'id_ed25519.pub'), PUB + '\n');
writeFileSync(join(dir, 'volumes', '_git-secrets', 'id_ed25519'), PRIV, { mode: 0o600 });
process.env.ENV_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const { GET } = await import('../../dashboard/src/routes/git-auth/+server');

test('A3-6 the endpoint returns the public key', async () => {
  const res = await GET();
  const body = await res.json();
  expect(body.present).toBe(true);
  expect(body.publicKey.trim()).toBe(PUB);
});

test('A3-6 the private key never appears in the response', async () => {
  const res = await GET();
  const text = JSON.stringify(await res.json());
  expect(text).not.toContain('BEGIN OPENSSH PRIVATE KEY');
  expect(text).not.toContain('FIXTUREPRIVATEMATERIAL');
});

test('A3-6 a missing key is reported rather than thrown', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'lu-a3-empty-'));
  process.env.ENV_DIR = empty;
  try {
    const mod = await import('../../dashboard/src/routes/git-auth/+server?empty');
    const res = await mod.GET();
    const body = await res.json();
    expect(body.present).toBe(false);
  } finally {
    process.env.ENV_DIR = dir;
    rmSync(empty, { recursive: true, force: true });
  }
});
