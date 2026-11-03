/**
 * M-RO · Unit · The sandbox the M-RO unit cases run the entrypoint in
 *
 * Purpose:  Every unit case of M-RO runs a copy of the entrypoint whose two paths the harness
 *           points into a fresh directory. Round 1 of the review on #59 found that copy broken
 *           wherever the directory lies under `/tmp`, the Linux default: chained replacements
 *           rewrote the box's own path a second time, the file landed in
 *           `<box>/tmp/<box>/config/opencode`, and every case read `config: null`. On the host
 *           the suite had run on, whose temp directory is under `/var/folders`, it was green.
 *           Two negatives even passed on the missing file, since `not.toHaveProperty` holds
 *           for `null`; a run that exits 0 without a file is now a harness error.
 * Given:    `sandboxed()` and `runEntrypoint()` of `tests/lib/opencodefixture.ts`.
 * When:     The real entrypoint is rewritten for a box under `/tmp`; RO-1's first row is run
 *           in a box made under `/tmp`; two scripts that write nothing are run, one exiting 0
 *           and one exiting 3.
 * Then:     The copy points the configuration into the box and the model lists into its `tmp`,
 *           with no path rewritten twice, and the run under `/tmp` finds its file.
 * Covers:   RO-8: the harness of RO-1, RO-2, RO-3 and RO-7, which covers no requirement of the
 *           feature itself
 * Negative: a script that exits 0 without writing `opencode.json` makes the harness throw,
 *           naming the file it looked for.
 * Counterpart: a script that exits 3 without writing one is returned with its status, so a
 *           case can still judge an entrypoint that really failed.
 *
 * Test data: the box of the first row is the name `/tmp/lu-ro-probe`, with no directory behind
 * it; the doubled path the defect produced is `/tmp/lu-ro-probe/tmp/lu-ro-probe`. The second
 * row uses RO-1's first row: all three answers 200, CLI on, model
 * `privacy-anthropic/claude-sonnet-5`. The two scripts are `#!/bin/sh`, a comment naming
 * `/root/.config/opencode` and `/tmp/` so the harness's guard lets them through, and `exit 0`
 * or `exit 3`.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_ON, BASE_ENV, ENTRYPOINT, runEntrypoint, sandboxed } from '../lib/opencodefixture';

const ONLY = { ...BASE_ENV, PRIVACY_ROUTING: 'only', ENABLE_ANTHROPIC_CLAUDE_CODE: '1' };
const scripts = mkdtempSync(join(tmpdir(), 'lu-ro8-'));
afterAll(() => rmSync(scripts, { recursive: true, force: true }));

function script(name: string, status: number): string {
  const f = join(scripts, name);
  writeFileSync(f, `#!/bin/sh\n# writes neither to /root/.config/opencode nor to /tmp/\nexit ${status}\n`);
  return f;
}

describe('RO-8 the sandbox the unit cases run in', () => {
  test('RO-8 a copy made for a box under /tmp points both paths into it, none twice', () => {
    const copy = sandboxed(readFileSync(ENTRYPOINT, 'utf8'), '/tmp/lu-ro-probe');
    expect(copy).toContain('/tmp/lu-ro-probe/config/opencode/opencode.json');
    expect(copy).toContain('/tmp/lu-ro-probe/tmp/privacy_openai_models.json');
    expect(copy).not.toContain('/root/.config/opencode');
    expect(copy).not.toContain('/tmp/lu-ro-probe/tmp/lu-ro-probe');
  });

  test('RO-8 a run whose box is made under /tmp finds the opencode.json it wrote', () => {
    const r = runEntrypoint(ALL_ON, ONLY, ENTRYPOINT, '/tmp');
    expect(r.box.startsWith('/tmp/lu-ro-')).toBe(true);
    expect(r.config.model).toBe('privacy-anthropic/claude-sonnet-5');
  });

  test('RO-8 the negative: a script that exits 0 without writing opencode.json makes the harness throw', () => {
    expect(() => runEntrypoint(ALL_ON, ONLY, script('silent.sh', 0))).toThrow('exited 0 but wrote no opencode.json');
  });

  test('RO-8 the counterpart: a script that exits 3 without writing one is returned with its status', () => {
    const r = runEntrypoint(ALL_ON, ONLY, script('failing.sh', 3));
    expect(r.code).toBe(3);
    expect(r.config).toBeNull();
  });
});
