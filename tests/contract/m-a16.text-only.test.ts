/**
 * M-A16 · Contract · Every test file stays readable to a reviewer
 *
 * Purpose:  Finding 6 of 2026-09-21. `tests/unit/m-a13.skip-step-names.test.ts`
 *           carried a literal NUL byte as test data, so git classified the file
 *           as binary and the pull request showed `Bin 0 -> 4817 bytes` instead
 *           of a diff — including the header block, which is the one
 *           documentation rule this repository makes non-negotiable, because a
 *           reviewer has to be able to sign a case off without reading its
 *           body. One byte switched that rule off for that file, and nothing
 *           noticed.
 *
 *           Held over the whole tree rather than over the one file that had it.
 *           The repair of a single file is not the point; the property is that
 *           a case a reviewer cannot read is not a case, and the next NUL byte
 *           will be written by someone who has never read this header.
 * Given:    Every file git tracks under `tests/`.
 * When:     Each is read.
 * Then:     None contains a NUL byte in the window git judges by — the first
 *           8000 bytes — so none is binary, and every one shows up as a diff.
 * Covers:   A16-19, and the header rule in CLAUDE.md § Writing into files
 * Unhappy:  The negative is the whole case. Its counterpart is A16-20 in
 *           `m-a13.skip-step-names.test.ts`: the case that needed a NUL still
 *           refuses one, written as the escape `'a\0b'` rather than the byte,
 *           so this rule cannot be met by giving up the test data.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

// git's own rule: it looks for a NUL in the first 8000 bytes of the blob.
const GIT_BINARY_WINDOW = 8000;

const tracked = Bun.spawnSync(['git', '-C', repoRoot, 'ls-files', '-z', 'tests'], {
  stdout: 'pipe'
})
  .stdout.toString()
  .split('\0')
  .filter(Boolean);

test('A16-19 git tracks test files, so there is something to judge', () => {
  // A count of zero is not a result. If `ls-files` came back empty the loop
  // below would pass over nothing at all.
  expect(tracked.length).toBeGreaterThan(50);
});

test('A16-19 no test file is binary to git', () => {
  const binary: string[] = [];
  for (const path of tracked) {
    const head = readFileSync(join(repoRoot, path)).subarray(0, GIT_BINARY_WINDOW);
    if (head.includes(0)) binary.push(path);
  }
  // Named rather than counted: a reviewer meeting this failure needs to know
  // which file stopped being reviewable.
  expect(binary).toEqual([]);
});
