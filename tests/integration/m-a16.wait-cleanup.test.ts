/**
 * M-A16 · Integration · The key wait cleans up after itself and nothing else
 *
 * Purpose:  Pass 2 retries the clone every five seconds while it waits for a
 *           deploy key, and a failed attempt leaves a partial `.git` behind —
 *           so the skip and deadline branches remove the destination. They
 *           removed it unconditionally, which took anything else with it. A
 *           folder an operator created during the wait, in the place the clone
 *           was going to land, was gone after the wait ended. Finding 5 of the
 *           2026-09-28 review, and the same class as R2-2 of 2026-09-16 on a
 *           narrower path.
 * Given:    `git@github.com:nocodenation/liquid-flows.git|read|protected` with
 *           no route through the suite's fake ssh, so the clone fails and the
 *           start waits; `SYSTEM_SIGNIN_WAIT_SECONDS=60`, and a directory
 *           `volumes/repos/liquid-flows` holding `operator-notes.txt` created
 *           after the wait has announced itself.
 * When:     The wait is ended by a skip.
 * Then:     The folder and its file are still there, and the start says it left
 *           them alone.
 * Covers:   A16-25, A16-26, FR3, U1
 * Unhappy:  A16-25 is the refusal to delete. A16-26 is its counterpart — a
 *           partial clone this run did create is still removed, so the fix
 *           cannot be met by never cleaning up.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedKnownHosts, gitScript } from '../lib/gitfixture';

const work = tempProject('lu-a16-waitclean-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const project = join(work, 'project');
mkdirSync(project, { recursive: true });
seedKnownHosts(project);
writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=60\n');

const SLUG = 'github.com_nocodenation_liquid-flows';
const DEST = join(project, 'volumes', 'repos', 'liquid-flows');
const SKIP = join(project, 'volumes', '.start-skip', `git-key-${SLUG}`);

const env = {
  ...(process.env as Record<string, string>),
  GIT_REPOSITORIES: 'git@github.com:nocodenation/liquid-flows.git|read|protected'
};

async function runToWaitThen(prepare: () => void) {
  rmSync(DEST, { recursive: true, force: true });
  rmSync(join(project, 'volumes', '.start-skip'), { recursive: true, force: true });
  const p = Bun.spawn(['bash', gitScript, project], { env, stdout: 'pipe', stderr: 'pipe' });
  let seen = '';
  const reader = p.stderr.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + 60_000;
  while (!seen.includes('::aiw-git-key-required::') && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    seen += decoder.decode(value);
  }
  prepare();
  mkdirSync(join(project, 'volumes', '.start-skip'), { recursive: true });
  writeFileSync(SKIP, '');
  // The same reader, not a fresh Response: the stream is already in use.
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    seen += decoder.decode(value);
  }
  await p.exited;
  return seen;
}

describe('A16-25 a folder that appeared during the wait survives it', () => {
  let out = '';
  test('A16-25 the operator file is still there after the skip', async () => {
    out = await runToWaitThen(() => {
      mkdirSync(DEST, { recursive: true });
      writeFileSync(join(DEST, 'operator-notes.txt'), 'mine\n');
    });
    expect(existsSync(join(DEST, 'operator-notes.txt'))).toBe(true);
    expect(readFileSync(join(DEST, 'operator-notes.txt'), 'utf8')).toBe('mine\n');
  }, 120_000);

  test('A16-25 and the start says it left it alone', () => {
    expect(out).toContain('leaving it alone');
  });
});

describe('A16-26 but a partial clone this run made is still cleaned up', () => {
  test('A16-26 the counterpart: what the wait created goes', async () => {
    // Without this the fix could be met by never removing anything, which
    // leaves a half-written .git for the next run to adopt — the defect M-A15
    // exists for.
    await runToWaitThen(() => {
      mkdirSync(join(DEST, '.git'), { recursive: true });
      writeFileSync(join(DEST, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    });
    expect(existsSync(DEST)).toBe(false);
  }, 120_000);
});
