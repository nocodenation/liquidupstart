/**
 * M-A8 · Unit · The declaration is judged before anything is torn down
 *
 * Purpose:  scripts/linux/start.sh runs down.sh as its second action, 123 lines
 *           before the git step. A declaration the parser refuses therefore used
 *           to cost the whole running installation: every container removed, the
 *           abort at the git step, and `docker compose up` never reached. It was
 *           met on 2026-09-08 during A8-16, from the dashboard's own Start
 *           button, with one entry missing its `|access|policy` — and the log
 *           read "Container postgres Removed" above "[start failed with exit
 *           code 2]".
 * Given:    git.sh in --check-declaration mode, the pre-flight start.sh now runs
 *           first.
 * When:     It is handed a valid declaration, a malformed one, an SSH-only
 *           violation, and nothing at all.
 * Then:     Zero for the two that are acceptable, the parser's own message and
 *           exit 2 for the two that are not, and **no directory created either
 *           way** — a pre-flight that prepares state is not a pre-flight.
 * Covers:   A8-21, FR11, FR20, U1
 * Unhappy:  Both refusals are the point. The empty declaration is the case that
 *           keeps them honest: an installation that declares no repositories
 *           must start, and a check that refused it would break every stack
 *           that does not use this feature.
 */
import { test, expect, afterAll } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { repoRoot } from '../lib/paths';

const project = mkdtempSync(join(tmpdir(), 'lu-a8-preflight-'));

function check(declaration: string) {
  const p = spawnSync(
    'bash',
    [join(repoRoot, 'config', 'scripts', 'start', 'git.sh'), project, '--check-declaration'],
    { encoding: 'utf8', env: { ...process.env, GIT_REPOSITORIES: declaration }, timeout: 60_000 }
  );
  return { code: p.status ?? -1, output: (p.stdout ?? '') + (p.stderr ?? '') };
}

afterAll(() => rmSync(project, { recursive: true, force: true }));

test('A8-21 a well-formed declaration passes', () => {
  expect(check('git@github.com:a/b.git|read|protected').code).toBe(0);
});

test('A8-21 an entry missing its access and policy is refused, in the parser words', () => {
  const { code, output } = check('https://github.com/nocodenation/git-autosync.git');
  expect(code).toBe(2);
  expect(output).toContain('expected <ssh-url>|<access>|<policy>');
});

test('A8-21 and an https URL that is otherwise well-formed is refused too', () => {
  const { code, output } = check('https://github.com/a/b.git|read|protected');
  expect(code).toBe(2);
  expect(output).toContain('SSH-only');
});

test('A8-21 declaring nothing is not an error', () => {
  expect(check('').code).toBe(0);
});

test('A8-21 the check prepares nothing — it only judges', () => {
  check('git@github.com:a/b.git|read|protected');
  check('https://github.com/a/b.git|read|protected');
  expect(readdirSync(project)).toEqual([]);
});
