/**
 * M-A8 · Unit · A fixture-based test is handed a project, not the operator's
 *
 * Purpose:  Bun loads the repository's own .env into process.env, and tests/lib
 *           /shell.ts forwarded all of it to every child. git.sh prefers
 *           $GIT_REPOSITORIES over the .env in the project directory it is
 *           given, so a test that builds a fixture and runs the start script
 *           against it was reading the developer's live declaration instead.
 *           Invisible for as long as that declaration was valid: on 2026-09-08 a
 *           malformed one turned five cases red across M-A1 and M-A3, none of
 *           which had changed. The suite was passing for a reason no case named.
 * Given:    sh(), the helper every script-level case runs through.
 * When:     A child is asked what it inherited.
 * Then:     No GIT_REPOSITORIES, and everything else still there — a helper that
 *           stripped the environment wholesale would trade one silent coupling
 *           for a louder breakage.
 * Covers:   A8-24, NFR1
 * Unhappy:  The second assertion is the unhappy one. It fails if the fix is
 *           over-broad, which is the way this kind of repair usually goes wrong.
 */
import { test, expect } from 'bun:test';
import { sh } from '../lib/shell';

test('A8-24 the repository declaration does not reach a child', () => {
  // Set on this process the way Bun's .env loading sets it.
  process.env.GIT_REPOSITORIES = 'git@github.com:someone/leaked.git|write|direct';
  try {
    const r = sh(['bash', '-c', 'echo "[${GIT_REPOSITORIES:-<unset>}]"']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('[<unset>]');
  } finally {
    delete process.env.GIT_REPOSITORIES;
  }
});

test('A8-24 while the rest of the environment still is', () => {
  process.env.LU_A8_PROBE = 'kept';
  try {
    const r = sh(['bash', '-c', 'echo "[${LU_A8_PROBE:-<unset>}][${LC_ALL:-<unset>}]"']);
    expect(r.stdout.trim()).toBe('[kept][C]');
  } finally {
    delete process.env.LU_A8_PROBE;
  }
});
