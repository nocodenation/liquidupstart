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
 *           read limit, over one that **declares 1000 bytes and inflates to
 *           800 MB**, and over an ordinary one
 * Then:     the first is refused on the limit without being unpacked, the second
 *           is refused on the disagreement between the directory and the entry,
 *           the third is not refused for either reason, and peak memory stays
 *           small in every case
 * Covers:   B6-37, FR36
 * Unhappy:  The bomb and the liar are the negative halves. The ordinary bundled
 *           jar is the counterpart, and it is what keeps the fix from being
 *           "refuse every bundled jar", which would pass both perfectly.
 *
 * On the liar, added 2026-10-14 for N6: the first fixture was honest by
 *           construction, so the limit it tested was the only limit there was.
 *           `zf.read` decompresses with `max_length = 2 GiB` and truncates to the
 *           declared size afterwards, so trusting that number cost the full
 *           800 MB anyway -- 1610 MB from an 815,695-byte file.
 *
 * On measuring it: the fixture is built by one process and measured by another,
 *           which is not tidiness. `fork` hands a child the parent's RSS, so
 *           building the 800 MB blob in the measuring process reports ~1.6 GB for
 *           every case including the ones that refuse immediately -- measured,
 *           and it is how a first attempt at this nearly mis-cleared N3.
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
import os, zipfile, sys
# On disk, a mebibyte at a time. This held 800 MB of zeros, then the 800 MB jar
# in a BytesIO, then its getvalue() copy, and with the stack up the container
# was killed for memory before narcheck ran: every red of B6-37 on 2026-10-20 and
# 2026-10-21 was the fixture, not the checker. Same zip structure as before --
# the blob stored in the jar, the jar deflated in the bundle.
def nar(path, stored_blob):
    inner = path + '.inner.jar'
    mode = zipfile.ZIP_STORED if stored_blob else zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(inner, 'w', mode) as z:
        z.writestr('org/apache/nifi/processor/Processor.class', b'\\xca\\xfe\\xba\\xbe')
        if stored_blob:
            chunk = b'\\0' * (1024 * 1024)
            with z.open('blob.bin', 'w') as blob:
                for _ in range(800):
                    blob.write(chunk)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as n:
        n.write(inner, 'META-INF/bundled-dependencies/j.jar')
    os.remove(inner)
nar('/w/bomb.nar', True)
nar('/w/ok.nar', False)

# N6: the same bomb, with its outer entry patched to DECLARE 1000 bytes in both
# the central directory and the local header. The read limit reads that number,
# so it passes -- and zf.read inflated the member whole anyway. 1610 MB from a
# 815,695-byte file, measured at the reviewed head.
import struct
nar('/w/liar.nar', True)
with open('/w/liar.nar', 'r+b') as f:
    d = bytearray(f.read())
    for sig, off in ((b'PK\x01\x02', 24), (b'PK\x03\x04', 22)):
        i = d.find(sig)
        while i != -1:
            struct.pack_into('<I', d, i + off, 1000)
            i = d.find(sig, i + 1)
    f.seek(0); f.write(d); f.truncate()
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
  ]);
  // No bound but the test's own: sh() takes no timeout, and the 600_000 that stood
  // here was its extraEnv, which copies nothing from a number. B6-37's block.

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

  test('B6-37 and a jar that lies about its size is bounded by the read, not by the claim', () => {
    // **N6 of the 2026-10-14 re-review**, and the same exhaustion N3 was about,
    // reached by lying instead of by asking. `zf.read` decompresses with
    // `max_length = 2 GiB` and only cuts the result to the declared size
    // afterwards, so an entry declaring 1000 bytes while its stream inflates to
    // 800 MB passed this limit and was inflated whole. The watcher runs `check`
    // inside the Liquid container and the inbox is agent-writable, so a sub-1 MB
    // file made Liquid spend 1.6 GB.
    //
    // Measured at the reviewed head: 1610 MB. With the read bounded: 13 MB.
    const r = run('/w/liar.nar');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('RC=1');
    // **Refused as a CRC mismatch, and that is the honest reading.** `ZipExtFile`
    // takes the declared size as the member's length, so asking for
    // `declared + 1` returns 1000 bytes, sets EOF and compares their CRC against
    // the directory's -- which belongs to the real 800 MB. So the sentence the
    // operator reads does not change; what changes is that it arrives after about
    // a kilobyte instead of after 800 MB. The first draft of this case asserted a
    // new size-disagreement message and was wrong about its own fix.
    expect(r.stdout).toMatch(/Bad CRC-32/);
    expect(r.stdout).toContain('could not be read out of the archive');
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
