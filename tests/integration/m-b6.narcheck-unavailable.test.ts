/**
 * M-B6 · Integration · A check that could not run must not read as a verdict
 *
 * Purpose:  On 2026-10-16, while measuring `B7-5` against a stack built from #25,
 *           every build was refused with *"it cannot link against the NiFi API the
 *           running Liquid loads"* — and the builds had succeeded. What had failed
 *           was `python3 /opt/builder/narcheck.py`, which `compose.yml` supplies as
 *           a **single-file** bind mount. The file was stat-able and unreadable at
 *           the same time: `ls` of the mounted directory omitted the entry, `stat`
 *           reported 29910 bytes, and `open()` returned ENOENT to `python3`, to
 *           `head` and to `cp` alike. Docker Desktop had kept a `/host_mnt`
 *           placeholder for a path a moved worktree had invalidated.
 *
 *           The gate's test was `[ -f "$NAR_CHECK" ]`, which stats. python3's
 *           non-zero status was then read as a refusal, and an operator was handed
 *           a verdict about their own code that nothing had reached. The honest
 *           message for an unavailable checker already existed, in the `else` arm
 *           of that very test.
 *
 *           Two states, one exit status, and that is the whole of it: `narcheck`
 *           returns 1 both for a bundle whose references the index does not have
 *           **and** for anything it could not read. Its own message distinguishes
 *           them; the headline above it did not.
 * Given:    The builder image built from the tree under test, `builderImage()`, and
 *           `narcheck_available` **evaluated out of the shipped `/opt/builder/build.sh`**
 *           rather than reimplemented — the idiom `B6-3` established, so the case
 *           cannot pass against a copy of the decision
 * When:     It is asked about a readable checker with an index, a checker present
 *           at mode 000 that the build user cannot open, a checker that is not
 *           there, and a readable checker with no index
 * Then:     Only the first is available; and the two messages in `build.sh` say
 *           what they established — the refusal headline no longer asserts a link
 *           failure, and the unavailable message says the check is the subject
 * Covers:   B6-40, FR36
 * Negative: The unreadable checker is the case the defect was. The absent checker
 *           and the missing index are the two states that were already handled and
 *           must stay handled.
 * Counterpart: The readable checker with an index is the positive half, and it is
 *           the one that keeps the fix from being "refuse everything": a guard that
 *           answered "not available" always would make every build refuse and
 *           pass every negative here perfectly.
 *
 * Not here: the ENOENT instance itself. A stat-able, unreadable file is a state of
 *           Docker Desktop's file sharing, not one this suite can create, so the
 *           field observation stands in the specification and the permission case
 *           carries the class in the suite. Both are the same question to the
 *           gate — can it read the checker — and the function answers it with a
 *           read either way.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { builderImage } from '../lib/builderimage';

const BUILD_SH = join(repoRoot, 'config/nar_builder/build.sh');
const script = readFileSync(BUILD_SH, 'utf8');

// One container, every state, so the file costs one `docker run` — B6-3's rule.
// The probe evals the real function and the real variable lines out of the script
// the image ships, then overrides the two paths per state.
const PROBE = [
  '#!/bin/sh',
  'eval "$(sed -n \'/^LIQUID_INDEX=/p;/^NAR_CHECK=/p;/^narcheck_available() {/,/^}/p\' /opt/builder/build.sh)"',
  'say() { narcheck_available && echo "$1 available" || echo "$1 unavailable"; }',
  'LIQUID_INDEX=/idx; NAR_CHECK=/mnt/readable.py   ; say readable',
  'LIQUID_INDEX=/idx; NAR_CHECK=/mnt/unreadable.py ; say unreadable',
  'LIQUID_INDEX=/idx; NAR_CHECK=/mnt/absent.py     ; say absent',
  'LIQUID_INDEX=/empty; NAR_CHECK=/mnt/readable.py ; say noindex'
].join('\n');

function states(): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'lu-b6-40-'));
  try {
    const mnt = join(dir, 'mnt');
    const idx = join(dir, 'idx');
    const empty = join(dir, 'empty');
    for (const d of [mnt, idx, empty]) mkdirSync(d, { recursive: true });
    // The checker's contents are irrelevant to the question; its readability is
    // the whole question. A short file keeps the fixture honest about that.
    writeFileSync(join(mnt, 'readable.py'), '# readable\n');
    chmodSync(join(mnt, 'readable.py'), 0o644);
    writeFileSync(join(mnt, 'unreadable.py'), '# present, and not readable\n');
    chmodSync(join(mnt, 'unreadable.py'), 0o000);
    writeFileSync(join(idx, 'lib-classes.txt'), 'java/lang/String\n');
    const probe = join(dir, 'probe.sh');
    writeFileSync(probe, PROBE);
    chmodSync(probe, 0o755);

    const r = sh([
      'docker', 'run', '--rm',
      // As the build user, because that is who the build runs as and who has to
      // be able to open the file. As root, mode 000 would be readable and the
      // case would measure nothing.
      '--user', 'builder',
      '--entrypoint', '/bin/sh',
      '-v', `${BUILD_SH}:/opt/builder/build.sh:ro`,
      '-v', `${mnt}:/mnt:ro`,
      '-v', `${idx}:/idx:ro`,
      '-v', `${empty}:/empty:ro`,
      '-v', `${probe}:/probe.sh:ro`,
      builderImage(),
      '/probe.sh'
    ]);
    if (r.code !== 0) throw new Error(`probe failed: ${r.output}`);
    const out: Record<string, string> = {};
    for (const line of r.stdout.trim().split('\n')) {
      const [name, verdict] = line.trim().split(/\s+/);
      out[name] = verdict;
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('B6-40 the gate asks whether the check can run, by reading', () => {
  const verdicts = states();

  test('B6-40 a checker present and unreadable is not available', () => {
    // The defect, as the class rather than as the instance: ENOENT from a stale
    // mount and EPERM from a mode are the same answer to the same question.
    expect(verdicts.unreadable, JSON.stringify(verdicts)).toBe('unavailable');
  });

  test('B6-40 and a checker that is not there is not available', () => {
    expect(verdicts.absent).toBe('unavailable');
  });

  test('B6-40 and a readable checker with no index is not available', () => {
    expect(verdicts.noindex).toBe('unavailable');
  });

  test('B6-40 the counterpart: a readable checker with an index is available', () => {
    // Without this, "refuse everything" passes all three above.
    expect(verdicts.readable, JSON.stringify(verdicts)).toBe('available');
  });
});

describe('B6-40 and each message says only what it established', () => {
  test('B6-40 the refusal headline no longer asserts a link failure', () => {
    // narcheck refuses for two reasons with one exit status. The headline used to
    // name one of them over whatever followed, including over its own words "the
    // index of what Liquid can load is not readable".
    expect({
      assertsLinkFailure: /refused: \$\{base\} was built, but it cannot link against the NiFi API/.test(script),
      namesBothReasons: /a bundle that cannot link against the\n.*API the running Liquid loads, or something the check could not read/.test(script)
    }).toEqual({ assertsLinkFailure: false, namesBothReasons: true });
  });

  test('B6-40 and the unavailable message names the check as the subject', () => {
    expect({
      saysUnreadable: /is missing or cannot be read/.test(script),
      saysNotYourCode: /this is about the check, not about the code/.test(script)
    }).toEqual({ saysUnreadable: true, saysNotYourCode: true });
  });

  test('B6-40 and the decision opens the file rather than stating it', () => {
    // On the function's own body, not on the script: the first version of this
    // assertion looked for the gate's old inline `[ -f ] && [ -f ]` form, which
    // the extraction removed on its own — so it would have passed with the read
    // probe deleted. Measured: reverting the probe left it green. An assertion
    // satisfied by a refactor is not guarding the fix.
    const body = script.match(/^narcheck_available\(\) \{\n([\s\S]*?)^\}/m)?.[1] ?? '';
    expect(body.length, 'narcheck_available not found').toBeGreaterThan(0);
    expect({
      readsIt: /head -c 1 "\$NAR_CHECK"/.test(body),
      alsoTestsExistence: /\[ -f "\$NAR_CHECK" \]/.test(body),
      testsTheIndex: /\[ -f "\$\{LIQUID_INDEX\}\/lib-classes\.txt" \]/.test(body)
    }).toEqual({ readsIt: true, alsoTestsExistence: true, testsTheIndex: true });
  });
});
