/**
 * M-A8 · Component · The launchpad's page data carries the repositories
 *
 * Purpose:  The git-auth route has been complete and unread since M-A3 —
 *           `git grep 'git-auth' -- dashboard/src` returns nothing — and a
 *           component test on the route passes whether or not anything calls
 *           it, which is exactly how the gap survived four milestones.
 *           Asserting the launchpad's own page data puts the wiring under test.
 *           The same load reads a directory holding both halves of every
 *           keypair, so it is also the second path by which private material
 *           could reach a browser, and U11 — a key that stopped working — has
 *           no coverage anywhere in this suite.
 * Given:    A fixture project declaring
 *           git@github.com:nocodenation/liquid-flows.git|write|protected and
 *           git@github.com:nocodenation/agent-skills.git|read|direct, with real
 *           ed25519 keypairs generated beside a manifest that records the first
 *           as cloned and the second as failed with
 *           "git@github.com: Permission denied (publickey). fatal: Could not
 *           read from remote repository."
 * When:     The launchpad's load runs with ENV_DIR pointing at that fixture.
 * Then:     Both repositories reach the page in the declaration's order with
 *           their label, access, policy, current public key and fingerprint;
 *           the failed one is marked unreachable, carries its error and offers
 *           a retry; the cloned one does none of those; and no private key
 *           material appears anywhere in the payload.
 * Covers:   A8-4, A8-5, A8-8, A8-9, FR3, FR11, NFR1, U1, U2, U11
 * Unhappy:  A8-5 searches the serialised payload for the private halves that
 *           sit one filename away from the keys it does publish, and A8-9 is
 *           the counterpart that stops A8-8 passing on a card which flags
 *           everything.
 */
import { test, expect, beforeAll, beforeEach } from 'bun:test';
import { launchpadData, projectDir } from '../lib/dashboardfixture';
import {
  FLOWS,
  SKILLS,
  generateKeyPair,
  pairProject,
  sha256Of,
  type KeyPair
} from '../lib/gitproject';
import { join } from 'node:path';

let flows: KeyPair;
let registered: KeyPair;
let current: KeyPair;
let data: any;

beforeAll(async () => {
  process.env.ENV_DIR = projectDir;
  const keys = pairProject(projectDir);
  flows = keys.flows;
  registered = keys.skills;
  current = generateKeyPair(projectDir, SKILLS.slug);
  data = await launchpadData();
});

beforeEach(() => {
  process.env.ENV_DIR = projectDir;
});

test('A8-4 both declared repositories reach the page, in the declaration order', () => {
  expect(data.git.state).toBe('ready');
  expect(data.git.repositories.map((r: any) => r.name)).toEqual([FLOWS.name, SKILLS.name]);
});

test('A8-4 each carries its label, access, policy, public key and fingerprint', () => {
  const [first, second] = data.git.repositories;

  expect(first.label).toBe('github.com/nocodenation/liquid-flows');
  expect(first.access).toBe('write');
  expect(first.policy).toBe('protected');
  expect(first.publicKey).toBe(flows.publicKey);
  expect(first.fingerprint).toContain(
    sha256Of(join(projectDir, 'volumes/_git-secrets/repos', FLOWS.slug, 'id_ed25519.pub'))
  );

  expect(second.label).toBe('github.com/nocodenation/agent-skills');
  expect(second.access).toBe('read');
  expect(second.policy).toBe('direct');
  expect(second.publicKey).toBe(current.publicKey);
  expect(second.fingerprint).toContain(
    sha256Of(join(projectDir, 'volumes/_git-secrets/repos', SKILLS.slug, 'id_ed25519.pub'))
  );
});

test('A8-4 the card is in the page data whether or not the stack is running', () => {
  expect(typeof data.running).toBe('boolean');
  expect(data.git).toBeDefined();
  expect(data.git.repositories.length).toBe(2);
});

test('A8-5 no private key material appears in the page data', () => {
  const payload = JSON.stringify(data);

  expect(payload).not.toContain('BEGIN OPENSSH PRIVATE KEY');
  for (const key of [flows, registered, current]) {
    for (const line of key.privateKey.split('\n')) {
      if (line.trim().length < 20 || line.includes('OPENSSH PRIVATE KEY')) continue;
      expect(payload).not.toContain(line.trim());
    }
  }
});

test('A8-8 the repository whose clone failed is presented as unreachable', () => {
  const skills = data.git.repositories[1];

  expect(skills.unreachable).toBe(true);
  expect(skills.error).toBe(SKILLS.error);
  expect(skills.canRetry).toBe(true);
});

test('A8-8 and it offers the key that is on disk now, not the one that was registered', () => {
  const skills = data.git.repositories[1];

  expect(skills.publicKey).toBe(current.publicKey);
  expect(skills.publicKey).not.toBe(registered.publicKey);
});

test('A8-9 the repository that cloned is not flagged and offers no retry', () => {
  const liquidFlows = data.git.repositories[0];

  expect(liquidFlows.unreachable).toBe(false);
  expect(liquidFlows.error).toBeNull();
  expect(liquidFlows.canRetry).toBe(false);
});
