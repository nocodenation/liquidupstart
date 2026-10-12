/**
 * M-A8 · Unit · Which locally built images an update replaces
 *
 * Purpose:  Half of the blocking finding of the 2026-09-30 review. The toolbox
 *           was the one locally built image with no path to a rebuild: the
 *           dashboard builds it only when `docker image inspect` fails, the
 *           Rebuild button runs `build.sh` *inside* it and rebuilds the other
 *           four, and `update.sh` removed those four and left it. So an image
 *           built before this branch survived the update that added `git` and
 *           `openssh-client` to its Dockerfile, and Start then died after the
 *           teardown — A8-24 is that failure.
 *
 *           The two lists differ on purpose, and that is what this case records.
 *           `update.sh` removes the toolbox so the next task rebuilds it.
 *           `builtImages()` does not name it, because that list is "all must
 *           exist for a start to succeed" and the dashboard builds the toolbox
 *           itself when it is absent; naming it there would report `needBuild`
 *           on a machine that needs nothing.
 * Given:    `scripts/install/update.sh` and
 *           `dashboard/src/lib/server/project.ts` from this checkout, read as
 *           text — both are lists, and a list is what was wrong.
 * When:     Each is examined.
 * Then:     The updater names all five; the dashboard's list names the four that
 *           must be present, and not the toolbox.
 * Covers:   A8-27, U9
 * Unhappy:  The negative half is the second assertion: a repair that added the
 *           toolbox to both lists would make every start report a build it does
 *           not need, which is the failure nobody reports because it looks like
 *           the product working.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const BUILT_BY_BUILD_SH = ['opencode', 'bun-runner', 'liquid', 'openclaw'];

describe('A8-27 an update replaces every locally built image, the toolbox included', () => {
  test('A8-27 update.sh names all five', () => {
    const line =
      readFileSync(join(repoRoot, 'scripts/install/update.sh'), 'utf8')
        .split('\n')
        .find((l) => l.startsWith('BUILT_IMAGES=')) ?? '';
    expect(line).not.toBe('');
    for (const image of [...BUILT_BY_BUILD_SH, 'toolbox']) expect(line).toContain(image);
  });

  test('A8-27 while the dashboard asks for the four that must already exist', () => {
    // The counterpart, and the reason the lists are allowed to differ: the
    // toolbox is built on demand, so requiring it would report a build the
    // operator does not need on a machine that is perfectly ready.
    const src = readFileSync(join(repoRoot, 'dashboard/src/lib/server/project.ts'), 'utf8');
    const list = src.match(/return \[([^\]]*)\]\.map/s)?.[1] ?? '';
    expect(list).not.toBe('');
    for (const image of BUILT_BY_BUILD_SH) expect(list).toContain(image);
    expect(list).not.toContain('toolbox');
  });
});
