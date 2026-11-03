/**
 * M-B7 · Unit · The stale cache notice prints the project's own path, quoted, and touches nothing
 *
 * Purpose:  An installation that built under #10 still holds `volumes/nar_builder/m2`,
 *           and #10's entrypoint handed it to `builder` (uid 1500) with `chown -R -h`.
 *           On rootless Docker, the platform this stack targets, that is host uid
 *           101499 on every directory of the tree, so the notice's first wording --
 *           *"you can delete it"* -- failed for exactly the installations it was
 *           addressed to (#32, FR43). The notice now prints the command that works:
 *           a `docker run` of the builder's own image with the directory mounted.
 *           B7-4 reads that command out of the script's text. What the text cannot
 *           show is what reaches the operator: a `$PWD` that gets to stdout
 *           unexpanded, or a path whose quotes were lost, is only visible in the
 *           output -- and so is the path being the project's rather than the
 *           directory the script was run from.
 * Given:    A fixture made by `mkdtempSync` under the system temp directory with the
 *           prefix `lu b7-10-` -- a space in it on purpose, since the quoting is half
 *           of what the rows prove -- holding `volumes/nar_builder/m2/org/probe.jar`
 *           with the line `probe` (`org/` because the real leftover's top level is
 *           Maven group directories; `probe.jar` because no coordinate produces a
 *           bare jar at that depth). A stub `docker`, `#!/bin/sh`, first on PATH,
 *           appending `$*` to `docker.log` beside `volumes/` and exiting 0 -- B5-1's
 *           shape -- so a run of the printed command would be recorded, never
 *           performed. The counterpart's fixture is the same tree without `m2`.
 * When:     `bash config/scripts/start/nar-builder.sh "<fixture>"` -- the `$1`
 *           override no caller passes, there for a case to point the script at a
 *           fixture -- with the working directory the checkout root, so `$PWD`
 *           and the fixture differ.
 * Then:     (1) stdout holds `is left over from before 2026-10-10`, the exact string
 *           `docker run --pull never --rm --entrypoint rm -v "<fixture>/volumes/nar_builder:/v"
 *           liquidupstart/nar-builder:latest -rf /v/m2` with `<fixture>` the path
 *           `mkdtempSync` returned, `rmdir "<fixture>/volumes/nar_builder"`, and the
 *           words `rootless Docker` and `plain rm`; (2) neither `you can delete it`
 *           nor the five characters `$PWD`; (3) exit 0, `probe.jar` still reads
 *           `probe`, no `docker.log`; (4) with no `m2`: stdout empty, exit 0, no
 *           `docker.log`.
 * Covers:   B7-10, FR43
 * Unhappy:  (2) and (3) are the negatives -- the old phrase or an unexpanded `$PWD`
 *           reaching the operator, and the script deleting or running anything.
 *           (4) is the counterpart that keeps the notice from becoming noise on
 *           every fresh install. No tree here needs to be undeletable: the property
 *           is that nothing is attempted, and a deletable fixture still there
 *           afterwards shows it.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = join(repoRoot, 'config/scripts/start/nar-builder.sh');

function fixture(withM2: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'lu b7-10-'));
  mkdirSync(join(root, 'volumes', 'nar_builder'), { recursive: true });
  if (withM2) {
    mkdirSync(join(root, 'volumes', 'nar_builder', 'm2', 'org'), { recursive: true });
    writeFileSync(join(root, 'volumes', 'nar_builder', 'm2', 'org', 'probe.jar'), 'probe\n');
  }
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(join(root, 'docker.log'))}\nexit 0\n`);
  chmodSync(join(bin, 'docker'), 0o755);
  return { root, bin };
}

const run = (f: { root: string; bin: string }) =>
  sh(['bash', SCRIPT, f.root], repoRoot, { PATH: `${f.bin}:${process.env.PATH}` });

const stale = fixture(true);
const fresh = fixture(false);
afterAll(() => {
  for (const f of [stale, fresh]) rmSync(f.root, { recursive: true, force: true });
});

describe('B7-10 the stale cache directory is named with the command that works, and touched by nothing', () => {
  const r = run(stale);

  test('B7-10 stdout carries the command with the fixture\'s own path, double-quoted, the rmdir line, and the reason a plain rm is refused', () => {
    expect(r.stdout).toContain('is left over from before 2026-10-10');
    // One string, so the quotes, the flag order and the image are each held --
    // and the path is the fixture's, space and all, not the checkout's.
    expect(r.stdout).toContain(
      `docker run --pull never --rm --entrypoint rm -v "${stale.root}/volumes/nar_builder:/v" liquidupstart/nar-builder:latest -rf /v/m2`
    );
    expect(r.stdout).toContain(`rmdir "${stale.root}/volumes/nar_builder"`);
    expect(r.stdout).toContain('rootless Docker');
    expect(r.stdout).toContain('plain rm');
  });

  test('B7-10 the negative: neither the old phrase nor a literal $PWD reaches the output', () => {
    expect(r.stdout).not.toContain('you can delete it');
    expect(r.stdout).not.toContain('$PWD');
  });

  test('B7-10 the negative: the directory is named, not deleted -- and the command is printed, not run', () => {
    expect(r.code).toBe(0);
    expect(readFileSync(join(stale.root, 'volumes', 'nar_builder', 'm2', 'org', 'probe.jar'), 'utf8')).toBe('probe\n');
    expect(existsSync(join(stale.root, 'docker.log'))).toBe(false);
  });
});

test('B7-10 the counterpart: with no m2 the script prints nothing and exits 0', () => {
  const r = run(fresh);
  expect(r.code).toBe(0);
  expect(r.stdout).toBe('');
  expect(existsSync(join(fresh.root, 'docker.log'))).toBe(false);
});
