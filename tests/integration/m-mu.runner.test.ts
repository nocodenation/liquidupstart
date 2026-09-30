/**
 * MU-1 to MU-12 — the mutation runner, proved against its own failure modes.
 *
 * Purpose: `tests/mutate.sh` exists to show that a case can fail. Its own
 * failure — silently skipping, or calling a green run a discovery — would be the
 * fifth instance of the defect it was built to remove, wearing the uniform of
 * the cure. So these cases are recursive on purpose: **the runner must be shown
 * to fail when it cannot run.**
 *
 * The classification it has to get right, and why there are four outcomes:
 *
 *   validated   the named test failed and at least one test still passed
 *   refused     EVERY test failed — a broken file, not a control
 *   failed      the named test passed; the entry protects something else
 *   unresolved  nothing went red at all
 *
 * `unresolved` carries the milestone. A green run reads as *"no case protects
 * this rule"*, which is exactly the discovery the tool exists to make — and in
 * the sample of 2026-09-19 that reading was wrong four times out of thirteen.
 * Two of those shapes are catchable mechanically (MU-2, MU-3); the third,
 * *applied once and still ineffective*, is not. MU-11 is what stops the runner
 * concluding from it.
 *
 * Given  a throwaway tree with a real subject, a real test file and a registry
 * When   the runner is pointed at it
 * Then   each entry is classified as above, and the subject is byte-identical
 *        afterwards whatever the outcome
 *
 * Real files rather than mocks, in a temporary directory rather than this
 * repository: the runner writes deliberately broken lines into its subject, and
 * a case that did that to the working tree would be worse than no case.
 *
 * Test data, stated. The subject `subject.sh`:
 *
 *     POLICY="protected"      the rule one test asserts
 *     MODE=600                the rule a second asserts
 *     FIELDS="A B C"          all three of the third test's assertions
 *     UNUSED="spare"          referenced by nothing, for the ineffective mutation
 *
 * The test file asserts each of those, so a mutation of `FIELDS` reddens three
 * tests at once and one of `UNUSED` reddens none.
 *
 * Requirements covered: MU-FR1 to MU-FR7, MU-NFR2, MU-NFR3.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { makeTree, dropTree } from '../lib/fixtures';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const RUNNER = join(repoRoot, 'tests/mutate.sh');

let root: string;
const SUBJECT = 'subject.sh';
const SPEC = 'spec/fixture.test.ts';

const subjectBody = [
  '#!/bin/sh',
  'POLICY="protected"',
  'MODE=600',
  'FIELDS="A B C"',
  'UNUSED="spare"',
  // Twice on purpose: MU-3 needs a `from` that cannot be located, and a string
  // that happens to be unique today would make that case pass for the wrong
  // reason tomorrow.
  'TWICE="here"',
  'TWICE="here"',
  ''
].join('\n');

const specBody = `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });
test('the mode is 600', () => { expect(s).toContain('MODE=600'); });
test('field A is carried', () => { expect(s).toContain('"A B C"'); });
test('field B is carried', () => { expect(s).toMatch(/FIELDS="A B C"/); });
`;

function registry(entries: Record<string, string>[]): string {
  const p = join(root, `reg-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(entries, null, 2));
  return p;
}

const entry = (over: Record<string, string> = {}) => ({
  case: 'FX-1',
  file: SUBJECT,
  spec: SPEC,
  from: 'POLICY="protected"',
  to: 'POLICY="public"',
  mustFail: 'the policy is protected',
  ...over
});

function run(reg: string, extra: string[] = [], env: Record<string, string> = {}) {
  return sh(['bash', RUNNER, '--registry', reg, '--root', root, '--timeout', '30000', ...extra],
    undefined as unknown as string, env);
}

const sha = () => createHash('sha256').update(readFileSync(join(root, SUBJECT))).digest('hex');
let cleanSha: string;

// The shared harness, not a second copy of the same mkdtemp/rmSync lifecycle.
// Point 7 of the 2026-09-22 review.
beforeAll(() => {
  root = makeTree({ [SUBJECT]: subjectBody, [SPEC]: specBody });
  cleanSha = sha();
});

afterAll(() => {
  dropTree(root);
});

describe('MU-1 / MU-12 a mutation that reddens its named test is validated', () => {
  test('MU-1 the named test goes red and a survivor remains', () => {
    const r = run(registry([entry()]));
    expect(r.output).toContain('VALIDATED FX-1');
    expect(r.output).toContain('validated=1');
    expect(r.code).toBe(0);
  });

  test('MU-12 and a mutation that also reddens a sibling is still validated', () => {
    // Four of ten entries in the 2026-09-19 sample did this: a rule asserted
    // from both sides by two tests. The earlier rule — "the rest must pass" —
    // would have refused every one of them.
    const r = run(registry([entry({ from: 'FIELDS="A B C"', to: 'FIELDS="X"', mustFail: 'field A is carried' })]));
    expect(r.output).toContain('VALIDATED FX-1');
    expect(r.output).toMatch(/\(2 red, 2 green\)/);
  });
});

describe('MU-2 / MU-3 a mutation that cannot be applied is a failure, not a silence', () => {
  test('MU-2 a `from` that is not in the subject is refused, and says the subject moved', () => {
    // The case this milestone exists to earn. Skipping here would reproduce the
    // defect inside the tool built to remove it.
    const r = run(registry([entry({ from: 'POLICY="nonexistent"' })]));
    expect(r.output).toContain('REFUSED   FX-1');
    expect(r.output).toContain('the subject moved');
    expect(r.code).not.toBe(0);
  });

  test('MU-3 a `from` that occurs twice is refused, and says how often', () => {
    // Not a controlled experiment: nobody can say which occurrence carried the
    // rule, and replacing one of two is how the 2026-09-19 sample produced a
    // green run that looked like a finding.
    const r = run(registry([entry({ from: 'TWICE="here"', to: 'TWICE="gone"' })]));
    expect(r.output).toMatch(/occurs 2 times/);
    expect(r.code).not.toBe(0);
  });

  test('and neither left the subject changed', () => {
    expect(sha()).toBe(cleanSha);
  });
});

describe('MU-4 / MU-5 the named test, and not everything with it', () => {
  test('MU-4 a red test that is not the named one is a failure, not a pass', () => {
    const r = run(registry([entry({ from: 'MODE=600', to: 'MODE=644' })]));
    expect(r.output).toContain('FAILED    FX-1');
    expect(r.output).toContain("but not 'the policy is protected'");
    expect(r.code).not.toBe(0);
  });

  test('MU-5 a mutation that reddens every test is refused as a broken file', () => {
    // Otherwise a mutation that breaks compilation would validate every entry in
    // the registry at once — the same shape as a broken query satisfying an
    // assertion that something is absent. Emptying the subject is the smallest
    // edit that reddens all four, since every assertion reads it.
    const r = run(registry([entry({ from: subjectBody.trimEnd(), to: '' })]));
    expect(r.output).toContain('REFUSED   FX-1');
    expect(r.output).toContain('that is a broken file, not a control');
    expect(r.code).not.toBe(0);
  });

  test('MU-14 but a file holding one test is validated when that test reddens', () => {
    // The survivor rule has no survivor to ask for here, and refusing on that
    // basis would reject every honest entry against a single-test spec. Found
    // while backfilling A4-6, whose spec has exactly one test; before this the
    // runner called it a broken file.
    const solo = 'spec/solo.test.ts';
    writeFileSync(
      join(root, solo),
      [
        "import { test, expect } from 'bun:test';",
        "import { readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');",
        "test('the only rule there is', () => { expect(s).toContain('POLICY=\"protected\"'); });",
        ''
      ].join('\n')
    );
    const r = run(registry([entry({ spec: solo, mustFail: 'the only rule there is' })]));
    expect(r.output).toContain('VALIDATED FX-1');
    expect(r.output).toMatch(/\(1 red, 0 green\)/);
  });

  test('and a spec that does not exist is refused before anything is mutated', () => {
    const r = run(registry([entry({ spec: 'spec/missing.test.ts' })]));
    expect(r.output).toContain('no such test file');
    expect(r.code).not.toBe(0);
    expect(sha()).toBe(cleanSha);
  });
});

describe('MU-11 a green run is a question, not a finding', () => {
  test('a mutation that changes nothing observable is unresolved', () => {
    const r = run(registry([entry({ from: 'UNUSED="spare"', to: 'UNUSED="other"' })]));
    expect(r.output).toContain('UNRESOLVED FX-1');
    expect(r.output).toContain('second mutation');
    expect(r.output).toContain('unresolved=1');
  });

  test('and it is neither validated nor failed, so nothing is concluded from it', () => {
    const r = run(registry([entry({ from: 'UNUSED="spare"', to: 'UNUSED="other"' })]));
    expect(r.output).toContain('validated=0');
    expect(r.output).toContain('failed=0');
    // Deliberately not an error: making it one would push an author towards a
    // mutation that reddens something rather than the one that tests the rule.
    expect(r.code).toBe(0);
  });
});

describe('MU-6 the subject goes back, whatever the outcome', () => {
  test('after a validated run, a failed run and an unresolved run alike', () => {
    for (const e of [
      entry(),
      entry({ from: 'MODE=600', to: 'MODE=644' }),
      entry({ from: 'UNUSED="spare"', to: 'UNUSED="other"' })
    ]) {
      run(registry([e]));
      expect(sha()).toBe(cleanSha);
    }
  });

  test('and the backup file is not left behind either', () => {
    // TMPDIR under the fixture, because mktemp puts the backup where TMPDIR
    // says -- never beside the subject. Looking for `subject.sh.*` next to the
    // subject therefore answered zero whether or not `rm -f "$BACKUP"` ran:
    // deleting that line left this case green and mktemp files accumulating in
    // /tmp. A case that passes over any implementation is the defect this whole
    // milestone is about. Item 6 of the 2026-09-22 review.
    const tmp = join(root, 'tmp-backups');
    mkdirSync(tmp, { recursive: true });
    run(registry([entry()]), [], { TMPDIR: tmp });
    const left = readdirSync(tmp);
    expect(left).toEqual([]);
  });

});

describe('MU-13 a run that validated nothing says so', () => {
  test('an empty registry is reported, not printed as four zeros', () => {
    // The hazard MU-2 names, met in the tool itself: a quiet run and a healthy
    // run produce the same four counters. A main-based branch starts with an
    // empty registry legitimately, so this is a sentence rather than an error.
    const r = run(registry([]));
    expect(r.output).toContain('registry is empty');
    expect(r.code).toBe(0);
  });

  test('and a --case that matches nothing is an error', () => {
    // This one is not benign. Asking for one case and being told "0 failures"
    // by a runner that never found it is the check-that-cannot-run, addressed
    // to whoever was most confident it had run.
    const r = run(registry([entry()]), ['--case', 'NOPE-1']);
    expect(r.output).toContain('no entry for case NOPE-1');
    expect(r.code).not.toBe(0);
  });
});

describe('MU-9 the registry mutates subjects, never assertions', () => {
  test('an entry naming a test file is refused before anything runs', () => {
    // A tool that can rewrite the tests can make anything pass.
    const r = run(registry([entry({ file: 'tests/unit/whatever.test.ts' })]));
    expect(r.output).toContain('names a test file as its subject');
    expect(r.code).not.toBe(0);
  });
});

describe('MU-7 it does not run over uncommitted work', () => {
  test('a tracked subject with local changes stops the entry', () => {
    const g = (...a: string[]) => sh(['git', '-C', root, ...a]);
    g('init', '-q');
    g('config', 'user.email', 'probe@example.invalid');
    g('config', 'user.name', 'probe');
    g('add', '-A');
    g('commit', '-qm', 'fixture');
    writeFileSync(join(root, SUBJECT), subjectBody + '# local edit\n');
    const r = run(registry([entry()]));
    expect(r.output).toContain('has uncommitted changes');
    expect(r.code).not.toBe(0);
    // The counterpart: with the tree clean again it proceeds. A guard that
    // refused always would satisfy the half above on its own.
    writeFileSync(join(root, SUBJECT), subjectBody);
    const ok = run(registry([entry()]));
    expect(ok.output).toContain('VALIDATED FX-1');
  });
});

describe('MU-8 the gap is a number, not an impression', () => {
  test('the report counts specified cases, registered ones and the difference', () => {
    // Against a specification with known contents rather than against whatever
    // this branch happens to carry: the first version asserted "more than a
    // hundred cases", which is a property of #9 and fails on a branch cut from
    // main with one specification on it. The rule is that the parser finds what
    // is there, not that a particular branch is large.
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(
      join(root, 'docs/TEST-SPEC-fixture.md'),
      [
        '| ID | Level | Sign | Case |',
        '|---|---|---|---|',
        '| FX-1 | unit | positive | one |',
        '| **FX-2** | contract | **negative** | two, bolded |',
        '| FX-3 | integration | positive | three |',
        '',
        'Prose mentioning FX-9 must not count, because it is not a row.'
      ].join('\n')
    );
    const reg = registry([entry()]); // FX-1 is registered; FX-2 and FX-3 are not
    const r = sh(['bash', RUNNER, '--gaps', '--registry', reg, '--root', root]);
    expect(r.code).toBe(0);
    expect(r.output).toContain('specified=3 registered=1 missing=2 orphaned=0');
    expect(r.output).toMatch(/missing:\s+FX-2 FX-3/);
  });

  test('and it reads the real specifications of whatever branch it runs on', () => {
    // The counterpart to the fixture: a parser that works only on its own test
    // data is a parser nobody can trust against the tree it ships with.
    const r = sh(['bash', RUNNER, '--gaps']);
    expect(r.code).toBe(0);
    const specified = Number(r.output.match(/specified=(\d+)/)![1]);
    expect(specified).toBeGreaterThan(0);
  });

  test('and an entry no specification mentions is reported as orphaned', () => {
    // A case renamed or deleted leaves its entry behind, and a registry that
    // grows entries for cases that no longer exist is a registry nobody trusts.
    const r = sh(['bash', RUNNER, '--gaps', '--registry', registry([entry({ case: 'ZZ-99' })])]);
    expect(r.output).toContain('orphaned=1');
    expect(r.output).toContain('ZZ-99');
  });
});

// ---------------------------------------------------------------------------
// MU-19 to MU-23 — the five blocking findings of the 2026-09-22 review. Each was
// reproduced against the runner as it stood before it was touched.
// ---------------------------------------------------------------------------

describe('MU-19 a field that is empty stays its own field', () => {
  test('MU-19 a deletion mutation validates, and for its own reason', () => {
    // Finding 1. Tab is IFS whitespace, so an empty `to` -- what a deletion
    // looks like, the most natural mutation there is -- collapsed the delimiter
    // and shifted every later field left: `to` took the mustFail text and
    // `must` became empty, and an empty needle matches any failing line. The
    // entry read VALIDATED over a mutation that had tested nothing.
    const r = run(registry([entry({ to: '' })]));
    expect(r.output).toContain('VALIDATED FX-1');
    // The point: the named test is what reddened, not merely something.
    expect(r.output).toContain('the policy is protected');
    expect(r.code).toBe(0);
  });

  test('MU-19 and an empty `from` is refused before anything is touched', () => {
    // indexOf("") answers 0 forever, so there is nothing to locate and nothing
    // to replace.
    const r = run(registry([entry({ from: '' })]));
    expect(r.code).toBe(2);
    expect(r.output).toContain('empty from');
    expect(sha()).toBe(cleanSha);
  });
});

describe('MU-20 a run in which nothing executed is not a result', () => {
  test('MU-20 a spec that matches no file is refused, not called quiet', () => {
    // Finding 2. bun missing, bun crashing, a filter matching nothing, or a
    // mutation that breaks the spec at load time all produce a tally of zero
    // and zero -- which read as "nothing went red" and exited 0. A check that
    // could not run is the one thing this tool must never report as an answer.
    // A spec that exists and runs nothing -- which is what bun reports for a
    // file whose tests fail to load, and the shape a mutation can itself
    // produce by breaking the spec it is measured against. A missing file is
    // already refused one guard earlier; this is the case that guard cannot
    // reach.
    const spec = 'spec/empty.test.ts';
    writeFileSync(join(root, spec), 'export {};\n');
    const r = run(registry([entry({ spec })]));
    expect(r.output).toContain('REFUSED   FX-1');
    // The baseline now refuses this one step earlier and says more: the named
    // test never ran. The zero-tally guard stays behind it as a backstop.
    expect(r.output).toContain('did not run in');
    expect(r.code).not.toBe(0);
    expect(sha()).toBe(cleanSha);
  });
});

describe('MU-21 the guard is about being a test, not about living under tests/', () => {
  test('MU-21 a test file reached by a roundabout path is still refused', () => {
    // Finding 3. The guard matched the literal prefix `tests/`, so `./tests/…`
    // and `tests/../tests/…` walked past it and the runner would have rewritten
    // assertions -- which MU-9 claims is impossible.
    for (const file of ['./spec/roundabout.test.ts', 'spec/../spec/roundabout.test.ts']) {
      const r = run(registry([entry({ file })]));
      expect(r.output).toContain('names a test file as its subject');
    }
  });

  test('MU-21 and a test file outside tests/ is refused too', () => {
    // `bun test src` runs the dashboard suite, so a .test.ts there is an
    // assertion like any other and the prefix form never saw it.
    writeFileSync(join(root, 'srcish.test.ts'), 'export {};\n');
    const r = run(registry([entry({ file: 'srcish.test.ts' })]));
    expect(r.output).toContain('names a test file as its subject');
  });

  test('MU-21 while a script that merely lives under tests/ is a subject', () => {
    // The counterpart, and the reason the prefix was wrong in both directions:
    // tests/run.sh is a subject in its own right, and the first version refused
    // A0-4 as though it were an assertion.
    mkdirSync(join(root, 'tests'), { recursive: true });
    writeFileSync(join(root, 'tests/helper.sh'), '#!/bin/sh\nPOLICY="protected"\n');
    const r = run(registry([entry({ file: 'tests/helper.sh', mustFail: 'the policy is protected' })]));
    expect(r.output).not.toContain('names a test file as its subject');
  });
});

describe('MU-22 the named test, matched as a whole', () => {
  test('MU-22 a sibling whose name merely contains the needle does not stand in', () => {
    // Finding 4. bun prints `(fail) describe > name`, and the needle was
    // searched inside that line -- so `the policy is protected` was satisfied by
    // `the policy is protected on restart` going red while the named test
    // stayed green. The entry read VALIDATED while protecting nothing.
    const spec = 'spec/sibling.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('the policy is protected', () => { expect(s).toContain('POLICY='); });
test('the policy is protected on restart', () => { expect(s).toContain('POLICY="protected"'); });
test('an unrelated survivor', () => { expect(s).toContain('#!/bin/sh'); });
`);
    const r = run(registry([entry({ spec, mustFail: 'the policy is protected' })]));
    expect(r.output).toContain('FAILED    FX-1');
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
  });

  test('MU-22 and the named test itself still validates', () => {
    // The counterpart: the anchoring must not make honest entries unmatchable.
    const spec = 'spec/sibling.test.ts';
    const r = run(registry([entry({ spec, mustFail: 'the policy is protected on restart' })]));
    expect(r.output).toContain('VALIDATED FX-1');
  });
});

describe('MU-23 a backup that was not taken stops the mutation', () => {
  test('MU-23 an impossible backup refuses, and the subject is untouched', () => {
    // Finding 5. There is no `set -e` here on purpose, so a failed mktemp left
    // BACKUP empty, cp failed, SUBJECT was set anyway -- and restore() requires
    // a BACKUP, so the tracked file stayed mutated with nothing to put back.
    const r = run(registry([entry()]), [], { TMPDIR: join(root, 'no-such-dir') });
    expect(r.output).toContain('could not back');
    expect(r.code).not.toBe(0);
    expect(sha()).toBe(cleanSha);
  });
});

// ---------------------------------------------------------------------------
// MU-24 to MU-31 — the second review of 2026-09-28. Items 1 to 5 are blocking,
// 6, 7 and 9 are its "should fix". Each was reproduced against the runner as it
// stood at 375b557, and the reviewer's own live-run table is the source of the
// scenarios.
// ---------------------------------------------------------------------------

describe('MU-24 a test that is already red validates nothing', () => {
  test('MU-24 a named test failing for its own reasons is refused', () => {
    // Finding 1, and the deepest one: the spec was never run unmutated, so a
    // failure that has nothing to do with the mutation was credited to it. A
    // stack that is down, a timeout, a flake -- any of them turned every
    // mutation, including one that edits an unused line, into VALIDATED.
    const spec = 'spec/already-red.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
test('the policy is protected', () => { expect('broken env').toBe('ok'); });
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    const r = run(registry([entry({ spec, from: 'UNUSED="spare"', to: 'UNUSED="other"' })]));
    expect(r.output).toContain('REFUSED   FX-1');
    expect(r.output).toContain('already red before the mutation');
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
  });

  test('MU-24 and a mustFail nobody answers to is refused as well', () => {
    // Finding 8: a typo, a rename or a test.skip left the run UNRESOLVED and
    // exit 0. The baseline asks whether the named test ran at all.
    const r = run(registry([entry({ mustFail: 'the polcy is protected' })]));
    expect(r.output).toContain('did not run in');
    expect(r.code).not.toBe(0);
  });
});

describe('MU-25 a mutation that never reached the file is not a measurement', () => {
  test('MU-25 an edit that leaves the subject unchanged is refused', () => {
    // Finding 2. The writer's exit status was ignored, so a subject the write
    // never landed on meant the spec ran against the original file and the run
    // came back UNRESOLVED, exit 0 -- or VALIDATED once the baseline was
    // missing too. The runner answers it by comparing the subject with its
    // backup after the write.
    //
    // Staged with an entry whose `to` is its `from`, which is also a registry
    // mistake worth refusing on its own. The first staging made the subject
    // read-only, and chmod is ignored for root: the container and CI run as
    // root, where the write landed, the spec went red and the case failed for
    // a reason that had nothing to do with the rule. Item 1 of the 2026-09-29
    // re-review.
    const r = run(registry([entry({ to: 'POLICY="protected"' })]));
    expect(r.output).toContain('REFUSED   FX-1');
    expect(r.output).toContain('did not reach');
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
  });

  test('MU-25 the counterpart: an edit that does land is measured', () => {
    // Otherwise the guard could be met by refusing every entry.
    const r = run(registry([entry()]));
    expect(r.output).toContain('VALIDATED FX-1');
    expect(r.output).not.toContain('did not reach');
  });
});

describe('MU-26 a restore that failed keeps its backup', () => {
  test('MU-26 the backup survives and the run says where it is', () => {
    // Finding 3. `cp` then `rm -f` unconditionally: when the copy back failed
    // -- a full disk, a read-only mount, a parent directory replaced while the
    // spec ran -- the backup went anyway and the tracked file stayed mutated
    // with nothing left to restore it from.
    //
    // The parent directory is removed by the spec itself, in the window
    // between the mutation and the restore, so `cp` has nowhere to copy back
    // to. That is one of the causes the finding names, and unlike the
    // permission staging it holds for root as well -- root may remove a
    // directory, and no uid can write into one that is gone. Item 1 of the
    // 2026-09-29 re-review.
    const dir = join(root, 'fragile');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'subject.sh'), subjectBody);
    const spec = 'spec/fragile.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const dir = join(import.meta.dir, '..', 'fragile');
const s = readFileSync(join(dir, 'subject.sh'), 'utf8');
test('the policy is protected', () => {
  rmSync(dir, { recursive: true, force: true });
  expect(s).toContain('POLICY="protected"');
});
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    const tmp = join(root, 'tmp-restore');
    mkdirSync(tmp, { recursive: true });
    const r = run(registry([entry({ file: 'fragile/subject.sh', spec })]), [], { TMPDIR: tmp });
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('the backup is kept at');
    // The backup is still on disk, so the mutated file can be put back by hand.
    expect(readdirSync(tmp).length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('MU-27 the named test is matched as a whole name', () => {
  test('MU-27 a sibling whose name ends with it does not stand in', () => {
    // Finding 4. The previous repair anchored at the end of the LINE, which
    // fixed the longer-sibling direction and left this one: `not field A is
    // carried` ends with `field A is carried`.
    const spec = 'spec/negated.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('field A is carried', () => { expect(s).toContain('FIELDS='); });
test('not field A is carried', () => { expect(s).toContain('FIELDS="A B C"'); });
test('an unrelated survivor', () => { expect(s).toContain('#!/bin/sh'); });
`);
    const r = run(registry([entry({
      spec, from: 'FIELDS="A B C"', to: 'FIELDS="X"', mustFail: 'field A is carried'
    })]));
    expect(r.output).toContain('FAILED    FX-1');
    expect(r.output).not.toContain('VALIDATED');
  });
});

describe('MU-28 the guard covers assertions and what they read', () => {
  test('MU-28 test infrastructure is refused whatever it is called', () => {
    // Finding 5. The previous repair swapped the `tests/` prefix for
    // `*.test.ts`, which let helpers, snapshots and other bun test-file shapes
    // through -- and mutating a helper rewrites the expected values, which is
    // the thing the guard exists to prevent.
    mkdirSync(join(root, 'tests/lib'), { recursive: true });
    mkdirSync(join(root, 'spec/__snapshots__'), { recursive: true });
    const refused: Record<string, string> = {
      'tests/lib/helper.ts': 'export const EXPECTED = "protected";\n',
      'spec/__snapshots__/x.snap': 'exports[`a 1`] = `protected`;\n',
      'spec/x.test.tsx': 'export {};\n',
      'spec/y_test.ts': 'export {};\n',
      'spec/z.spec.js': 'export {};\n',
      'tests/mutations.json': '[]\n'
    };
    for (const [file, body] of Object.entries(refused)) {
      writeFileSync(join(root, file), body);
      const r = run(registry([entry({ file })]));
      expect(r.output).toMatch(/names (a test file|test infrastructure)/);
    }
  });

  test('MU-28 while a runner script under tests/ is still a subject', () => {
    // The counterpart. Restoring a blanket `tests/` refusal would take A0-4
    // with it: tests/run.sh is a subject in its own right, and nothing asserts
    // against its contents.
    writeFileSync(join(root, 'tests/run.sh'), '#!/bin/sh\nPOLICY="protected"\n');
    const r = run(registry([entry({ file: 'tests/run.sh' })]));
    expect(r.output).not.toMatch(/names (a test file|test infrastructure)/);
  });

  test('MU-28 and a path that climbs out of the tree is refused', () => {
    const r = run(registry([entry({ file: 'spec/../../outside.sh' })]));
    expect(r.output).toContain('outside the repository');
  });
});

describe('MU-29 --gaps cannot answer quietly either', () => {
  test('MU-29 a registry it cannot parse is an error, not a silence', () => {
    // Finding 6. `exit 0` ran unconditionally after the bun program, so a
    // malformed registry printed a JSON error to stderr and still reported
    // success -- the reassuring silence this tool is against.
    const bad = join(root, 'broken.json');
    writeFileSync(bad, '[{"case": "A-1",\n');
    const r = run(bad, ['--gaps']);
    expect(r.code).not.toBe(0);
  });
});

describe('MU-30 a spec that did not load measured nothing', () => {
  test('MU-30 an import-time throw is refused, not called a failure', () => {
    // Finding 7. bun 1.4.2 reports it as `0 pass / 1 fail / 1 error`, so the
    // tally is not empty and the run came back FAILED -- saying the entry does
    // not protect what it claims, when in truth nothing ran.
    const spec = 'spec/throws.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
if (!s.includes('POLICY="protected"')) throw new Error('subject is not usable');
test('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    const r = run(registry([entry({ spec })]));
    expect(r.output).toContain('REFUSED   FX-1');
    expect(r.output).toContain('did not load');
    expect(r.output).not.toContain('FAILED');
  });
});

describe('MU-31 the spec is a path, not a filter', () => {
  test('MU-31 a sibling file is not counted into the tally', () => {
    // Finding 9. `bun test x.test.ts` is a substring filter over every test
    // file under ROOT, so `x.test.tsx` was run too and its results landed in
    // the survivor count -- and every run scanned the whole repository.
    const body = `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });
test('an unrelated survivor', () => { expect(s).toContain('#!/bin/sh'); });
`;
    writeFileSync(join(root, 'spec/filter.test.ts'), body);
    writeFileSync(join(root, 'spec/filter.test.tsx'), `
import { test, expect } from 'bun:test';
test('sibling one', () => { expect(1).toBe(1); });
test('sibling two', () => { expect(1).toBe(1); });
test('sibling three', () => { expect(1).toBe(1); });
`);
    const r = run(registry([entry({ spec: 'spec/filter.test.ts' })]));
    expect(r.output).toContain('VALIDATED FX-1');
    expect(r.output).toMatch(/\(1 red, 1 green\)/);
  });
});

describe('MU-32 a registry the runner cannot read stops it', () => {
  test('MU-32 a normal run says so and exits 2', () => {
    // Not in the review, found while building its item 6. In bun 1.3.13 a
    // program that calls require() runs as CJS, and an uncaught error there
    // exits **0 with no message** -- so `bun -e ... || exit 2` never fired and
    // a malformed registry produced an empty row set. The run then announced
    // "registry is empty", which is a different and reassuring untruth.
    const bad = join(root, 'broken-run.json');
    writeFileSync(bad, '[{"case": "A-1",\n');
    const r = run(bad);
    expect(r.code).toBe(2);
    expect(r.output).toContain('registry:');
    expect(r.output).not.toContain('registry is empty');
  });
});

describe('MU-33 a baseline refusal takes its backup with it', () => {
  test('MU-33 neither refusal path leaves a copy behind', () => {
    // Item 2 of the 2026-09-29 re-review. The backup is taken before the
    // baseline runs, and both baseline refusals -- already red, and never ran
    // -- left the file in TMPDIR: nothing had been mutated, so `restore` had
    // nothing to put back and never cleared it. A registry of any size dropped
    // one copy of the subject per refused entry.
    //
    // MU-26 is the counterpart: when the restore itself fails the backup has to
    // stay, so this cannot be met by deleting it unconditionally.
    const spec = 'spec/leak-red.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
test('the policy is protected', () => { expect('broken env').toBe('ok'); });
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    for (const [why, reg] of [
      ['already red', registry([entry({ spec, from: 'UNUSED="spare"', to: 'UNUSED="other"' })])],
      ['did not run', registry([entry({ mustFail: 'the polcy is protected' })])]
    ] as [string, string][]) {
      const tmp = join(root, `leak-${why.replace(/\s/g, '-')}`);
      mkdirSync(tmp, { recursive: true });
      const r = run(reg, [], { TMPDIR: tmp });
      expect(r.output).toContain('REFUSED   FX-1');
      expect(readdirSync(tmp)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// MU-34 to MU-38 — `all`, `exempt` and the bounded run, moved here from #17.
//
// #17 carried its own earlier copy of this runner, 170 lines different, and both
// branches add the same four files: `git merge-tree` gives add/add conflicts on
// all of them, and resolving toward #17 would bring back everything #18 fixed.
// Its registry needs two features only its runner had, so they come here first
// and #17 keeps the registry alone. Findings 1, 4, 5 and 6 of the 2026-09-29
// review of #17.
// ---------------------------------------------------------------------------

describe('MU-34 an exemption is a registered decision, not a missing entry', () => {
  test('MU-34 it is reported with its reason and counted apart', () => {
    // §6 draws the line: decision logic needs a mutation, an assertion about an
    // artefact already on disk cannot have one, because mutating the code that
    // produced it changes nothing about the file. A3-3 reads
    // volumes/_git-secrets/known_hosts, and the keyscan that wrote it ran days
    // ago.
    const reason = 'the file it asserts about was written days ago by a keyscan';
    const r = run(registry([{ case: 'FX-1', exempt: reason }]));
    expect(r.output).toContain(`EXEMPT    FX-1  ${reason}`);
    expect(r.output).toContain('exempt=1');
    expect(r.output).not.toContain('REFUSED');
    expect(r.code).toBe(0);
  });

  test('MU-34 and the same checks apply to it as to everything else', () => {
    // Item 4. The exempt path returned before the loader's checks, so a newline
    // in the reason produced a phantom entry -- `REFUSED   written days ago  no
    // such subject:` -- and an empty case gave `REFUSED   -  no such subject: -`.
    for (const bad of [
      { case: 'FX-1', exempt: 'written\ndays ago' },
      { case: '', exempt: 'a reason' },
      { case: 'FX-1', exempt: '' }
    ]) {
      const r = run(registry([bad as Record<string, string>]));
      expect(r.code).toBe(2);
      expect(r.output).not.toContain('REFUSED');
    }
  });

  test('MU-34 and an entry that is both is a contradiction, not an exemption', () => {
    // It was silently exempted and its mutation never ran: a case that stopped
    // being proven, with nobody deciding that.
    const r = run(registry([{ ...entry(), exempt: 'a reason' }]));
    expect(r.code).toBe(2);
    expect(r.output).toContain('is exempt and also carries a mutation');
  });
});

describe('MU-35 `all` is a declaration, not a loosening', () => {
  test('MU-35 without it, a `from` that occurs twice is still refused', () => {
    // The reason a second occurrence is usually a mistake: the author had one in
    // mind. The subject carries TWICE="here" twice on purpose.
    const r = run(registry([entry({ from: 'TWICE="here"', to: 'TWICE="gone"' })]));
    expect(r.output).toContain('occurs 2 times');
    expect(r.output).toContain('"all": true');
    expect(r.code).not.toBe(0);
  });

  test('MU-35 with it, every occurrence is replaced and the subject goes back', () => {
    // A3c-8 needs it: the same mount line appears in compose.yml once per agent
    // service, and the case requires all three.
    const spec = 'spec/twice.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('both occurrences are there', () => {
  expect(s.split('TWICE="here"').length - 1).toBe(2);
});
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    const r = run(
      registry([
        entry({
          spec,
          from: 'TWICE="here"',
          to: 'TWICE="gone"',
          all: true as unknown as string,
          mustFail: 'both occurrences are there'
        })
      ])
    );
    expect(r.output).toContain('VALIDATED FX-1');
    expect(sha()).toBe(cleanSha);
  });

  test('MU-35 and a non-boolean `all` is an error rather than a guess', () => {
    const r = run(registry([entry({ all: 'yes' })]));
    expect(r.code).toBe(2);
    expect(r.output).toContain('non-boolean all');
  });
});

describe('MU-36 --gaps says what an exemption decided, and fails on an orphan', () => {
  const spec = () => {
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(
      join(root, 'docs/TEST-SPEC-gaps.md'),
      ['| ID | Level | Sign | Case |', '|---|---|---|---|', '| FX-1 | unit | positive | one |'].join('\n')
    );
  };

  test('MU-36 an exemption is listed with its reason', () => {
    // Item 5. It was counted as covered and the reason never shown, so the one
    // thing a reader needs in order to disagree with it was the one thing hidden.
    spec();
    const reason = 'the artefact predates the run';
    const reg = registry([{ case: 'FX-1', exempt: reason }]);
    const r = sh(['bash', RUNNER, '--gaps', '--registry', reg, '--root', root]);
    expect(r.code).toBe(0);
    expect(r.output).toContain('exempt=1');
    expect(r.output).toContain(`exempt:   FX-1  ${reason}`);
  });

  test('MU-36 and a registered case no specification mentions is an error', () => {
    // A registry claiming to cover something that is not there. Missing entries
    // are not an error -- a gap is the ordinary state of a registry being filled
    // in -- but an orphan means a case was renamed or deleted and the entry
    // outlived it.
    spec();
    const reg = registry([entry({ case: 'ZZ-99' })]);
    const r = sh(['bash', RUNNER, '--gaps', '--registry', reg, '--root', root]);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('orphaned: ZZ-99');
    expect(r.output).toContain('in no TEST-SPEC');
  });
});

describe('MU-37 the whole run is bounded, not only each test in it', () => {
  test('MU-37 a mutation that makes the spec hang is refused, and the subject goes back', () => {
    // Item 6, specified as MU-10 and never built. bun --timeout ends a test that
    // awaits too long; it cannot end one that never yields, so `while (true) {}`
    // hung the runner for ever. An async hang was worse: bun reddened the test
    // and the run came back VALIDATED, so the budget was a promise the tool did
    // not keep either way.
    const spec = 'spec/hang.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('the policy is protected', () => {
  if (s.includes('POLICY="public"')) { while (true) {} }
  expect(s).toContain('POLICY="protected"');
});
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    const r = run(registry([entry({ spec })]), [], { MUTATE_RUN_BUDGET_MS: '8000' });
    expect(r.output).toContain('did not finish within 8000ms under the mutation');
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
    // The other half of MU-10: however the run ends, the subject is what it was.
    expect(sha()).toBe(cleanSha);
  }, 300_000);

  test('MU-37 and a spec that is already too slow unmutated is refused before anything is touched', () => {
    // Otherwise the budget would blame the mutation for a spec that never fits
    // in it -- the same misattribution the baseline run exists to prevent.
    const spec = 'spec/slow.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
test('the policy is protected', async () => {
  await new Promise((r) => setTimeout(r, 60000));
  expect(1).toBe(1);
});
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    const r = run(registry([entry({ spec })]), [], { MUTATE_RUN_BUDGET_MS: '6000' });
    expect(r.output).toContain('unmutated');
    expect(r.output).not.toContain('VALIDATED');
    expect(sha()).toBe(cleanSha);
  }, 300_000);
});

describe('MU-38 while an ordinary run is not slowed by the bound', () => {
  test('MU-38 the counterpart: a normal entry still validates', () => {
    // A budget that ended a healthy run would make every entry REFUSED, which is
    // the direction this tool must never fail in.
    const r = run(registry([entry()]), [], { MUTATE_RUN_BUDGET_MS: '300000' });
    expect(r.output).toContain('VALIDATED FX-1');
    expect(r.code).toBe(0);
  });
});
