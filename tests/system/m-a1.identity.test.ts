/**
 * M-A1 · System · Both harnesses commit into the workspace under one identity
 *
 * Purpose:  This is the milestone's substance: an agent in either harness can
 *           create a repository in the shared workspace and commit to it, and
 *           the commit is attributable. The two harnesses have different HOME
 *           directories (/home/node against /root), so an identity mechanism
 *           based on a global git config has to run per container while one
 *           based on environment variables does not. The test asserts the
 *           outcome and leaves the mechanism to the implementation.
 * Given:    A running stack, and no GIT_USER_NAME in .env at all.
 * When:     A repository is initialised and committed at /repos inside
 *           openclaw-gateway and inside opencode.
 * Then:     Both commits succeed, and author and committer in both equal the
 *           default declared in compose.yml.
 * Covers:   A1-6, A1-7, A1-9, FR2, FR5, NFR1
 * Unhappy:  A1-9 is the unhappy path — the configuration file the operator
 *           would normally edit is deliberately left untouched, so a commit that
 *           succeeds proves the compose defaults carry the feature alone.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { requireStack, inContainer } from '../lib/stack';
import { composeDefault } from '../lib/compose-file';
import { repoRoot } from '../lib/paths';

const NAME = composeDefault('opencode', 'GIT_USER_NAME');
const EMAIL = composeDefault('opencode', 'GIT_USER_EMAIL');
const probes: string[] = [];

const commitProbe = (service: string, repo: string) => {
  probes.push(repo);
  return inContainer(
    service,
    `cd /repos && rm -rf ${repo} && git init -q ${repo} && cd ${repo} && ` +
      `echo probe > a && git add a && git -c core.pager=cat commit -q -m probe && ` +
      `git log -1 --format='AUTHOR=%an <%ae>|COMMITTER=%cn <%ce>'`
  );
};

beforeAll(() => requireStack());
afterAll(() => {
  for (const p of probes) {
    const dir = join(repoRoot, 'volumes', 'repos', p);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

test('A1-9 the operator configuration file declares no git identity', () => {
  const env = readFileSync(join(repoRoot, '.env'), 'utf8');
  expect(env).not.toMatch(/^GIT_USER_NAME=/m);
  expect(env).not.toMatch(/^GIT_USER_EMAIL=/m);
});

test('A1-6 openclaw-gateway commits into the workspace under the configured identity', () => {
  const r = commitProbe('openclaw-gateway', 'probe-openclaw');
  expect(r.code).toBe(0);
  expect(r.stdout).toContain(`AUTHOR=${NAME} <${EMAIL}>`);
  expect(r.stdout).toContain(`COMMITTER=${NAME} <${EMAIL}>`);
});

test('A1-7 opencode commits under the same identity despite a different HOME', () => {
  const home = inContainer('opencode', 'echo $HOME');
  const otherHome = inContainer('openclaw-gateway', 'echo $HOME');
  expect(home.stdout.trim()).not.toBe(otherHome.stdout.trim());

  const r = commitProbe('opencode', 'probe-opencode');
  expect(r.code).toBe(0);
  expect(r.stdout).toContain(`AUTHOR=${NAME} <${EMAIL}>`);
  expect(r.stdout).toContain(`COMMITTER=${NAME} <${EMAIL}>`);
});
