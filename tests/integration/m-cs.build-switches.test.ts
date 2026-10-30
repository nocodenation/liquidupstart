/**
 * M-CS · Integration · The build runs the build steps of what is on
 *
 * Purpose:  The build is where the half hour goes: on 2026-10-27 a cold `build.sh` took
 *           32 minutes, Liquid 7:55 and OpenClaw 6:32 of them. A switch the build
 *           ignores saves nothing. A build that skips a component that is on fails the
 *           next start, which `stackState()` then reports as a missing image. And a value
 *           the start would refuse must not cost an image first.
 * Given:    A temporary tree holding a copy of `scripts/linux/build.sh` and of
 *           `config/scripts/start/lib/components.sh` at their real relative paths, since
 *           `build.sh` derives the project from its own location. The six build scripts
 *           under `config/scripts/build/` are stubs, each appending its own name to
 *           `build.log`.
 * When:     `build.sh` runs once per `.env` below.
 * Then:     With no switch key, today's five steps run in today's order. Each switch at `0`
 *           leaves out exactly its steps; with all three off only `bun-runner` runs, plus
 *           `privacy-proxy` when that is on. A refused value exits 1 with no step run and
 *           the key named -- through `rebuild.sh` too, the dashboard's Rebuild, which runs
 *           `down.sh` first: a refusal there must come before it (the second local review of
 *           2026-10-29), while a valid value runs `down` and then the steps. Since the review
 *           on #56 the privacy proxy's switch is read by the switches' rule (CS-FR16):
 *           `PRIVACY_PROXY_ENABLE='1'` and `=0` followed by `=1` build it, `=1` followed by `=0`
 *           does not.
 * Covers:   CS-3, CS-FR3, CS-FR16, CS-NFR1, CS-NFR2
 * Negative: the switched-off rows, and the refused row, which writes no `build.log` at all.
 * Counterpart: the row without any switch key runs every step `main` runs, so a build that
 *           skipped something whatever the switches said cannot pass.
 *
 * Test data: today's order, read from `build.sh` at `da4e2d1`, is
 * `opencode bun-runner nar-builder liquid openclaw`. The `.env` files are
 * `PRIVACY_PROXY_ENABLE=0` alone; `ENABLE_LIQUID=0`; `ENABLE_OPENCLAW=0`;
 * `ENABLE_OPENCODE=0`; all three `0`; all three `0` with `PRIVACY_PROXY_ENABLE=1`; and
 * `ENABLE_OPENCODE=yes`. The privacy rows hold all three switches at `0` and
 * `PRIVACY_PROXY_ENABLE='1'`, or `PRIVACY_PROXY_ENABLE=0` then `PRIVACY_PROXY_ENABLE=1`, or the
 * reverse. No docker is involved: every build step is a stub.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const STEPS = ['opencode', 'bun-runner', 'nar-builder', 'liquid', 'openclaw', 'privacy-proxy'];
const made: string[] = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

function build(env: string, script = 'build.sh') {
  const root = mkdtempSync(join(tmpdir(), 'lu-cs3-'));
  made.push(root);
  mkdirSync(join(root, 'scripts', 'linux'), { recursive: true });
  mkdirSync(join(root, 'config', 'scripts', 'start', 'lib'), { recursive: true });
  mkdirSync(join(root, 'config', 'scripts', 'build'), { recursive: true });
  cpSync(join(repoRoot, 'scripts/linux/build.sh'), join(root, 'scripts/linux/build.sh'));
  cpSync(join(repoRoot, 'scripts/linux/rebuild.sh'), join(root, 'scripts/linux/rebuild.sh'));
  cpSync(
    join(repoRoot, 'config/scripts/start/lib/components.sh'),
    join(root, 'config/scripts/start/lib/components.sh')
  );
  const log = join(root, 'build.log');
  for (const step of STEPS) {
    const stub = join(root, 'config', 'scripts', 'build', `${step}.sh`);
    writeFileSync(stub, `#!/usr/bin/env bash\nprintf '%s\\n' ${step} >> ${JSON.stringify(log)}\n`);
    chmodSync(stub, 0o755);
  }
  writeFileSync(join(root, 'scripts', 'linux', 'down.sh'), `#!/usr/bin/env bash\nprintf '%s\\n' down >> ${JSON.stringify(log)}\n`);
  chmodSync(join(root, 'scripts', 'linux', 'down.sh'), 0o755);
  writeFileSync(join(root, '.env'), env);
  const r = sh(['bash', join(root, 'scripts/linux', script)], root);
  const ran = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : null;
  return { ...r, ran };
}

describe('CS-3 the build runs what is on', () => {
  test('CS-3 with no switch key, today\'s five steps in today\'s order', () => {
    const r = build('PRIVACY_PROXY_ENABLE=0\n');
    expect(r.code).toBe(0);
    expect(r.ran).toEqual(['opencode', 'bun-runner', 'nar-builder', 'liquid', 'openclaw']);
  });

  test('CS-3 the negative: Liquid off leaves out its builder and its image', () => {
    expect(build('ENABLE_LIQUID=0\n').ran).toEqual(['opencode', 'bun-runner', 'openclaw']);
  });

  test('CS-3 the negative: OpenClaw off leaves out openclaw', () => {
    expect(build('ENABLE_OPENCLAW=0\n').ran).toEqual(['opencode', 'bun-runner', 'nar-builder', 'liquid']);
  });

  test('CS-3 the negative: OpenCode off leaves out opencode', () => {
    expect(build('ENABLE_OPENCODE=0\n').ran).toEqual(['bun-runner', 'nar-builder', 'liquid', 'openclaw']);
  });

  test('CS-3 the negative: all three off builds bun-runner alone', () => {
    const r = build('ENABLE_LIQUID=0\nENABLE_OPENCLAW=0\nENABLE_OPENCODE=0\n');
    expect(r.code).toBe(0);
    expect(r.ran).toEqual(['bun-runner']);
  });

  test('CS-3 and the privacy proxy keeps its own switch', () => {
    const r = build('ENABLE_LIQUID=0\nENABLE_OPENCLAW=0\nENABLE_OPENCODE=0\nPRIVACY_PROXY_ENABLE=1\n');
    expect(r.ran).toEqual(['bun-runner', 'privacy-proxy']);
  });

  const off = 'ENABLE_LIQUID=0\nENABLE_OPENCLAW=0\nENABLE_OPENCODE=0\n';
  test("CS-3 and builds it for PRIVACY_PROXY_ENABLE='1'", () => {
    expect(build(`${off}PRIVACY_PROXY_ENABLE='1'\n`).ran).toEqual(['bun-runner', 'privacy-proxy']);
  });

  test('CS-3 and for =0 followed by =1, the last line deciding as the dashboard reads it', () => {
    expect(build(`${off}PRIVACY_PROXY_ENABLE=0\nPRIVACY_PROXY_ENABLE=1\n`).ran).toEqual(['bun-runner', 'privacy-proxy']);
  });

  test('CS-3 the negative: and not for =1 followed by =0', () => {
    expect(build(`${off}PRIVACY_PROXY_ENABLE=1\nPRIVACY_PROXY_ENABLE=0\n`).ran).toEqual(['bun-runner']);
  });
});

describe('CS-3 a refused value costs no image', () => {
  test('CS-3 the negative: ENABLE_OPENCODE=yes stops the build before any step', () => {
    const r = build('ENABLE_OPENCODE=yes\n');
    expect(r.code).toBe(1);
    expect(r.ran).toBeNull();
    expect(r.stderr).toContain('Error: ENABLE_OPENCODE=yes in .env is not a switch value');
  });

  test('CS-3 the negative: through rebuild.sh it stops before down.sh, too', () => {
    const r = build('ENABLE_OPENCODE=yes\n', 'rebuild.sh');
    expect(r.code).toBe(1);
    expect(r.ran).toBeNull();
    expect(r.stderr).toContain('Nothing has been stopped; the stack is as it was.');
  });

  test('CS-3 the counterpart: a valid rebuild runs down.sh and then the steps', () => {
    const r = build('ENABLE_LIQUID=0\n', 'rebuild.sh');
    expect(r.code).toBe(0);
    expect(r.ran).toEqual(['down', 'opencode', 'bun-runner', 'openclaw']);
  });
});
