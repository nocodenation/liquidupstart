/**
 * M-B5 · Unit · A fresh installation seeds Liquid, and knows it must be built
 *
 * Purpose:  The two findings of 2026-09-28 that stop a stack coming up at all.
 *
 *           `liquid.sh` created `${STATE_DIR}/api` before asking whether
 *           `$STATE_DIR` exists — which creates `$STATE_DIR` — so the branch
 *           that copies NiFi's configuration out of the image never ran on a
 *           fresh install. `volumes/liquid` then held `api/` alone, the empty
 *           `conf/` was mounted over the image's, and NiFi exited 2 with
 *           `sed: can't read .../nifi.properties` on a loop under
 *           `restart: unless-stopped`.
 *
 *           And `nar-builder` was missing from both lists of locally built
 *           images, so a checkout that has never built it reported
 *           `needBuild: false`; `docker compose up -d` then tried to *pull* a
 *           local-only image, and since `proxy` depends on `nar_builder` the
 *           whole stack failed to start.
 * Given:    A temporary tree carrying a copy of `liquid.sh` at its real
 *           relative path — the script derives PROJECT_DIR from its own
 *           location, so it cannot be pointed at a fixture — a copy of
 *           `config/liquid`, an `.env` with the Liquid credentials, and a stub
 *           `docker` on PATH that appends its arguments to `docker.log`
 *           instead of running anything.
 * When:     That copy runs against an empty `volumes/`.
 * Then:     The seeding `docker run` appears in the log, and
 *           `volumes/liquid/api` exists afterwards.
 * Covers:   B5-1, B5-2, B5-3, FR21, U9
 * Unhappy:  B5-1 is the fresh install that seeded nothing. B5-2 is its
 *           counterpart — a state directory that is already there is still left
 *           alone, so the fix cannot be met by seeding on every start.
 */
import { test, expect, describe } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const SCRIPT = join(repoRoot, 'config/scripts/start/liquid.sh');

function project() {
  const root = mkdtempSync(join(tmpdir(), 'lu-b5-'));
  mkdirSync(join(root, 'config', 'scripts', 'start'), { recursive: true });
  mkdirSync(join(root, 'volumes'), { recursive: true });
  sh(['cp', '-R', join(repoRoot, 'config', 'liquid'), join(root, 'config', 'liquid')]);
  sh(['cp', SCRIPT, join(root, 'config', 'scripts', 'start', 'liquid.sh')]);
  writeFileSync(
    join(root, '.env'),
    'LIQUID_USERNAME=liquid\nLIQUID_PASSWORD=liquidpassword\nSYSTEM_HTTPS_PORT=8833\n'
  );
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(join(root, 'docker.log'))}\nexit 0\n`
  );
  chmodSync(join(bin, 'docker'), 0o755);
  return { root, bin };
}

function runLiquid(p: { root: string; bin: string }) {
  return sh(['bash', join(p.root, 'config', 'scripts', 'start', 'liquid.sh')], p.root, {
    PATH: `${p.bin}:${process.env.PATH}`
  });
}

describe('B5-1 a fresh install seeds the state folder', () => {
  const p = project();
  const r = runLiquid(p);
  const log = existsSync(join(p.root, 'docker.log'))
    ? readFileSync(join(p.root, 'docker.log'), 'utf8')
    : '';

  test('B5-1 the seeding container ran', () => {
    expect(r.output).not.toContain('Skipping state folder extraction');
    expect(log).toContain('nifi-current/conf');
  });

  test('B5-1 and the api directory is still created', () => {
    // The reason that line was unconditional: an installation predating it
    // would have docker create the directory as root on the first mount, which
    // the nifi user in the container cannot write. Moving it must not lose that.
    expect(existsSync(join(p.root, 'volumes', 'liquid', 'api'))).toBe(true);
    rmSync(p.root, { recursive: true, force: true });
  });
});

describe('B5-2 an existing state folder is left alone', () => {
  test('B5-2 the counterpart: nothing is copied over it', () => {
    const p = project();
    mkdirSync(join(p.root, 'volumes', 'liquid', 'conf'), { recursive: true });
    writeFileSync(join(p.root, 'volumes', 'liquid', 'conf', 'nifi.properties'), 'mine=1\n');
    const r = runLiquid(p);
    expect(r.output).toContain('Skipping state folder extraction');
    expect(readFileSync(join(p.root, 'volumes', 'liquid', 'conf', 'nifi.properties'), 'utf8')).toBe(
      'mine=1\n'
    );
    rmSync(p.root, { recursive: true, force: true });
  });
});

describe('B5-3 nar-builder counts as a locally built image', () => {
  test('B5-3 the dashboard lists it, so a fresh checkout is told to build', () => {
    // Without it `stackState()` answered needBuild: false and compose tried to
    // pull an image that only ever exists locally.
    const src = readFileSync(join(repoRoot, 'dashboard/src/lib/server/project.ts'), 'utf8');
    const list = src.match(/return \[([^\]]*)\]\.map/s)?.[1] ?? '';
    expect(list).toContain('nar-builder');
    for (const n of ['opencode', 'bun-runner', 'liquid', 'openclaw']) expect(list).toContain(n);
  });

  test('B5-3 and the upgrade path removes the stale one', () => {
    const src = readFileSync(join(repoRoot, 'scripts/install/update.sh'), 'utf8');
    const line = src.split('\n').find((l) => l.startsWith('BUILT_IMAGES=')) ?? '';
    expect(line).toContain('nar-builder');
  });
});
