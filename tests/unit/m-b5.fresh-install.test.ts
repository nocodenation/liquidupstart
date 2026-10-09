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
 * Then:     The seeding `docker run` appears in the log, `volumes/liquid` exists,
 *           and `volumes/liquid/api` does **not** -- it is a volume shared with
 *           `nar_builder` since 2026-10-09 rather than a host bind, so the script
 *           creates nothing there and the ordering hazard above cannot return.
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

  test('B5-1 and no api directory is created on the host at all', () => {
    // **Inverted 2026-10-09, and the inversion is the repair.**
    //
    // This asserted that `volumes/liquid/api` exists afterwards, because
    // `liquid.sh` created it and the hazard was the *order*: creating
    // `${STATE_DIR}/api` also creates `${STATE_DIR}`, so with the mkdir before the
    // seeding branch `[ -d "$STATE_DIR" ]` was always true and a fresh install
    // seeded nothing -- blocker 1 of the 2026-09-28 review, which is what this
    // file exists for.
    //
    // The directory is a volume shared between `liquid` and `nar_builder` now,
    // created by docker and owned by nifi because both images carry the path, so
    // `liquid.sh` creates nothing and no ordering can reintroduce the blocker.
    // M2 of the 2026-10-01 review; the mode it used to need was `chmod 777`, which
    // put the record `nar-build` compiles against within reach of anything on the
    // host.
    //
    // The seeded directories are asserted beside it, so this cannot be met by a
    // script that creates nothing at all.
    expect(existsSync(join(p.root, 'volumes', 'liquid', 'api'))).toBe(false);
    expect(existsSync(join(p.root, 'volumes', 'liquid'))).toBe(true);
    rmSync(p.root, { recursive: true, force: true });
  });
});

describe('B5-1 a leftover api directory is named, and not deleted', () => {
  test('B5-1 the start says it is no longer used', () => {
    // The trap the move would otherwise leave: an installation that ran before
    // 2026-10-09 still has `volumes/liquid/api` on disk, and it looks
    // authoritative while being read by nobody. Editing the record there changes
    // nothing, silently.
    //
    // Named once rather than removed -- deleting a directory the operator may have
    // copied something into is not the start script's call, and the counterpart
    // below is what stops the notice from becoming noise on a fresh install.
    const p = project();
    mkdirSync(join(p.root, 'volumes', 'liquid', 'api'), { recursive: true });
    const r = runLiquid(p);
    expect(r.output).toContain('is left over from before 2026-10-09');
    expect(r.output).toContain('you can delete it');
    expect(existsSync(join(p.root, 'volumes', 'liquid', 'api'))).toBe(true);
    rmSync(p.root, { recursive: true, force: true });
  });

  test('B5-1 and a fresh install says nothing about it', () => {
    const p = project();
    const r = runLiquid(p);
    expect(r.output).not.toContain('is left over from before');
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
