/**
 * M-B6 · Unit · The class budget bounds the parsing; this bounds the reading
 *
 * Purpose:  N3 of the 2026-10-13 re-review. `MAX_CLASS_BYTES` refuses a bundle
 *           whose declared class bytes exceed 512 MiB, read off each archive's
 *           central directory so a large declaration "costs nothing to refuse" --
 *           which was true of the outer archive and false of a bundled one.
 *           Reaching a bundled jar's directory means reading that jar whole and
 *           decompressing it into memory first, so the cap guarded the parsing and
 *           not the read.
 *
 *           Measured here before the repair, on a NAR whose bundled jar holds one
 *           four-byte class and an 800 MB stored blob: refused correctly, `rc=1`,
 *           after peaking at **1.57 GB**. The reviewer measured ~1.6 GB
 *           independently.
 * Given:    `config/liquid/narcheck.py`, and a lib directory holding a
 *           `nifi-api-*.jar` so the check reaches the bundle at all
 * When:     `check` is run over a bundle whose bundled jar declares more than the
 *           read limit, and over an ordinary one
 * Then:     the first is refused on the limit without being unpacked, the second
 *           is not refused for that reason, and peak memory stays small
 * Covers:   B6-37, FR36
 * Unhappy:  The bomb is the negative half. The ordinary bundled jar is the
 *           counterpart, and it is what keeps the fix from being "refuse every
 *           bundled jar", which would pass the first scenario perfectly.
 *
 * On the fixture, because it took two attempts: the blob has to be **stored**
 * rather than deflated inside the jar. Deflated, the jar's own uncompressed size
 * is under a megabyte, the outer directory declares that, and the fixture sails
 * past the defect it exists for -- measured, 815 KB declared instead of 800 MB.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');
let dir = '';

/** Python that builds the fixtures and a peak-RSS harness, all in the container. */
const SETUP = `
import io, zipfile, sys
def nar(path, stored_blob):
    inner = io.BytesIO()
    mode = zipfile.ZIP_STORED if stored_blob else zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(inner, 'w', mode) as z:
        z.writestr('org/apache/nifi/processor/Processor.class', b'\\xca\\xfe\\xba\\xbe')
        if stored_blob:
            z.writestr('blob.bin', b'\\0' * (800 * 1024 * 1024))
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as n:
        n.writestr('META-INF/bundled-dependencies/j.jar', inner.getvalue())
nar('/w/bomb.nar', True)
nar('/w/ok.nar', False)
with zipfile.ZipFile('/w/lib/nifi-api-2.10.0.jar', 'w') as z:
    z.writestr('org/apache/nifi/processor/Processor.class', b'\\xca\\xfe\\xba\\xbe')
`;

const MEASURE = `
import resource, subprocess, sys
r = subprocess.run([sys.executable, '/narcheck.py', 'check', sys.argv[1], '/w/lib'],
                   capture_output=True, text=True)
peak = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
print('RC=%d' % r.returncode)
print('PEAK_MB=%d' % (peak / 1024))
print('SAID=' + (r.stdout + r.stderr).replace('\\n', ' | ')[:400])
`;

const run = (which: string) =>
  sh([
    'docker', 'run', '--rm',
    '-v', `${NARCHECK}:/narcheck.py:ro`,
    '-v', `${dir}:/w`,
    '--entrypoint', 'sh', 'python:3.12-slim', '-c',
    `mkdir -p /w/lib && python3 /w/setup.py && python3 /w/measure.py ${which}`
  ], undefined, 600_000);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'm-b6-n3-'));
  writeFileSync(join(dir, 'setup.py'), SETUP);
  writeFileSync(join(dir, 'measure.py'), MEASURE);
});
afterAll(() => dir && rmSync(dir, { recursive: true, force: true }));

describe('B6-37 a bundled jar is refused on its declared size, before it is read', () => {
  test('B6-37 the bomb is refused on the read limit and costs little to refuse', () => {
    const r = run('/w/bomb.nar');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('RC=1');
    // The reason names the limit, not something downstream of having read it.
    expect(r.stdout).toMatch(/past the \d+-byte read limit/);
    expect(r.stdout).toContain('it is not unpacked');
    // Peak well under the 800 MB the jar declares. Before the repair: 1.57 GB.
    const peak = Number(r.stdout.match(/^PEAK_MB=(\d+)$/m)?.[1]);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(400);
  }, 900_000);

  test('B6-37 and an ordinary bundled jar is not refused for that reason', () => {
    // The counterpart: a guard that refused every bundled jar would satisfy the
    // scenario above and break every real NAR.
    const r = run('/w/ok.nar');
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/read limit/);
  }, 900_000);
});
