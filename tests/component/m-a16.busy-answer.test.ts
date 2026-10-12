/**
 * M-A16 · Component · What a busy repository is told to the operator and to an agent
 *
 * Purpose:  The other half of finding 1. `git.sh` no longer records a refused
 *           lock as a clone result, and this case holds what the two readers of
 *           that decision now say. Before the fix `retryRepository` answered
 *           **200** with "…is still unreachable: another run is preparing it …
 *           Register the deploy key below", merged `cloned: false` into the
 *           manifest for a repository that was cloned and healthy, and
 *           `git-repo-info` then told every agent `clone (missing)` and
 *           instructed it to ask the operator for a deploy key. Measured on
 *           2026-09-21 against the unfixed code; the agent-facing half is not
 *           in the review and is the worse of the two, because an agent acts on
 *           it without a person in the loop.
 * Given:    One declared repository, recorded in the manifest as cloned, and a
 *           lock directory holding `some-other-container:7` — an identity this
 *           machine is not, so the lock can only be honoured, and a pid that is
 *           certainly alive on the host to make the old code take it over.
 * When:     The dashboard's Test runs against it, and `git-repo-info` is then
 *           asked about it.
 * Then:     The answer is 409 and says another run is preparing it; the manifest
 *           is unchanged; and the agent is still told the clone is there.
 * Covers:   A16-3, A16-4, FR3, FR11, U1, U2
 * Unhappy:  Both cases are negative. Their counterpart is A16-2 in
 *           `m-a16.lock-outcome.test.ts` — the same Test with no lock in the
 *           way answers 200 and does write its result.
 */
import { test, expect, describe, afterAll, beforeEach } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { retry } from '../lib/dashboardfixture';
import {
  SKILLS,
  declaredEnv,
  generateKeyPair,
  manifestPath,
  newProject,
  resetProject,
  secretsDir,
  writeManifest
} from '../lib/gitproject';
import { seedKnownHosts, askRepoCommand } from '../lib/gitfixture';

// Its own project, not the one `dashboardfixture` shares. A lock directory is
// state that `resetProject` does not remove, and `bun test` runs every file in
// one process -- so seeding one into the shared project reached cases in other
// files that had nothing to do with it. Found on 2026-09-21: five config-view
// cases and eight served-card cases went red in the full suite while every one
// of them passed alone.
const projectDir = newProject('lu-a16-busy-');
const lockDir = join(secretsDir(projectDir), 'locks', SKILLS.slug);
const cloneDir = join(projectDir, 'volumes', 'repos', 'agent-skills');
const previousEnvDir = process.env.ENV_DIR;
let before = '';

// beforeEach, like every other case that drives a route: the fixture is
// re-established for each of them, so nothing depends on the order they run in.
beforeEach(() => {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  seedKnownHosts(projectDir);
  declaredEnv(projectDir, `${SKILLS.url}|${SKILLS.access}|${SKILLS.policy}`);
  generateKeyPair(projectDir, SKILLS.slug);
  // The repository the operator would be testing: declared, cloned, healthy.
  writeManifest(projectDir, [{ ...SKILLS, cloned: true, error: null }]);
  mkdirSync(cloneDir, { recursive: true });
  // Held by something this machine cannot ask about.
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, 'pid'), 'some-other-container:7');
  before = readFileSync(manifestPath(projectDir), 'utf8');
});

afterAll(() => {
  if (previousEnvDir === undefined) delete process.env.ENV_DIR;
  else process.env.ENV_DIR = previousEnvDir;
  rmSync(projectDir, { recursive: true, force: true });
});

describe('A16-3 the operator is told the repository is busy, not unreachable', () => {
  test('409, and the words name what is actually happening', async () => {
    const { status, body } = await retry(SKILLS.slug);
    expect(status).toBe(409);
    expect(body.message).toContain('being prepared by another run');
    // The two sentences that were wrong: one about reachability, one sending
    // the operator to a settings page for a key that is already registered.
    expect(body.message).not.toContain('still unreachable');
    expect(body.message).not.toContain('Register the deploy key');
  }, 30_000);

  test('and nothing was merged into the manifest', () => {
    expect(readFileSync(manifestPath(projectDir), 'utf8')).toBe(before);
  });
});

describe('A16-4 an agent is not sent after a deploy key either', () => {
  test('git-repo-info still describes the clone it has', () => {
    const r = askRepoCommand(manifestPath(projectDir), ['agent-skills']);
    expect(r.code).toBe(0);
    expect(r.output).not.toContain('(missing)');
    expect(r.output).not.toContain('register the deploy key');
  });
});
