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
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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
  'LIQUID_INDEX=/empty; NAR_CHECK=/mnt/readable.py ; say noindex',
  // **The state that distinguishes a read from `[ -r ]`**, which is what this
  // whole case is about and what nothing here could see. `A1` of the first
  // review: replacing `head -c 1` with `[ -r "$NAR_CHECK" ]` left all four
  // states above green, because mode 000 is exactly what `access(2)` *does*
  // catch. `/proc/self/mem` is stat-able, passes `access(2)`, and `read()` on it
  // returns EIO at offset 0 -- measured as `builder` in this image: the read
  // gate says unavailable, the old `-f` gate and an `[ -r ]` gate both say
  // available.
  'LIQUID_INDEX=/idx; NAR_CHECK=/proc/self/mem     ; say unopenable',
  // And the same two states put to the gates this one replaced, so the case can
  // say *which* gate each state discriminates rather than asserting one verdict.
  'rgate() { [ -r \"$1\" ] && echo \"$2 r-available\" || echo \"$2 r-unavailable\"; }',
  'fgate() { [ -f \"$1\" ] && echo \"$2 f-available\" || echo \"$2 f-unavailable\"; }',
  'rgate /proc/self/mem unopenableR',
  'fgate /proc/self/mem unopenableF',
  'rgate /mnt/unreadable.py unreadableR',
  'fgate /mnt/unreadable.py unreadableF'
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

describe('B6-40 and a read is what the gate is, which only one state can show', () => {
  const seen = states();

  test('B6-40 the negative: a checker that stats and passes access(2) but cannot be read', () => {
    // The fifth state, added 2026-10-20. Without it the specification's claim
    // that "the permission case stands for the mount case" held for *"the old
    // -f gate fails"* and not for *"the fix is a read"* -- the reviewer's
    // mutation to `[ -r ]` kept every behavioural case green.
    expect(seen.unopenable).toBe('unavailable');
  });

  test('B6-40 and a gate that only stats, or only asks access(2), says the opposite', () => {
    // **Asserted as a disagreement, not as per-gate literals, and that is from a
    // measurement that surprised me.** `A1` of the review reasoned that mode 000
    // is exactly what `access(2)` catches, so only `/proc/self/mem` could tell
    // the read gate from an `[ -r ]` gate. On this host it is **both**: a mode
    // 000 file on a Docker Desktop bind mount answers `[ -r ]` with *readable*
    // and `head -c 1` with a failure, because the mode bits a bind mount
    // presents are not what a read of it does. On a native Linux filesystem --
    // the reviewer's environment -- `access(2)` does catch mode 000, which is
    // why his `[ -r ]` mutation left his run green.
    //
    // So the property worth holding is the one that is true on both: there is a
    // state the read gate refuses and the weaker gates accept. Naming the
    // per-gate verdicts would pin this file to one platform's bind-mount
    // semantics, which is the kind of assertion that goes red on a colleague's
    // machine for a reason nobody can see.
    const disagreements = (['unopenable', 'unreadable'] as const).filter(
      (k) => seen[k] === 'unavailable' && (seen[`${k}R`] === `r-available` || seen[`${k}F`] === `f-available`)
    );
    expect(disagreements.length, JSON.stringify(seen)).toBeGreaterThan(0);
    // And the read gate's own answers are the same everywhere, so those are flat.
    expect({ unopenable: seen.unopenable, unreadable: seen.unreadable }).toEqual({
      unopenable: 'unavailable',
      unreadable: 'unavailable'
    });
  });
});

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
  test('B6-40 the headline is specific again, because the status now separates the two', () => {
    // **This case asserted the opposite until 2026-10-20, and the reviewer was
    // right about why.** narcheck refused for two unrelated reasons with one exit
    // status, so the headline was hedged -- *"a bundle that cannot link … or
    // something the check could not read"* -- which made it true in every case by
    // committing to nothing, and cost the common case its precise message.
    //
    // The separation belongs in the status, not in the wording: `check-index`
    // answers **3** for an index it cannot read, and the caller sends anything
    // but 0 or 1 to the cannot-judge arm. So the refusal headline can say what
    // it means again.
    expect({
      refusalIsSpecific: /was built and was not deployed, because it cannot link\nagainst the NiFi API the running Liquid loads/.test(script),
      hedgedFormIsGone: /or something the check could not read/.test(script),
      cannotJudgeIsSeparate: /it exited \$\{rc\}, which is not a verdict on\nyour bundle/.test(script)
    }).toEqual({ refusalIsSpecific: true, hedgedFormIsGone: false, cannotJudgeIsSeparate: true });
  });

  test('B6-40 and the cannot-judge message names the one condition that failed', () => {
    // It named all three at once and then offered only the index's remedy -- and
    // that remedy pointed at `volumes/liquid/api`, which has not been a host path
    // since #25. So an operator whose *checker* was unreadable, which is the
    // state that started this branch, was sent to Liquid's logs and to a
    // directory that is not there.
    expect({
      threeReasonsSeparately: /narcheck_unavailable_reason\(\) \{/.test(script),
      namesOneAtATime: /absent\) what=|unreadable\) what=|noindex\) what=/.test(script),
      aRemedyPerCause: /narcheck_remedy\(\) \{/.test(script),
      saysNotYourCode: /this is about the check, not about the code/.test(script),
      theDeadHostPathIsGone: /volumes\/liquid\/api is writable/.test(script),
      theLiveRemedyIsThere: /docker compose exec liquid ls -l \/opt\/nifi\/nifi-current\/api/.test(script),
      andTheCheckerHasItsOwn: /docker compose exec nar_builder head -c 1/.test(script)
    }).toEqual({
      threeReasonsSeparately: true,
      namesOneAtATime: true,
      aRemedyPerCause: true,
      saysNotYourCode: true,
      theDeadHostPathIsGone: false,
      theLiveRemedyIsThere: true,
      andTheCheckerHasItsOwn: true
    });
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

describe('B6-42 what each exit status of the check means, one row per status', () => {
  // **Blocking item 1 of the first review, as rows.** The caller had two
  // outcomes and the script needs three: any non-zero went to the refused arm,
  // so three unrelated states were filed as "your bundle was refused" and the
  // bundle was moved under `refused/` --
  //
  //   2   python3 could not open the checker after the probe passed. The field
  //       state was a Docker Desktop placeholder, exactly the kind that can
  //       change between `head` and `python3`.
  //   127 python3 absent, or 126 not executable. `narcheck_available` never
  //       looks at python3 at all.
  //   1   narcheck could not read the index -- about this installation, not
  //       about the author's code, and now 3.
  //
  // The headline coped by hedging to something true in every case, which cost
  // the common case its precise message.
  //
  // The function is driven directly, with a stub on `NAR_CHECK` that exits the
  // status under test, so there is a row per status and no Maven run. It is
  // `eval`-ed out of the real script -- `B6-3`'s idiom -- so no reimplementation
  // can satisfy these.
  function judge(status: number, says = 'stub says so'): {
    code: number;
    output: string;
    deployed: boolean;
    refused: boolean;
  } {
    const dir = mkdtempSync(join(tmpdir(), 'lu-b6-42-'));
    try {
      const drop = join(dir, 'drop');
      const idx = join(dir, 'idx');
      mkdirSync(drop, { recursive: true });
      mkdirSync(idx, { recursive: true });
      writeFileSync(join(idx, 'lib-classes.txt'), 'java/lang/String\n');
      const part = join(dir, 'probe.nar.part');
      writeFileSync(part, 'not really a nar\n');
      const stub = join(dir, 'narcheck-stub.py');
      // A python file in name only: the caller runs `python3 "$NAR_CHECK"`, and a
      // stub that exits N is all the status contract needs.
      // JSON-encoded into the source, because the first version interpolated the
      // text raw and a newline in it made an unterminated Python literal -- the
      // stub then exited 1 from a SyntaxError, which is the status under test by
      // accident. A stub that fails for its own reasons measures nothing.
      writeFileSync(
        stub,
        `import sys\nsys.stdout.write(${JSON.stringify(says + '\n')})\nsys.exit(${status})\n`
      );
      chmodSync(stub, 0o755);
      const r = sh([
        'bash',
        '-c',
        [
          'set -u',
          `eval "$(sed -n '/^literal_replace() {/,/^}/p;/^narcheck_available() {/,/^}/p;/^narcheck_unavailable_reason() {/,/^}/p;/^narcheck_remedy() {/,/^}/p;/^judge_and_place() {/,/^}/p' ${JSON.stringify(BUILD_SH)})"`,
          `DROP=${JSON.stringify(drop)}`,
          `LIQUID_INDEX=${JSON.stringify(idx)}`,
          `NAR_CHECK=${JSON.stringify(stub)}`,
          'work=""',
          `judge_and_place ${JSON.stringify(part)} probe.nar`
        ].join('\n')
      ]);
      return {
        code: r.code,
        output: r.output,
        deployed: existsSync(join(drop, 'probe.nar')),
        refused: existsSync(join(drop, 'refused', 'probe.nar'))
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test('B6-42 the positive: exit 0 deploys', () => {
    const r = judge(0);
    expect({ code: r.code, deployed: r.deployed, refused: r.refused }).toEqual({
      code: 0,
      deployed: true,
      refused: false
    });
  });

  test('B6-42 the negative: exit 1 is refused on merit, with the link headline, and kept under refused/', () => {
    const r = judge(1, 'REFUSED probe.nar\n  it references org/example/Missing');
    expect({ code: r.code, deployed: r.deployed, refused: r.refused }).toEqual({
      code: 2,
      deployed: false,
      refused: true
    });
    // The specific headline, which the hedged form had taken away.
    expect(r.output).toContain('because it cannot link');
    expect(r.output).toContain('org/example/Missing');
  });

  test.each([
    ['3, an index narcheck cannot read', 3],
    ['2, python3 unable to open the checker', 2],
    ['127, no python3 at all', 127]
  ])('B6-42 the negative: exit %s is not a verdict, so nothing is deployed and nothing is filed as refused', (_name, status) => {
    const r = judge(status as number);
    expect({ code: r.code, deployed: r.deployed, refused: r.refused }).toEqual({
      code: 2,
      deployed: false,
      refused: false
    });
    expect(r.output).toContain('cannot be judged');
    expect(r.output).toContain('not a verdict on');
    // And it must not claim the bundle cannot link, which is what it used to.
    expect(r.output).not.toContain('because it cannot link');
  });

  test('B6-42 and every status that is not 0 leaves the drop directory empty of it', () => {
    // The fail-closed property, over the whole range rather than per row: only 0
    // deploys. Without this the three rows above could each pass while some
    // fourth status fell through to the deployment.
    for (const status of [1, 2, 3, 126, 127, 255]) {
      const r = judge(status);
      expect({ status, deployed: r.deployed }).toEqual({ status, deployed: false });
    }
  });
});
