/**
 * N5 — a snapshot that could not be taken is not written, and never becomes a reference.
 *
 * Purpose: `image-digests.sh` compares registry digests across a change, so a
 * snapshot missing a section is worse than none: the next run diffs against it
 * and reports every image as an upstream move — the false alarm the
 * "(lookup failed)" guard exists to prevent.
 *
 * F10 added a write-through-temp-file and an `if ! emit` wrapper. The wrapper
 * cannot see a failing stage: bash suspends errexit for the condition of an
 * `if`, so a failed `docker compose config | jq` ran on, the later stages
 * produced their lines, and emit returned the status of its last loop. The
 * result was an accepted stub rather than a rejected one.
 *
 * Given  a docker whose `compose config` exits non-zero
 * When   `image-digests.sh before` is run against it
 * Then   nothing is written and the script exits non-zero
 *
 * Measured 2026-09-11, before the fix: exit 0, a snapshot whose "Service images"
 * section was empty, and the line "this one becomes the reference".
 *
 * Requirements covered: OC-G5, N5 of the #11 second review.
 */
import { test, expect, describe } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = 'scripts/linux/image-digests.sh';

const SERVICES = '{"services":{"a":{"image":"example/a:1"},"b":{"build":"."}}}';

function withStubDocker(
  composeConfigExit: number,
  services: string = SERVICES,
  verb: string = 'before'
): { code: number; out: string; files: string[]; body: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lu-digest-'));
  const bin = join(dir, 'bin');
  const out = join(dir, 'out');
  mkdirSync(bin, { recursive: true });
  const stub = join(bin, 'docker');
  // Service "b" has no image: jq emits null for it, which without select(. != null)
  // is looked up as an image name. The success case covers that half of the fix.
  writeFileSync(
    stub,
    [
      '#!/bin/sh',
      'if [ "$1 $2" = "compose config" ]; then',
      `  if [ ${composeConfigExit} -ne 0 ]; then echo "stub failed" >&2; exit ${composeConfigExit}; fi`,
      `  echo '${services}'`,
      '  exit 0',
      'fi',
      'echo "sha256:deadbeef"',
      ''
    ].join('\n')
  );
  chmodSync(stub, 0o755);
  const r = sh(['bash', join(repoRoot, SCRIPT), verb], repoRoot, {
    PATH: `${bin}:/usr/bin:/bin`,
    LU_DIGEST_DIR: out
  });
  let files: string[] = [];
  try {
    // Snapshots only: a successful run also drops the .digest-run stamp here.
    files = readdirSync(out).filter((f) => f.startsWith('digests-'));
  } catch {
    files = [];
  }
  const body = files.length > 0 ? readFileSync(join(out, files[0]), 'utf8') : '';
  return { code: r.code, out: r.output, files, body };
}

describe('N5 a failed snapshot is not written', () => {
  test('with compose config failing, nothing is written and the exit is non-zero', () => {
    const r = withStubDocker(1);
    expect({ files: r.files, ok: r.code === 0 }).toEqual({ files: [], ok: false });
    expect(r.out).toContain('nothing was written');
  });

  test('and with compose config working, a snapshot is written', () => {
    // The counterpart. A script that refuses everything passes the case above.
    const r = withStubDocker(0);
    expect({ files: r.files.length, code: r.code }).toEqual({ files: 1, code: 0 });
    expect(r.body).toContain('example/a:1');
    // The service without an image is skipped rather than looked up as "null".
    expect(r.body).not.toContain('null');
  });

  test('and a stack whose images are all built locally still produces one', () => {
    // Mine, found while fixing the above. Every service image filtered out leaves
    // grep with nothing to print, and grep exits 1 for that; under pipefail that
    // ends `show`, which does not run emit in a condition and so has errexit in
    // force. Not an error -- just a stack that pulls nothing. Measured
    // 2026-09-11: rc 1 after two lines with grep, the whole snapshot with awk.
    const r = withStubDocker(0, '{"services":{"a":{"image":"liquidupstart/liquid:latest"}}}', 'show');
    expect(r.code).toBe(0);
    expect(r.out).toContain('# OpenClaw tags side by side');
  });

  test('the dead FAILED counter is gone', () => {
    // It was incremented inside $(...), so the increment landed in a subshell and
    // the parent read zero however many lookups failed. Counting the marker in
    // the written file is the only place it survives.
    const body = readFileSync(join(repoRoot, SCRIPT), 'utf8');
    expect(body).not.toContain('FAILED=$((FAILED + 1))');
    expect(body).toContain("grep -c '(lookup failed)'");
  });
});
