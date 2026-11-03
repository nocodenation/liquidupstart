/**
 * M-CU · Contract · cleanup.sh calls the removal library, and nothing else does the step
 *
 * Purpose:  A function nobody calls protects nobody. The unit cases in
 *           tests/unit/m-cu.remove-volumes.test.ts run `lu_remove_volumes` against
 *           fixtures; this file holds that the script the operator runs reaches it,
 *           and that the step is not also still there inline -- two copies of a
 *           destructive step drift, and the one without the container leg is the
 *           one that runs. And that the library is a library: one that runs
 *           something when sourced is a step nobody asked for, taken against
 *           whatever directory the sourcing shell stands in.
 * Given:    `cleanup.sh` and `scripts/linux/lib/remove-volumes.sh`, read as text
 *           with comment lines stripped; and the library sourced into
 *           `bash -c 'set -euo pipefail; . "$0"; declare -F lu_remove_volumes'`
 *           from a `mkdtemp` working directory holding no `volumes/`, so a
 *           defective library that ran the function on `$PWD` would find nothing
 *           to remove.
 * When:     Both files are read; the library is sourced once.
 * Then:     `cleanup.sh`'s code holds `. "${PROJECT_DIR}/scripts/linux/lib/remove-volumes.sh"`
 *           (or `source`) and `lu_remove_volumes "${PROJECT_DIR}"`; it holds no
 *           `rm -rf "${PROJECT_DIR}/volumes"` and no word `sudo`; sourcing exits 0
 *           with stderr empty and stdout `declare -F`'s own line and nothing else.
 * Covers:   CU-6, CU-FR4
 * Unhappy:  The negative is the old inline block still (or again) in `cleanup.sh`
 *           beside the call, and a library that prints or runs when sourced. The
 *           `--pull never` of the library's one `docker run` is CS-22's: it walks
 *           `scripts/**` and names this file without the flag, so the site is held
 *           there rather than twice.
 */
import { test, expect, describe } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const LIB = 'scripts/linux/lib/remove-volumes.sh';
const code = (p: string) =>
  readFileSync(join(repoRoot, p), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

describe('CU-6 cleanup.sh calls it, and nothing else does the step', () => {
  test('CU-6 cleanup.sh sources the library under ${PROJECT_DIR} and calls it with ${PROJECT_DIR}', () => {
    const cleanup = code('cleanup.sh');
    expect(cleanup).toMatch(/^(\.|source) "\$\{PROJECT_DIR\}\/scripts\/linux\/lib\/remove-volumes\.sh"$/m);
    expect(cleanup).toMatch(/^lu_remove_volumes "\$\{PROJECT_DIR\}"$/m);
  });

  test('CU-6 the negative: the step is in one place -- no rm -rf of volumes/ and no sudo of its own in cleanup.sh', () => {
    const cleanup = code('cleanup.sh');
    expect(cleanup).not.toContain('rm -rf "${PROJECT_DIR}/volumes"');
    expect(cleanup).not.toMatch(/\bsudo\b/);
  });

  test('CU-6 the library sourced under set -euo pipefail defines the function, prints nothing and exits 0', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lu cu-6-'));
    try {
      const r = sh(['bash', '-c', 'set -euo pipefail; . "$0"; declare -F lu_remove_volumes', join(repoRoot, LIB)], cwd);
      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout).toBe('lu_remove_volumes\n');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
