/**
 * M-B6 · Unit · The watcher leg's shell is asked, not assumed
 *
 * Purpose:  #29. B6-35's watcher leg ran in a locally built image, and where it
 *           was never built `docker run` exited 125 and four scenarios failed
 *           with `Received: ""`. Its `&` and `\&` scenarios can also only fail in
 *           a shell where an unquoted `&` in a replacement is the matched text:
 *           in `bash:5.1` they were measured green on the N5 defect, 2026-10-29.
 *           Whether a run had such a shell, and whether it ran at all, is decided
 *           by `watcherRunVerdict` in tests/lib/watchershell.ts, over the exit
 *           code and the `CANARY=` line the run prints from `${c//X/&&}`.
 * Given:    the exit code, stdout and stderr of a watcher run, as stated below.
 * When:     `watcherRunVerdict` reads them.
 * Then:     a run that exited 0 and printed `CANARY=XX` has no verdict; a run
 *           whose shell printed anything else, or no canary, is refused with the
 *           reason and the lines it read; and a non-zero exit is reported as the
 *           exit, with stderr, whatever stdout holds.
 * Covers:   B6-47, and B6-35's premise
 * Negative: `CANARY=&&`, a missing `CANARY=` line, and exit 125 beside `CANARY=XX`.
 * Counterpart: exit 0 with `CANARY=XX` and the rest of a real run's output passes,
 *           so refusing every run cannot satisfy the three negatives.
 *
 * Test data, the values measured on 2026-10-29: `BASH=5.2.15(1)-release` is
 * `debian:bookworm-slim`, `BASH=5.1.16(1)-release` and `CANARY=&&` are
 * `bash:5.1`, and the stderr line is what docker prints for
 * `liquidupstart/liquid:missing-for-29`, an image named so it cannot exist. The
 * exit row carries `CANARY=XX` on purpose: a function that read the canary first
 * would return `null` for it. B6-35's run() puts the same function to a real run
 * with `patsub_replacement` turned off.
 */
import { test, expect, describe } from 'bun:test';
import { watcherRunVerdict } from '../lib/watchershell';

describe('B6-47 a watcher run is read only if it ran, in a shell that can show the & defect', () => {
  test('B6-47 the counterpart: exit 0 and CANARY=XX has no verdict', () => {
    const stdout =
      'CANARY=XX\nBASH=5.2.15(1)-release\nLINE=x\nOUT=refused /nar_inbox/a.nar: a reason\nRAN=no\n';
    expect(watcherRunVerdict(0, stdout, '')).toBeNull();
  });

  test('B6-47 the negative: CANARY=&& is refused with the reason, the BASH= line and the canary', () => {
    const v = watcherRunVerdict(0, 'CANARY=&&\nBASH=5.1.16(1)-release\n', '');
    expect(v).toContain('cannot show the & defect');
    expect(v).toContain('BASH=5.1.16(1)-release');
    expect(v).toContain('CANARY=&&');
  });

  test('B6-47 the negative: output with no CANARY= line is refused with a message, not a TypeError', () => {
    const v = watcherRunVerdict(0, 'BASH=5.2.15(1)-release\n', '');
    expect(v).toContain('cannot show the & defect');
    expect(v).toContain('no CANARY= line');
  });

  test('B6-47 the negative: a non-zero exit is reported as the exit, with stderr, even beside CANARY=XX', () => {
    const stderr = "Unable to find image 'liquidupstart/liquid:missing-for-29' locally\n";
    const v = watcherRunVerdict(125, 'CANARY=XX\n', stderr);
    expect(v).toStartWith('watcher run exited 125:');
    expect(v).toContain("Unable to find image 'liquidupstart/liquid:missing-for-29' locally");
  });
});
