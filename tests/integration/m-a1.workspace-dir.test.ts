/**
 * M-A1 · Integration · The start script creates the workspace and is repeatable
 *
 * Purpose:  The workspace directory must exist before the containers mount it,
 *           or Docker creates it root-owned and the first write fails. The start
 *           script therefore owns its creation, must be safe to run on every
 *           start, and must repair a deleted directory rather than error. The
 *           script is invoked against a throwaway project directory so the live
 *           workspace — which the running containers have mounted — is never
 *           deleted underneath them.
 * Given:    A temporary project directory.
 * When:     config/scripts/start/git.sh runs against it twice, then again after
 *           the directory is removed.
 * Then:     The directory exists with mode 777, matching volumes/data which the
 *           same containers share; the second run is a no-op with exit 0; and
 *           the removed directory is recreated.
 * Covers:   A1-4, A1-5, FR1, NFR3
 * Unhappy:  Deletion between starts is the unhappy path and is asserted here.
 *
 * Budget:   Sixty seconds, not bun's five-second default. The start script has
 *           grown since M-A1 wrote these: it now also generates keys and seeds
 *           known_hosts over the network. A budget set when the script was cheap
 *           turns the suite intermittently red for reasons unrelated to the code.
 *
 * Precondition: STARTED -- a start has run in this checkout. Skipped where it does not,
 *           because `config/scripts/start/git.sh` is the only thing that creates
 *           `volumes/_git-secrets`, so its presence is the question. Measured 2026-10-08: the
 *           whole default tier from a feature worktree gave 9 failures and 1
 *           error, every one of them a case of this kind, and the release
 *           installation gave the same count for the opposite reason. Neither
 *           place satisfies the whole suite, so the precondition is a value
 *           asked for rather than a directory prescribed. SP-1, SP-2.
 */
import { test, expect, afterAll } from 'bun:test';
import { mkdtempSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { STARTED } from '../lib/preconditions';
import { repoRoot } from '../lib/paths';
import { START_SCRIPT_BUDGET } from '../lib/gitfixture';

const script = join(repoRoot, 'config/scripts/start/git.sh');
const project = mkdtempSync(join(tmpdir(), 'lu-a1-'));
afterAll(() => rmSync(project, { recursive: true, force: true }));

const repos = join(project, 'volumes', 'repos');
const mode = (p: string) => (statSync(p).mode & 0o777).toString(8);

test('A1-4 the first run creates the workspace with mode 777', () => {
  const r = sh(['bash', script, project]);
  expect(r.code).toBe(0);
  expect(existsSync(repos)).toBe(true);
  expect(mode(repos)).toBe('777');
}, START_SCRIPT_BUDGET);

test('A1-4 a second run is a no-op and still exits 0', () => {
  const r = sh(['bash', script, project]);
  expect(r.code).toBe(0);
  expect(existsSync(repos)).toBe(true);
  expect(mode(repos)).toBe('777');
}, START_SCRIPT_BUDGET);

test('A1-5 a deleted workspace is recreated by the next run', () => {
  rmSync(repos, { recursive: true, force: true });
  expect(existsSync(repos)).toBe(false);
  const r = sh(['bash', script, project]);
  expect(r.code).toBe(0);
  expect(existsSync(repos)).toBe(true);
}, START_SCRIPT_BUDGET);

test.skipIf(!STARTED)('A1-4 the live workspace exists and matches the same mode', () => {
  const live = join(repoRoot, 'volumes', 'repos');
  expect(existsSync(live)).toBe(true);
  expect(mode(live)).toBe('777');
}, START_SCRIPT_BUDGET);
