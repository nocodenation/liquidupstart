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
 * The script runs as a copy in a throwaway tree, not out of the checkout. Before
 * its first docker call it copies the env template over config/openclaw/.env and
 * injects the keys from the root .env into it, and chmods the volume directories
 * -- so the first version of this case rewrote a real file with a real key in it
 * on 2026-09-11 at 18:53, and needed a root .env to exist at all. A contract case
 * may not touch the working tree (R4 of the #11 third review).
 *
 * Requirements covered: OC-G5, N6 of the #11 second review.
 */
import { test, expect, describe } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
  realpathSync,
  readdirSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = 'config/scripts/start/openclaw.sh';
const BODY = readFileSync(join(repoRoot, SCRIPT), 'utf8');

describe('N6 the start script sets its own working directory', () => {
  test('its first docker call runs in the project directory, not the caller\u2019s', () => {
    // A tree that looks like the project, holding nothing but what the script
    // reads before its first docker call.
    const proj = mkdtempSync(join(tmpdir(), 'lu-proj-'));
    mkdirSync(join(proj, 'config', 'scripts', 'start'), { recursive: true });
    mkdirSync(join(proj, 'config', 'openclaw', 'templates'), { recursive: true });
    writeFileSync(join(proj, '.env'), 'SYSTEM_HTTP_PORT=8888\n');
    writeFileSync(join(proj, 'config', 'openclaw', 'templates', 'env_template'), '# ANTHROPIC_API_KEY=\n');
    // With a state present the first-run branch is skipped -- which is where the
    // old cd sat, so without this the case would pass against the defect.
    mkdirSync(join(proj, 'volumes', '_openclaw'), { recursive: true });
    writeFileSync(join(proj, 'volumes', '_openclaw', 'openclaw.json'), '{}\n');
    const copy = join(proj, 'config', 'scripts', 'start', 'openclaw.sh');
    writeFileSync(copy, BODY);
    chmodSync(copy, 0o755);
    // The script sources its own libs, so a tree holding only the script is not a
    // tree the script can run in -- found on 2026-09-17, when the wait helper was
    // added and this case failed at the source line. It happened a second time
    // the same day, when the bound moved into a library of its own, so the whole
    // directory is copied rather than the files this case happens to know about.
    const libSrc = join(repoRoot, 'config/scripts/start/lib');
    const libDst = join(proj, 'config', 'scripts', 'start', 'lib');
    mkdirSync(libDst, { recursive: true });
    for (const f of readdirSync(libSrc)) {
      writeFileSync(join(libDst, f), readFileSync(join(libSrc, f), 'utf8'));
    }

    const caller = mkdtempSync(join(tmpdir(), 'lu-cwd-'));
    const bin = join(caller, 'bin');
    mkdirSync(bin, { recursive: true });
    const log = join(caller, 'cwd.log');
    // Records where it was called and fails, which ends the start at the version
    // probe -- before anything is written.
    writeFileSync(join(bin, 'docker'), `#!/bin/sh\npwd >> ${log}\nexit 1\n`);
    chmodSync(join(bin, 'docker'), 0o755);

    sh(['bash', copy], caller, { PATH: `${bin}:/usr/bin:/bin` });

    const seen = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    expect(seen.length).toBeGreaterThan(0);
    // Resolved on both sides: macOS hands out /var/folders/..., bash's pwd keeps
    // the logical path and realpathSync gives /private/var for the same place.
    expect(realpathSync(seen[0])).toBe(realpathSync(proj));
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
