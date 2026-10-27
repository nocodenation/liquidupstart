/**
 * N7 — a config written for a restart is written before the restart runs.
 *
 * Purpose: the system cases write openclaw.json and then restart the gateway
 * synchronously. `Bun.write()` returns a promise; in a non-async helper nothing
 * awaits it, and `Bun.spawnSync` for the restart blocks the JS thread without
 * draining the I/O pool. The gateway can then boot on the previous config, which
 * shows up as OC-10 and OC-14 flaking with "expected 403, got 200" — and in an
 * afterAll restore, as the live config keeping the case's wide trustedProxies
 * or admin-only scopes until the next start.
 *
 * The case holds the genus, not the four places: any test that writes a file and
 * restarts in the same breath has the same trap.
 *
 * Given  the test files that write a config and restart the stack
 * When   they are read
 * Then   none of them writes through a promise nothing awaits
 *
 * Requirements covered: OC-G1, N7 of the #11 second review.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const DIRS = ['tests/system', 'tests/integration', 'tests/contract'];

function testFiles(): string[] {
  return DIRS.flatMap((d) =>
    readdirSync(join(repoRoot, d))
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => `${d}/${f}`)
  );
}

describe('N7 config writes that precede a restart are synchronous', () => {
  test('no test file writes a file through an unawaited promise', () => {
    const offenders = testFiles().filter((f) => {
      const body = readFileSync(join(repoRoot, f), 'utf8');
      return body
        .split('\n')
        .some((l) => /(^|[^.\w])Bun\.write\(/.test(l) && !/await|return|\.then/.test(l));
    });
    expect(offenders).toEqual([]);
  });

  test('and the ones that restart the gateway write with writeFileSync', () => {
    const writers = testFiles().filter((f) => {
      const body = readFileSync(join(repoRoot, f), 'utf8');
      return /restart', 'openclaw-gateway'|restart openclaw-gateway/.test(body);
    });
    expect(writers.length).toBeGreaterThan(0);
    const missing = writers.filter(
      (f) => !readFileSync(join(repoRoot, f), 'utf8').includes('writeFileSync(')
    );
    expect(missing).toEqual([]);
  });
});
