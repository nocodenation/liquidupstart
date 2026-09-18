/**
 * M-A8 · Integration · A retry that still cannot authenticate reports failure
 *
 * Purpose:  The retry runs a command, and a command that fails still exits.
 *           Reporting success because the action completed is the same defect
 *           as a healthcheck that probes the wrong port: it converts a broken
 *           state into a green one, which is worse than no check at all. This
 *           is the state an operator is actually in while U11 is unfolding —
 *           the deploy key was removed at the host, or was never registered —
 *           so the answer has to be the failure and the key to register, not a
 *           reassurance.
 * Given:    A fixture project declaring
 *           git@github.com:example/unregistered.git|read|protected with its
 *           generated keypair on disk, a manifest recording it as failed, and
 *           an ssh stand-in on PATH that answers every connection with
 *           "git@github.com: Permission denied (publickey)." and exit 255 —
 *           the shape of a deploy key the host does not know.
 * When:     The git-auth retry action is invoked for that repository.
 * Then:     The clone does not appear, the manifest still reports the
 *           repository as not cloned with the authentication failure as its
 *           error, and the response says the retry failed and hands back the
 *           public key that has to be registered.
 * Covers:   A8-13, FR20, U11
 * Unhappy:  The whole case is the unhappy path; its positive counterpart is
 *           A8-11, where the same action against a reachable remote reports a
 *           clone that is on disk.
 */
import { test, expect, afterAll, beforeAll } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, retry } from '../lib/dashboardfixture';
import {
  type Declared,
  declaredEnv,
  generateKeyPair,
  manifestEntry,
  readManifestFile,
  resetProject,
  writeManifest
} from '../lib/gitproject';
import { seedKnownHosts, tempProject } from '../lib/gitfixture';

const UNREGISTERED: Declared = {
  name: 'unregistered',
  url: 'git@github.com:example/unregistered.git',
  host: 'github.com',
  path: 'example/unregistered',
  access: 'read',
  policy: 'protected',
  slug: 'github.com_example_unregistered',
  cloned: false,
  error: 'git@github.com: Permission denied (publickey).'
};

const REFUSING_SSH = `#!/bin/sh
echo "git@github.com: Permission denied (publickey)." >&2
exit 255
`;

const work = tempProject('lu-a8-refused-');
const reposDir = join(projectDir, 'volumes', 'repos');
let originalPath: string;
let publicKey: string;
let response: { status: number; body: any };

beforeAll(async () => {
  const bin = join(work, 'refusing-bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'ssh'), REFUSING_SSH);
  chmodSync(join(bin, 'ssh'), 0o755);
  originalPath = process.env.PATH ?? '';
  process.env.PATH = `${bin}:${originalPath}`;

  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  declaredEnv(projectDir, `${UNREGISTERED.url}|read|protected`);
  publicKey = generateKeyPair(projectDir, UNREGISTERED.slug).publicKey;
  seedKnownHosts(projectDir);
  writeManifest(projectDir, [manifestEntry(UNREGISTERED)]);
  mkdirSync(reposDir, { recursive: true });

  response = await retry(UNREGISTERED.name);
});

afterAll(() => {
  process.env.PATH = originalPath;
  rmSync(work, { recursive: true, force: true });
});

test('A8-13 the response reports the retry as failed rather than as done', () => {
  expect(response.body.ok).toBe(false);
  expect(response.body.repository.cloned).toBe(false);
  expect(response.body.repository.unreachable).toBe(true);
});

test('A8-13 the error is the authentication failure, not a generic one', () => {
  const entry = readManifestFile(projectDir).repositories[0];

  expect(entry.cloned).toBe(false);
  expect(entry.error).toContain('Permission denied (publickey)');
  expect(entry.error).toContain('Could not read from remote repository');
  expect(response.body.repository.error).toBe(entry.error);
});

test('A8-13 the public key is still offered, because that is what comes next', () => {
  expect(response.body.repository.publicKey).toBe(publicKey);
  expect(response.body.message).toContain(UNREGISTERED.path);
});

test('A8-13 no half-made clone is left behind', () => {
  expect(readdirSync(reposDir)).toEqual([]);
  expect(existsSync(join(reposDir, UNREGISTERED.name))).toBe(false);
});
