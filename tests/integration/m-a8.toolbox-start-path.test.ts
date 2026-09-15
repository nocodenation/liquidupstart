/**
 * M-A8 · Integration · The start the dashboard's button actually runs
 *
 * Purpose:  A8-16 claims an operator can walk U2 without opening a terminal,
 *           and the first thing that operator does is press Start. That runs
 *           scripts/linux/start.sh inside the toolbox container, not on the
 *           host — dashboard/src/routes/run/+server.ts spawns it there — and
 *           start.sh line 139 calls config/scripts/start/git.sh under
 *           `set -euo pipefail`, fourteen lines before `docker compose up -d`.
 *           On 2026-09-07 the toolbox image carried no git and no openssh, so
 *           that call died at git.sh line 17 with `ssh-keygen: command not
 *           found`, exit 127, and took the whole start with it: no stack, no
 *           services, one line of output. Every start in this project's history
 *           had been run from a terminal, so nothing had ever met it.
 * Given:    A fixture project with a declared repository whose host refuses
 *           connections, so the clone fails fast and offline.
 * When:     The git step runs inside the toolbox image, as the button runs it.
 * Then:     It completes, generates both keys, writes the manifest, and nothing
 *           in its output is a missing command.
 * Covers:   A8-19, FR3, FR11, U2, U11
 * Unhappy:  The clone itself fails here and must not be an error — A3c-7's rule
 *           that an unregistered repository costs that repository and nothing
 *           else. What must not happen is the step failing to run at all.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { declaredEnv, manifestPath, newProject } from '../lib/gitproject';
import { seedKnownHosts } from '../lib/gitfixture';

// The product's own tag, deliberately. run/+server.ts builds this same image on
// first use ("Helper toolbox image not found - building it (one time only)"), so
// a throwaway tag would mean a second multi-minute build of identical layers.
const TOOLBOX = 'liquidupstart/toolbox:latest';
const SLUG = 'localhost_example_one';

const project = newProject('lu-a8-toolbox-');
let run: { code: number; output: string };

function docker(args: string[], timeout: number) {
  const p = spawnSync('docker', args, { encoding: 'utf8', timeout });
  return { code: p.status ?? -1, output: (p.stdout ?? '') + (p.stderr ?? '') };
}

beforeAll(() => {
  if (docker(['image', 'inspect', TOOLBOX], 60_000).code !== 0) {
    const built = docker(
      ['build', '-q', '-t', TOOLBOX, '-f', 'config/toolbox/Dockerfile', join(repoRoot, 'config', 'toolbox')],
      900_000
    );
    expect(built.code, `toolbox build failed:\n${built.output}`).toBe(0);
  }

  seedKnownHosts(project);
  declaredEnv(project, 'git@localhost:example/one.git|read|protected');

  run = docker(
    ['run', '--rm', '--entrypoint', 'bash', '-v', `${project}:${project}`, '-w', project,
     TOOLBOX, join(project, 'config', 'scripts', 'start', 'git.sh'), project],
    300_000
  );
});

afterAll(() => {
  spawnSync('rm', ['-rf', project]);
});

test('A8-19 the git step completes inside the toolbox', () => {
  expect(`${run.code}\n${run.output}`).toStartWith('0\n');
});

test('A8-19 and nothing it invoked was missing from the image', () => {
  // The failure class, not the two commands that happened to be missing: a
  // start script that grows a dependency the toolbox lacks fails here too.
  expect(run.output).not.toContain('command not found');
});

test('A8-19 both deploy keys are generated', () => {
  const secrets = join(project, 'volumes', '_git-secrets');
  expect(existsSync(join(secrets, 'id_ed25519.pub'))).toBe(true);
  expect(existsSync(join(secrets, 'repos', SLUG, 'id_ed25519.pub'))).toBe(true);
});

test('A8-19 the manifest is written, and names the declared repository', () => {
  const manifest = JSON.parse(readFileSync(manifestPath(project), 'utf8'));
  expect(manifest.repositories.map((r: { slug: string }) => r.slug)).toEqual([SLUG]);
});

test('A8-19 the unreachable clone is a warning naming the key, not a failure', () => {
  expect(run.output).toContain('could not clone');
  expect(run.output).toContain(join('repos', SLUG, 'id_ed25519.pub'));
});
