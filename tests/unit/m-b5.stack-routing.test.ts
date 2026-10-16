/**
 * M-B5 · Unit · What a file needs decides its tier, not where it sits
 *
 * Purpose:  Item 12 of the 2026-09-28 review. Sixteen M-B files live under
 *           unit/ and integration/ and drive the running stack anyway -- they
 *           call `docker compose exec opencode nar-build` and friends. The
 *           opt-in of 2026-09-17 keys on the directory, so a plain
 *           `./tests/run.sh` ran them against the operator's own stack: they
 *           wrote under `volumes/repos` and built probe NARs into the live
 *           `volumes/nar_extensions`, which Liquid autoloads and keeps loaded
 *           after the case deletes the file. That is the thing the opt-in was
 *           introduced to stop.
 *
 *           The runner now also reads the file. A call is what counts -- a bare
 *           `nar-build` matches twenty-two files, most of which only name it in
 *           their header, and pulling those out of the default run would be its
 *           own silent check that never runs.
 * Given:    A fixture tree with three unit-level files: `caller` invoking
 *           `stackGuard()`, `mentioner` naming `nar-build` and `docker compose`
 *           in its header block only, and `plain` doing neither. And this
 *           checkout's own tests/, where the markers are
 *           `stackGuard`, `requireStack`, `narBuild(`, `observeBuilds(` and
 *           `composeExec(`.
 * When:     `run.sh --list` runs over the fixture with and without `--system`,
 *           and over this checkout without it.
 * Then:     The caller is held back and reachable with `--system`, the
 *           mentioner and the plain file stay in the default run, and no file
 *           the default run lists calls into the stack.
 * Covers:   B5-19, B5-20, B5-21, U9
 * Unhappy:  B5-19 is the file held back. B5-20 is its counterpart -- matching
 *           mentions instead of calls would quietly empty the default tier,
 *           which fails in the direction nobody notices.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runner } from '../lib/shell';
import { makeTree, dropTree, PASSING } from '../lib/fixtures';
import { repoRoot } from '../lib/paths';

const CALLER = `${PASSING}
// It drives the running stack, from a unit-level directory.
export const unused = () => stackGuard();
`;

const MENTIONER = `/**
 * A header that names docker compose exec opencode nar-build and observeBuilds
 * because it explains one, and calls neither.
 */
${PASSING}
`;

const tree = makeTree({
  'unit/m-fx.caller.test.ts': CALLER,
  'unit/m-fx.mentioner.test.ts': MENTIONER,
  'unit/m-fx.plain.test.ts': PASSING
});
afterAll(() => dropTree(tree));

describe('B5-19 a file that calls the stack is held back wherever it lives', () => {
  test('B5-19 the default run does not select it', () => {
    const r = runner(['--root', tree, '--list']);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('m-fx.caller.test.ts');
    expect(r.output).toContain('SKIPPED');
  });

  test('B5-19 and --system reaches it', () => {
    // Or the tier is unreachable and sixteen files have stopped running at all,
    // which is the same defect wearing the other coat.
    const r = runner(['--root', tree, '--system', '--list']);
    expect(r.stdout).toContain('m-fx.caller.test.ts');
  });
});

describe('B5-20 while a file that only names one still runs', () => {
  test('B5-20 the counterpart: a header mention does not move a file', () => {
    const r = runner(['--root', tree, '--list']);
    expect(r.stdout).toContain('m-fx.mentioner.test.ts');
    expect(r.stdout).toContain('m-fx.plain.test.ts');
  });
});

describe('B5-21 and the default run of this checkout touches no stack', () => {
  test('B5-21 nothing the default run lists calls into it', () => {
    const markers = /stackGuard|requireStack|narBuild\(|observeBuilds\(|composeExec\(/;
    const listed = runner(['--list']).stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.test.ts'));
    // A count of zero means nothing until something that must be there is
    // counted: the length says the listing actually happened.
    expect(listed.length).toBeGreaterThan(50);
    const offenders = listed.filter((f) => markers.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('B5-21 and the files that do call it are reachable with --system', () => {
    const markers = /stackGuard|requireStack|narBuild\(|observeBuilds\(|composeExec\(/;
    const listed = runner(['--system', '--list']).stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.test.ts'));
    const callers = listed.filter((f) => markers.test(readFileSync(f, 'utf8')));
    expect(callers.length).toBeGreaterThan(0);
    // Under unit/ and integration/ as well, which is what item 12 is about.
    const outsideStackDirs = callers.filter(
      (f) => !f.includes(`${join(repoRoot, 'tests')}/system/`) && !f.includes('/e2e/')
    );
    expect(outsideStackDirs.length).toBeGreaterThan(0);
  });
});
