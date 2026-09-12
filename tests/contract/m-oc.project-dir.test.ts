/**
 * N6 — the start script does not borrow its caller's working directory.
 *
 * Purpose: `docker compose` finds compose.yml in the working directory and
 * nowhere else. openclaw.sh ran `docker compose` in three places but set the
 * directory in one of them — inside the branch taken only when openclaw.json is
 * missing, i.e. the one start that has no state to migrate. The state migration,
 * which runs on every start after that, was left with whatever directory the
 * caller happened to be in; from anywhere else compose answers "no configuration
 * file provided: not found" (measured 2026-09-11 from /tmp) and the migration
 * reports only that it "did not complete".
 *
 * It never fired through the ordinary path: scripts/linux/start.sh cds to the
 * project directory before invoking this script. The dependency on the caller is
 * the defect, and that is what these cases hold.
 *
 * Given  openclaw.sh started from a directory that is not the project
 * When   it makes its first docker call
 * Then   that call runs in the project directory
 * And    the cd is unconditional, ahead of every `docker compose`
 *
 * Requirements covered: OC-G5, N6 of the #11 second review.
 */
import { test, expect, describe } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = 'config/scripts/start/openclaw.sh';
const BODY = readFileSync(join(repoRoot, SCRIPT), 'utf8');

describe('N6 the start script sets its own working directory', () => {
  test('its first docker call runs in the project directory, not the caller’s', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lu-cwd-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    const log = join(dir, 'cwd.log');
    // Records where it was called and fails, which ends the start at the version
    // probe -- before anything is written.
    writeFileSync(join(bin, 'docker'), `#!/bin/sh\npwd >> ${log}\nexit 1\n`);
    chmodSync(join(bin, 'docker'), 0o755);

    sh(['bash', join(repoRoot, SCRIPT)], dir, { PATH: `${bin}:/usr/bin:/bin` });

    const seen = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBe(repoRoot);
  });

  test('and the cd is unconditional, ahead of every docker compose', () => {
    const lines = BODY.split('\n');
    // At column zero: indented is nested, and nesting is what the defect was.
    const cd = lines.findIndex((l) => l === 'cd "${PROJECT_DIR}"');
    const firstCompose = lines.findIndex(
      (l) => l.includes('docker compose') && !l.trimStart().startsWith('#')
    );
    expect(cd).toBeGreaterThan(-1);
    expect(firstCompose).toBeGreaterThan(cd);
  });
});
