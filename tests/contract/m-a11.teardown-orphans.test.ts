/**
 * M-A11 · Contract · Teardown stops what is running, not what this branch declares
 *
 * Purpose:  `down.sh` printed *"Stopping existing containers…"* and then ran
 *           `docker compose down`, which acts on the services the **current**
 *           `compose.yml` declares. A container from another branch's stack is not
 *           in that list, so it survived the teardown and kept running beside a
 *           stack that has no such service. Met on 2026-09-08 switching from
 *           `feature/liquid-java-extensions`: `nar_builder` outlived the teardown
 *           and had to be removed by hand.
 *
 *           The message was the defect. It claims more than the command does, and
 *           compose then prints `WARN Found orphan containers … you can run this
 *           command with the --remove-orphans flag` on **every** invocation —
 *           a warning nobody acts on, which is how a project learns to read past
 *           warnings.
 *
 *           Left open since because `down.sh` was byte-identical on four branches
 *           and the same repair arriving separately is how one file becomes two
 *           that differ. Measured 2026-10-17: it is byte-identical (`08fa75a66f`)
 *           on **17 of 18** branches, so one change on `main` reaches all of them
 *           by merge — and `scripts/install/update.sh:181` already passes the
 *           flag, so the two teardown paths had **already** drifted apart.
 * Given:    The real `scripts/linux/down.sh`, run with a **stub `docker` on PATH**
 *           that records its arguments and exits 0 — the idiom `B6-3` uses for
 *           `mvn`. No docker, no compose, no installation: the subject is the
 *           invocation the script makes.
 * When:     The script is run in a temporary project directory
 * Then:     It invokes `compose down --remove-orphans`, and both teardown paths in
 *           the repository carry the flag, so they cannot drift apart again
 * Covers:   A11-11
 * Negative: The absence of a bare `docker compose down` in either script. A flag
 *           added in one place and not the other is the state this found, and the
 *           counterpart to "it is there" is "the old form is gone".
 *
 * Why not a behavioural case against real compose: it would act on the
 *           installation running on this machine, which is what the stack tier is
 *           for and what `tests/run.sh` keeps opt-in. The stub answers the same
 *           question — what does the script ask docker to do — without that.
 */

import { test, expect, describe } from 'bun:test';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const DOWN = join(repoRoot, 'scripts/linux/down.sh');
const UPDATE = join(repoRoot, 'scripts/install/update.sh');

function recordedInvocation(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lu-a11-11-'));
  try {
    // The script resolves its project directory from its own location, so it
    // runs from a copy: `scripts/linux/down.sh` beside a compose file the stub
    // never reads.
    const scripts = join(dir, 'scripts', 'linux');
    mkdirSync(scripts, { recursive: true });
    const copy = join(scripts, 'down.sh');
    writeFileSync(copy, readFileSync(DOWN, 'utf8'));
    chmodSync(copy, 0o755);
    writeFileSync(join(dir, 'compose.yml'), 'services: {}\n');

    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    const log = join(dir, 'argv.txt');
    writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nexit 0\n`);
    chmodSync(join(bin, 'docker'), 0o755);

    const r = sh([copy], dir, { PATH: `${bin}:${process.env.PATH ?? ''}` });
    expect(r.code, r.output).toBe(0);
    return existsSync(log) ? readFileSync(log, 'utf8').trim() : '';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('A11-11 teardown removes what the current file does not declare', () => {
  const invocation = recordedInvocation();

  test('A11-11 down.sh asks compose to remove orphans', () => {
    // The whole repair, as the script's own words to docker.
    expect(invocation).toContain('compose down --remove-orphans');
  });

  test('A11-11 the negative: it no longer asks for a bare teardown', () => {
    // "The flag is there" is also true of a script that passes both forms, and
    // the one that runs is the one that was written last.
    expect(invocation.split('\n').filter((l) => l.trim() === 'compose down')).toEqual([]);
  });

  test('A11-11 and the script is still the only thing it was: one docker call', () => {
    // A teardown that grew a second call would be a different change, and this
    // case would otherwise pass it silently.
    expect(invocation.split('\n').filter(Boolean).length).toBe(1);
  });
});

describe('A11-11 and the two teardown paths cannot drift apart again', () => {
  // The reason this sat open for five weeks: the same repair arriving separately
  // in several places is how one file becomes two that differ. By 2026-10-17 that
  // had already happened -- update.sh passed the flag and down.sh did not.
  test.each([
    ['scripts/linux/down.sh', DOWN],
    ['scripts/install/update.sh', UPDATE]
  ])('A11-11 %s passes --remove-orphans', (_name, path) => {
    const body = readFileSync(path, 'utf8');
    const calls = body
      .split('\n')
      .filter((l) => /docker compose down/.test(l) && !/^\s*#/.test(l));
    expect(calls.length, `no teardown call in ${_name}`).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain('--remove-orphans');
  });
});
