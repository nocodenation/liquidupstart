/**
 * M-B6 · Unit · The checker's own exit status, where `nar-build` now branches on it
 *
 * Purpose:  `nar-build` sends anything but 0 or 1 to its *cannot judge* arm, and
 *           the whole point of that is `check-index` answering **3** when it
 *           cannot read the index. `B6-42` drives the caller with a **stub**
 *           checker, so it proves the branching and says nothing about which
 *           status the real checker gives — and nothing else did either.
 *
 *           Found by reverting it: with `check-index` put back to returning 1 for
 *           an unreadable index, the whole of `m-b6.narcheck-unavailable` stayed
 *           **15 / 0**. A contract split across two programs needs a case on each
 *           side, or the half nobody holds is the half that drifts.
 * Given:    `config/liquid/narcheck.py` run as `nar-build` runs it —
 *           `python3 narcheck.py check-index <nar> <index dir>` — against index
 *           directories built in `mkdtemp`
 * When:     the index is unreadable; holds a byte that is not text; names no API
 *           package; and, as counterparts, is readable -- against a bundle with
 *           nothing to refuse, and against one referencing a NiFi class the
 *           index lacks
 * Then:     each of the first three exits **3** and says it cannot judge; the
 *           readable index yields a verdict instead, 0 and 1 -- which is the
 *           distinction the caller branches on
 * Covers:   B6-43
 * Unhappy:  Both are refusals, and the distinction between them is the subject:
 *           a checker that answered 3 for everything would satisfy the first
 *           scenario and take every real refusal out of the operator's reach, so
 *           the second is what gives the first its meaning.
 *
 * Test data, stated. The index directory holds all four files `check-index`
 *           opens -- `lib-classes.txt`, `api-packages.txt`, `nar-classes.txt`,
 *           `nar-parents.txt` -- because a missing one of them is itself an
 *           index it cannot read, which this case walked into. For the
 *           unreadable case `lib-classes.txt` is a **directory**, which `open()`
 *           refuses for every user -- it was `chmod 000`, which root reads, and
 *           nothing stopped the suite running as root (2026-10-21). For the
 *           second, `lib-classes.txt` holds `java/lang/String` and a line of one
 *           `0xff` byte. For the third, `api-packages.txt` is empty. `probe.nar` is
 *           a zip of one manifest, so a readable index -- `api-packages.txt` holding
 *           `org/apache/nifi/processor` -- has nothing to refuse;
 *           `refs.nar` carries `META-INF/bundled-dependencies/x.jar` holding a
 *           hand-built `a/B.class` that references `org/apache/nifi/processor/Gone`
 *           -- with `org/apache/nifi/processor` named in `api-packages.txt` it is
 *           refused, which shows the reference is a real one, and with the file
 *           empty it used to pass.
 */

import { test, expect, describe } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');

// A zip of one manifest, and one carrying a class that references a NiFi class.
// Written by `python3 -c` rather than `zip`, which this suite does not require.
const MAKE_NARS = [
  'import sys, zipfile, io, struct',
  'with zipfile.ZipFile(sys.argv[1], "w") as z:',
  '    z.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\\n")',
  'def utf8(t): b = t.encode(); return b"\\x01" + struct.pack(">H", len(b)) + b',
  'def cls(i): return b"\\x07" + struct.pack(">H", i)',
  'cp = [utf8("a/B"), cls(1), utf8("java/lang/Object"), cls(3), utf8("org/apache/nifi/processor/Gone"), cls(5)]',
  'body = b"\\xca\\xfe\\xba\\xbe" + struct.pack(">HHH", 0, 52, len(cp) + 1) + b"".join(cp) + struct.pack(">HHHHHHH", 0x21, 2, 4, 0, 0, 0, 0)',
  'jar = io.BytesIO()',
  'with zipfile.ZipFile(jar, "w") as j: j.writestr("a/B.class", body)',
  'with zipfile.ZipFile(sys.argv[2], "w") as z:',
  '    z.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\\n")',
  '    z.writestr("META-INF/bundled-dependencies/x.jar", jar.getvalue())'
].join('\n');

type Shape = { libAsDir?: boolean; lib?: Buffer | string; packages?: string; bundle?: 'probe' | 'refs' | 'adir' };

function checkIndex(shape: Shape = {}): { code: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lu-b6-43-'));
  try {
    const idx = join(dir, 'idx');
    mkdirSync(idx, { recursive: true });
    // **All four files `check-index` opens**, not just the one the gate checks
    // for. Found by writing this case: with only `lib-classes.txt` present it
    // answered 3 for a readable index too, because a missing `api-packages.txt`
    // is also an index it cannot read -- which is correct, and made the fixture
    // measure the wrong thing.
    // A package under org/apache/nifi/, as a real index lists them. It was
    // `java.lang` until 2026-10-21 -- dotted, and not an API package, so the
    // readable index judged nothing and its 0 meant nothing.
    writeFileSync(join(idx, 'api-packages.txt'), shape.packages ?? 'org/apache/nifi/processor\n');
    writeFileSync(join(idx, 'nar-classes.txt'), '');
    writeFileSync(join(idx, 'nar-parents.txt'), '');
    const index = join(idx, 'lib-classes.txt');
    if (shape.libAsDir) mkdirSync(index);
    else writeFileSync(index, shape.lib ?? 'java/lang/String\n');
    const made = sh(['python3', '-c', MAKE_NARS, join(dir, 'probe.nar'), join(dir, 'refs.nar')]);
    mkdirSync(join(dir, 'adir.nar'));
    expect(made.code, made.output).toBe(0);
    const r = sh(['python3', NARCHECK, 'check-index', join(dir, `${shape.bundle ?? 'probe'}.nar`), idx]);
    return { code: r.code, output: r.output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('B6-43 check-index answers 3 when it cannot read the index', () => {
  test('B6-43 the negative: an unreadable index is 3, not 1', () => {
    // 1 means "refused on merit" to the caller, which files the bundle under
    // `refused/` and tells the author it cannot link. An index this installation
    // cannot read is not the author's fault, and 3 is what says so.
    const r = checkIndex({ libAsDir: true });
    expect({ code: r.code, saysCannotJudge: r.output.includes('CANNOT JUDGE') }).toEqual({
      code: 3,
      saysCannotJudge: true
    });
    expect(r.output).toContain('not readable');
  });

  test('B6-43 and an index whose bytes are not text is 3, not a crash read as 1', () => {
    // **Found by a local review, 2026-10-21.** The reads caught OSError only, so
    // a byte that is not UTF-8 raised UnicodeDecodeError, escaped as a traceback,
    // and Python exited 1 -- which the caller reads as refused on merit, files
    // the bundle under refused/ and headlines as a link failure. Measured, in
    // the builder image as on the host.
    const r = checkIndex({ lib: Buffer.from('java/lang/String\n\xff\n', 'latin1') });
    expect({ code: r.code, cannotJudge: r.output.includes('CANNOT JUDGE'), traceback: r.output.includes('Traceback') }).toEqual({
      code: 3,
      cannotJudge: true,
      traceback: false
    });
  });

  test('B6-43 and an index that names no API package is 3, not a pass', () => {
    // **Found by a local review, 2026-10-21, and it is `main`'s as well.** With
    // `api-packages.txt` empty nothing is judged, every reference is skipped, and
    // the bundle passed: measured, `refs.nar` answers 0. `check` has refused an
    // empty set since S4 of the 2026-10-01 review; `check-index` had no such
    // guard, so a truncated index read as a verdict.
    const r = checkIndex({ packages: '', bundle: 'refs', lib: 'java/lang/String\njava/lang/Object\n' });
    expect({ code: r.code, cannotJudge: r.output.includes('CANNOT JUDGE') }).toEqual({ code: 3, cannotJudge: true });
    expect(r.output).toContain('names no API package');
  });

  test('B6-43 and a bundle the checker cannot open is 3, not a refusal', () => {
    // A crash inside the judging -- here `adir.nar`, a directory where the bundle
    // should be, so opening it raises IsADirectoryError -- escaped as a traceback
    // and exited 1, the caller's "refused on merit". Measured 2026-10-21 against
    // `main`'s narcheck: 1. It did not judge the bundle, and now says so.
    const r = checkIndex({ bundle: 'adir' });
    expect({ code: r.code, cannotJudge: r.output.includes('CANNOT JUDGE'), traceback: r.output.includes('Traceback') }).toEqual({
      code: 3,
      cannotJudge: true,
      traceback: false
    });
    expect(r.output).toContain('stopped before it reached a verdict');
  });

  test('B6-43 and an index naming only packages that are not the API is 3 as well', () => {
    // An empty list is not the only one that judges nothing: `java.lang`, in the
    // dotted form a hand-written fixture used, matches no reference narcheck
    // compares. Found by the second pass of the local review, 2026-10-21.
    const r = checkIndex({ packages: 'java.lang\n', bundle: 'refs', lib: 'java/lang/String\njava/lang/Object\n' });
    expect({ code: r.code, cannotJudge: r.output.includes('CANNOT JUDGE') }).toEqual({ code: 3, cannotJudge: true });
    expect(r.output).toContain('names no API package');
  });

  test('B6-43 and the same bundle against an index naming the package is refused on merit', () => {
    // The counterpart for the one above: the reference in `refs.nar` is one the
    // checker does catch when the index judges its package, so the 3 above is
    // about the empty index and not about a fixture with nothing in it.
    const r = checkIndex({ packages: 'org/apache/nifi/processor\n', bundle: 'refs', lib: 'java/lang/String\njava/lang/Object\n' });
    expect({ code: r.code, refused: r.output.includes('REFUSED') }).toEqual({ code: 1, refused: true });
    expect(r.output).toContain('org.apache.nifi.processor.Gone');
  });

  test('B6-43 the counterpart: a readable index yields a verdict, not a cannot-judge', () => {
    // Without this, a checker that answered 3 for everything would pass the
    // scenario above and quietly take every real refusal out of the operator's
    // reach: the caller would stop filing bundles under `refused/` and stop
    // saying what was wrong with them.
    //
    // **The verdict here is 0, and that is the honest assertion.** The probe
    // bundle carries a manifest and no classes, so a readable index has nothing
    // to refuse -- measured by hand before this was written. What this scenario
    // holds is the distinction the caller branches on: readable means *judged*,
    // whatever the judgement. `1` against a bundle that genuinely cannot link is
    // `B4-*`'s subject, with a real class file and a real reference, and is not
    // duplicated here.
    const r = checkIndex();
    expect({ code: r.code, cannotJudge: r.output.includes('CANNOT JUDGE') }).toEqual({
      code: 0,
      cannotJudge: false
    });
  });
});
