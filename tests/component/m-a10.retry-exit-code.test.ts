/**
 * A10-16, A10-17 — a Test that could not run says so, instead of repeating the last answer.
 *
 * Purpose: finding 8 of Timur's code review of #9. `runStartGitStep` ignores the
 * exit status:
 *
 *   child.on('close', () => { clearTimeout(timer); done(output); });
 *
 * `git.sh` exits 0 even when a clone fails — that case only warns. A **non-zero**
 * exit means it stopped early under `set -e`, before it rewrote the manifest:
 * key generation, host key seeding, hook installation. `readManifest()` then
 * reads the *previous* manifest, finds the entry unchanged, and the route answers
 * 200 with `still unreachable: <the error from last time>. Register the deploy
 * key…`. The operator is sent after a deploy key because `ssh-keygen` is missing,
 * and the script's own output — which says exactly that — is thrown away.
 *
 * Given  a project whose `git.sh` cannot get past its first step
 * When   a declared repository is tested from the dashboard
 * Then   the answer is a failure carrying what the script actually said, and
 *        the manifest entry is not presented as a fresh result
 * And    a run that merely fails to clone still reports the fresh entry, because
 *        that is a result and not a breakdown
 *
 * A10-17 is the counterpart that keeps A10-16 from being a blanket refusal: the
 * ordinary unhappy path — the key is not registered — must go on answering 200
 * with `ok: false` and the current error, which is what the card renders.
 *
 * Test data: `git@github.com:example/probe.git|write|protected`, a manifest
 * recording it as failed with the distinctive earlier error
 * `git@github.com: Permission denied (publickey).`, and a stub `ssh-keygen` on
 * `PATH` that prints `probe: ssh-keygen unavailable` and exits 1 — the first
 * command `git.sh` runs that can stop it. The assertion looks for that stub's
 * text, so a message merely containing the old error cannot pass.
 *
 * Requirements covered: A10-16, A10-17, finding 8 of the #9 code review.
 */
import { test, expect, afterAll, beforeEach } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, retry } from '../lib/dashboardfixture';
import {
  type Declared,
  declaredEnv,
  generateKeyPair,
  manifestEntry,
  readManifestFile,
  resetProject,
  secretsDir,
  writeManifest
} from '../lib/gitproject';
import { fakeSsh, seedKnownHosts, tempProject } from '../lib/gitfixture';

const PROBE: Declared = {
  name: 'probe',
  url: 'git@github.com:example/probe.git',
  host: 'github.com',
  path: 'example/probe',
  access: 'write',
  policy: 'protected',
  slug: 'github.com_example_probe',
  cloned: false,
  error: 'git@github.com: Permission denied (publickey).'
};

const work = tempProject('lu-a10-exit-');
const originalPath = process.env.PATH ?? '';
afterAll(() => {
  process.env.PATH = originalPath;
  rmSync(work, { recursive: true, force: true });
});

/** A bin directory whose ssh-keygen refuses, so git.sh stops at its first step. */
function brokenKeygen(): string {
  const dir = join(work, 'broken', 'bin');
  mkdirSync(dir, { recursive: true });
  const stub = join(dir, 'ssh-keygen');
  writeFileSync(stub, '#!/bin/sh\necho "probe: ssh-keygen unavailable" >&2\nexit 1\n');
  chmodSync(stub, 0o755);
  return dir;
}

beforeEach(() => {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  declaredEnv(projectDir, `${PROBE.url}|write|protected`);
  seedKnownHosts(projectDir);
  writeManifest(projectDir, [manifestEntry(PROBE)]);
  process.env.PATH = originalPath;
});

test('A10-16 a script that stopped early is reported, not the previous answer', async () => {
  // No key pair on disk, so git.sh reaches ssh-keygen -- and the stub refuses.
  expect(existsSync(join(secretsDir(projectDir), 'id_ed25519'))).toBe(false);
  process.env.PATH = `${brokenKeygen()}:${originalPath}`;

  const { status, body } = await retry(PROBE.slug);

  expect(body.ok).toBe(false);
  // Before: 200, with "still unreachable: git@github.com: Permission denied
  // (publickey). Register the deploy key…" -- an answer about a key, for a
  // machine with no ssh-keygen.
  expect(status).not.toBe(200);
  expect(body.message).toContain('ssh-keygen unavailable');
});

test('A10-16 and the stale entry is not presented as a fresh result', async () => {
  process.env.PATH = `${brokenKeygen()}:${originalPath}`;
  const before = JSON.stringify(readManifestFile(projectDir));

  const { body } = await retry(PROBE.slug);

  // The manifest is left as it was -- there is no new result to record -- and
  // the answer does not read as one either.
  expect(JSON.stringify(readManifestFile(projectDir))).toBe(before);
  expect(body.message).not.toContain('Register the deploy key');
});

test('A10-17 a clone that simply fails is still an ordinary answer', async () => {
  // The counterpart. git.sh exits 0 here: the key is not registered, which is a
  // result, and the card renders it with the key to register.
  generateKeyPair(projectDir, PROBE.slug);
  process.env.PATH = `${fakeSsh(join(work, 'refuse'), [])}:${originalPath}`;

  const { status, body } = await retry(PROBE.slug);

  expect({ status, ok: body.ok }).toEqual({ status: 200, ok: false });
  expect(body.message).toContain('Register the deploy key');
  const fresh = readManifestFile(projectDir).repositories[0];
  expect(fresh.cloned).toBe(false);
});
