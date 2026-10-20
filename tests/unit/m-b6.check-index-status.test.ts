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
 * When:     the index is unreadable, and when it is readable and refuses the
 *           bundle
 * Then:     the first exits **3** and says it cannot judge, while a readable index
 *           yields a verdict instead -- which is the distinction the caller
 *           branches on
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
 *           unreadable case `lib-classes.txt` is `chmod 000`, which `open()` refuses for a
 *           non-root user — and this suite runs as the host user, not as root in
 *           a container, so the mode bites. The bundle is `probe.nar`, a zip of
 *           one entry, because `check-index` reads the index before it reads the
 *           bundle and the status under test is reached first -- and with a complete readable
 *           index it therefore passes, which is what the counterpart asserts.
 */

import { test, expect, describe } from 'bun:test';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');

function checkIndex(mode: number): { code: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lu-b6-43-'));
  try {
    const idx = join(dir, 'idx');
    mkdirSync(idx, { recursive: true });
    // **All four files `check-index` opens**, not just the one the gate checks
    // for. Found by writing this case: with only `lib-classes.txt` present it
    // answered 3 for a readable index too, because a missing `api-packages.txt`
    // is also an index it cannot read -- which is correct, and made the fixture
    // measure the wrong thing.
    writeFileSync(join(idx, 'api-packages.txt'), 'java.lang\n');
    writeFileSync(join(idx, 'nar-classes.txt'), '');
    writeFileSync(join(idx, 'nar-parents.txt'), '');
    const index = join(idx, 'lib-classes.txt');
    writeFileSync(index, 'java/lang/String\n');
    chmodSync(index, mode);
    const nar = join(dir, 'probe.nar');
    // A real zip, so a failure here is about the index and not about the
    // archive: `python3 -c` writes one rather than shelling out to `zip`, which
    // this suite does not require.
    const made = sh([
      'python3',
      '-c',
      'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],"w")\nz.writestr("META-INF/MANIFEST.MF","Manifest-Version: 1.0\\n")\nz.close()',
      nar
    ]);
    expect(made.code, made.output).toBe(0);
    const r = sh(['python3', NARCHECK, 'check-index', nar, idx]);
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
    const r = checkIndex(0o000);
    expect({ code: r.code, saysCannotJudge: r.output.includes('CANNOT JUDGE') }).toEqual({
      code: 3,
      saysCannotJudge: true
    });
    expect(r.output).toContain('not readable');
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
    const r = checkIndex(0o644);
    expect({ code: r.code, cannotJudge: r.output.includes('CANNOT JUDGE') }).toEqual({
      code: 0,
      cannotJudge: false
    });
  });
});
