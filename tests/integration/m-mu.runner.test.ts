/**
 * MU-1 to MU-59 — the mutation runner, proved against its own failure modes.
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
 *     TWICE="here"            twice over, on consecutive lines
 *     TWICE="here"
 *
 * The test file asserts each of the first four, so a mutation of `FIELDS` reddens
 * three tests at once and one of `UNUSED` reddens none. `TWICE` is there twice on
 * purpose: MU-3 needs a `from` that cannot be located to one place, and a string
 * that happens to be unique today would make that case pass for the wrong reason
 * tomorrow. The shared spec holds **four** tests, which is what gives every case
 * a survivor to point at.
 *
 * The directory becomes a git repository only when MU-7 runs `git init` in it, so
 * cases before and after MU-7 see different state -- and four cases do not use the
 * fixture at all: MU-8's three `--gaps` scenarios and MU-59 read this repository.
 *
 * Requirements covered: MU-FR1 to MU-FR7, MU-NFR1, MU-NFR2, MU-NFR3.
 *
 * *Header corrected 2026-10-09.* It said "MU-1 to MU-12", omitted MU-NFR1, and
 * its stated subject data left the two `TWICE` lines out -- so a reader checking
 * the fixture against the description would have found a file with two lines in
 * it that the description did not mention. Finding 9 of the 2026-10-01 re-review.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

  test('MU-3 and neither left the subject changed', () => {
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

  test('MU-58 and a spec that does not exist is refused before anything is mutated', () => {
    const r = run(registry([entry({ spec: 'spec/missing.test.ts' })]));
    expect(r.output).toContain('no such test file');
    expect(r.code).not.toBe(0);
    expect(sha()).toBe(cleanSha);
  });
});

describe('MU-11 a green run is a question, not a finding', () => {
  test('MU-11 a mutation that changes nothing observable is unresolved', () => {
    const r = run(registry([entry({ from: 'UNUSED="spare"', to: 'UNUSED="other"' })]));
    expect(r.output).toContain('UNRESOLVED FX-1');
    expect(r.output).toContain('second mutation');
    expect(r.output).toContain('unresolved=1');
  });

  test('MU-11 and it is neither validated nor failed, so nothing is concluded from it', () => {
    const r = run(registry([entry({ from: 'UNUSED="spare"', to: 'UNUSED="other"' })]));
    expect(r.output).toContain('validated=0');
    expect(r.output).toContain('failed=0');
    // Deliberately not an error: making it one would push an author towards a
    // mutation that reddens something rather than the one that tests the rule.
    expect(r.code).toBe(0);
  });
});

describe('MU-6 the subject goes back, whatever the outcome', () => {
  test('MU-6 after a validated run, a failed run and an unresolved run alike', () => {
    for (const e of [
      entry(),
      entry({ from: 'MODE=600', to: 'MODE=644' }),
      entry({ from: 'UNUSED="spare"', to: 'UNUSED="other"' })
    ]) {
      run(registry([e]));
      expect(sha()).toBe(cleanSha);
    }
  });

  test('MU-6 and the backup file is not left behind either', () => {
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
  test('MU-13 an empty registry is reported, not printed as four zeros', () => {
    // The hazard MU-2 names, met in the tool itself: a quiet run and a healthy
    // run produce the same four counters. A main-based branch starts with an
    // empty registry legitimately, so this is a sentence rather than an error.
    const r = run(registry([]));
    expect(r.output).toContain('registry is empty');
    expect(r.code).toBe(0);
  });

  test('MU-55 and a --case that matches nothing is an error', () => {
    // This one is not benign. Asking for one case and being told "0 failures"
    // by a runner that never found it is the check-that-cannot-run, addressed
    // to whoever was most confident it had run.
    const r = run(registry([entry()]), ['--case', 'NOPE-1']);
    expect(r.output).toContain('no entry for case NOPE-1');
    expect(r.code).not.toBe(0);
  });
});

describe('MU-9 the registry mutates subjects, never assertions', () => {
  test('MU-9 an entry naming a test file is refused before anything runs', () => {
    // A tool that can rewrite the tests can make anything pass.
    const r = run(registry([entry({ file: 'tests/unit/whatever.test.ts' })]));
    expect(r.output).toContain('names a test file as its subject');
    expect(r.code).not.toBe(0);
  });
});

describe('MU-7 it does not run over uncommitted work', () => {
  test('MU-7 a tracked subject with local changes stops the entry', () => {
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
  test('MU-8 the report counts specified cases, registered ones and the difference', () => {
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

  test('MU-8 and it reads the real specifications of whatever branch it runs on', () => {
    // The counterpart to the fixture: a parser that works only on its own test
    // data is a parser nobody can trust against the tree it ships with.
    const r = sh(['bash', RUNNER, '--gaps']);
    expect(r.code).toBe(0);
    const specified = Number(r.output.match(/specified=(\d+)/)![1]);
    expect(specified).toBeGreaterThan(0);
  });

  test('MU-8 and an entry no specification mentions is reported as orphaned', () => {
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

describe('MU-39 a signal stops the run rather than being noted and ignored', () => {
  test('MU-39 SIGTERM ends it mid-run, the subject goes back, and no verdict is printed', async () => {
    // Found on 2026-09-30 by carrying out MU-6s interrupt half as the manual
    // check the specification calls for. The subject always came back and the
    // exit code was always 143 -- but the signal was acted on only after the spec
    // run had finished by itself: 40 seconds against a spec that sleeps 40, which
    // on a registry of thirty entries is indistinguishable from the signal being
    // ignored.
    //
    // The cause was the shape rather than the handler: `out="$(run_spec ...)"`
    // put the run inside a command substitution, and bash defers a trap until the
    // current foreground command completes. run_spec leaves its output in a file
    // now and the polling loop runs in the parent shell, so a handler fires within
    // one poll and takes bun with it.
    //
    // SIGTERM, not SIGINT: a background command started by a non-interactive shell
    // inherits SIGINT ignored, and a signal ignored on entry cannot be trapped --
    // so an INT-based case would measure bash rather than this runner. Ctrl-C in a
    // terminal signals the whole foreground process group and was never the
    // affected path; a supervisor sending TERM to the script was.
    const spec = 'spec/slow-under-mutation.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('the policy is protected', async () => {
  // Slow only once the mutation has landed, so the baseline is quick and the
  // signal arrives while the mutated subject is on disk.
  if (s.includes('POLICY="public"')) await new Promise((r) => setTimeout(r, 40000));
  expect(s).toContain('POLICY="protected"');
});
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    const child = Bun.spawn(
      ['bash', RUNNER, '--registry', registry([entry({ spec })]), '--root', root, '--timeout', '90000'],
      { stdout: 'pipe', stderr: 'pipe' }
    );

    // Wait for the mutation to be on disk, so the signal lands mid-run rather
    // than before anything has happened.
    const subject = join(root, SUBJECT);
    const deadline = Date.now() + 30_000;
    let landed = false;
    while (Date.now() < deadline) {
      if (readFileSync(subject, 'utf8').includes('POLICY="public"')) {
        landed = true;
        break;
      }
      await Bun.sleep(100);
    }
    expect(landed).toBe(true);

    const sent = Date.now();
    child.kill('SIGTERM');
    const status = await child.exited;
    const stopped = Date.now() - sent;
    const output = (await new Response(child.stdout).text()) + (await new Response(child.stderr).text());

    // The number is the finding: the spec sleeps 40s, and the runner used to wait
    // it out. Fifteen seconds is far above the ~2s it takes now and far below the
    // 40 it took then, so the case says which behaviour is there.
    expect(stopped).toBeLessThan(15_000);
    expect(status).not.toBe(0);
    // An interrupted run that printed VALIDATED would be the worst outcome of
    // all: a verdict the run had not earned, from the tool whose whole purpose is
    // to refuse those.
    expect(output).not.toContain('VALIDATED');
    expect(output).toContain('no entry was judged past this point');
    // And MU-6s two promises, which held before and must still hold.
    expect(sha()).toBe(cleanSha);
  }, 300_000);
});

// ---------------------------------------------------------------------------
// MU-40 to MU-45 — the second re-review of 2026-09-30, on the JUnit reader.
//
// Reading the record instead of the console was right, and it let four things
// through that the console reader had caught. Three of them are about what an
// element in that record means; one is older than the reader and one is about
// the baseline having a tally nobody read.
// ---------------------------------------------------------------------------

describe('MU-40 a test that did not run is not a test that passed', () => {
  const skipSpec = (body: string) => {
    const spec = `spec/skip-${Math.random().toString(36).slice(2, 7)}.test.ts`;
    writeFileSync(join(root, spec), `
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
${body}
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    return spec;
  };

  test('MU-40 skip, todo and a skipped block are all refused, not read as green', () => {
    // Finding 1 of the 2026-09-30 review, and finding 8 of the first review
    // again -- for the variant the refusal message itself names, "renamed,
    // skipped, or misspelt". bun writes a skipped test as an element with a body
    // and no <failure>, so the reader took it for a pass and the baseline said
    // the named test was green before the mutation.
    //
    // MU-24 stages only the misspelt one, which is why the suite was green over
    // this.
    const cases: [string, string][] = [
      ['test.skip', `test.skip('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });`],
      ['test.todo', `test.todo('the policy is protected');`],
      [
        'describe.skip',
        `describe.skip('a skipped block', () => {
  test('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });
});`
      ]
    ];
    for (const [what, body] of cases) {
      const r = run(registry([entry({ spec: skipSpec(body) })]));
      expect(r.output).toContain('did not run in');
      expect(r.output).not.toContain('UNRESOLVED');
      expect(r.output).not.toContain('VALIDATED');
      expect({ what, code: r.code }).toEqual({ what, code: r.code === 0 ? -1 : r.code });
      expect(r.code).not.toBe(0);
    }
  }, 300_000);
});

describe('MU-41 the describe path comes from the nesting, not from classname', () => {
  const nested = 'spec/nested.test.ts';
  const seed = () =>
    writeFileSync(join(root, nested), `
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
describe('outer', () => {
  describe('inner', () => {
    test('in inner', () => { expect(s).toContain('POLICY="protected"'); });
  });
  test('in outer', () => { expect(1).toBe(1); });
});
describe('a & b > "c"', () => {
  describe('deep', () => {
    test('quoted parents', () => { expect(s).toContain('POLICY="protected"'); });
  });
});
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);

  test('MU-41 the name bun prints is the name that matches', () => {
    // Finding 2. classname is innermost-first -- `inner > outer` for what the
    // console prints as `outer > inner` -- and bun 1.3.13 escapes it twice, so
    // reading it made the verdict depend on which bun was installed. That is the
    // one thing this reader exists to avoid. The <testsuite> nesting is written
    // the same way by both and escaped once.
    seed();
    const r = run(registry([entry({ spec: nested, mustFail: 'outer > inner > in inner' })]));
    expect(r.output).toContain('VALIDATED FX-1');
  }, 300_000);

  test('MU-41 and the reversed order is refused, on either bun', () => {
    // The counterpart: it validated on 1.4.2 and was refused on 1.3.13, which is
    // the asymmetry the finding is about.
    seed();
    const r = run(registry([entry({ spec: nested, mustFail: 'inner > outer > in inner' })]));
    expect(r.output).toContain('did not run in');
  }, 300_000);

  test('MU-41 and a parent whose own name carries the separator is still matched', () => {
    // `a & b > "c"` has the joining string inside one segment, and ampersands and
    // quotes besides -- which is where reading an escaped attribute went wrong.
    seed();
    const r = run(
      registry([entry({ spec: nested, mustFail: 'a & b > "c" > deep > quoted parents' })])
    );
    expect(r.output).toContain('VALIDATED FX-1');
  }, 300_000);
});

describe('MU-42 a case that is a block stands for the tests under it', () => {
  const block = 'spec/block.test.ts';
  const seed = () =>
    writeFileSync(join(root, block), `
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
describe('A10-14 a checked-in template is not a credential', () => {
  for (const name of ['.env.example', '.env.sample']) {
    test(\`\${name} reaches the remote\`, () => { expect(s).toContain('POLICY="protected"'); });
  }
});
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);

  test('MU-42 the block name is enough, which is how A10-14 is written', () => {
    // Finding 5, and a decision rather than a repair. Cases in this project are
    // often a describe whose tests are generated in a loop -- A10-14 and A10-20
    // on #17, and this file's own MU-40 -- so there is no single test name to
    // give. A block stands for every test under it: red if any is red, not run if
    // none ran.
    seed();
    const r = run(
      registry([
        entry({ spec: block, mustFail: 'A10-14 a checked-in template is not a credential' })
      ])
    );
    expect(r.output).toContain('VALIDATED FX-1');
  }, 300_000);

  test('MU-42 and a name is still never matched by part of another', () => {
    // The counterpart, and what keeps the block rule from undoing MU-27: segments
    // are compared whole. `.env.example reaches the remote` is a test under the
    // block; `reaches the remote` is nothing.
    seed();
    const r = run(registry([entry({ spec: block, mustFail: 'reaches the remote' })]));
    expect(r.output).toContain('did not run in');
  }, 300_000);
});

describe('MU-43 a subject that cannot be compared is not a mutation that landed', () => {
  test('MU-43 a spec that removes its own subject is refused', () => {
    // Finding 3, and older than the reader. `cmp` answers 0 for identical, 1 for
    // different and **2 for trouble** -- a file it cannot open -- and only 0
    // refused, so trouble read as "the mutation reached it". The line above that
    // check already claimed the write was verified rather than assumed.
    const spec = 'spec/vanishing.test.ts';
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'sub/subject.sh'), subjectBody);
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const file = join(import.meta.dir, '..', 'sub', 'subject.sh');
// Read first, so the baseline is green, then remove it -- which is what leaves
// cmp with nothing to open.
const s = readFileSync(file, 'utf8');
rmSync(file, { force: true });
test('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });
test('an unrelated survivor', () => { expect(1).toBe(1); });
`);
    const r = run(registry([entry({ file: 'sub/subject.sh', spec })]));
    expect(r.output).toContain('the mutation did not reach sub/subject.sh');
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
  }, 300_000);
});

describe('MU-44 a baseline that did not load says so, rather than blaming the name', () => {
  test('MU-44 an import-time throw before the mutation names the error', () => {
    // Finding 6. The baseline has the same tally to read as the run after it, and
    // without reading it the message was "renamed, skipped, or misspelt" -- which
    // sends the author to look at the name instead of at the error. MU-30 covers
    // the same thing after the mutation.
    const spec = 'spec/throws-at-baseline.test.ts';
    writeFileSync(join(root, spec), `
import { test, expect } from 'bun:test';
throw new Error('this spec does its work at load time, and the work failed');
test('the policy is protected', () => { expect(1).toBe(1); });
`);
    const r = run(registry([entry({ spec })]));
    expect(r.output).toContain('did not load before the mutation');
    expect(r.output).not.toContain('renamed, skipped, or misspelt');
    expect(r.code).not.toBe(0);
  }, 300_000);
});

describe('MU-45 the console differs between a person and an agent, on one machine', () => {
  test('MU-45 the record is read because of that, not because of a version', () => {
    // Finding 4, and a correction of my own reasoning rather than a defect. I
    // reported that bun 1.3.13 prints only `(fail)` lines while 1.4.2 also prints
    // `(pass)`. Both versions do both; what differs is whether the shell looks
    // like an agent's. My 1.3.13 runs were in one and the 1.4.2 container was
    // not, so the measurement was confounded and the conclusion was attributed to
    // the wrong cause.
    //
    // The real reason is better: it does not expire with the next release. This
    // case is what keeps the claim honest -- it measures the console on *this*
    // machine with the marker set and unset, so a reader can see which it is.
    const spec = join(root, 'agent-console.test.ts');
    writeFileSync(spec, `
import { test, expect } from 'bun:test';
test('a green test', () => { expect(1).toBe(1); });
test('a red test', () => { expect(1).toBe(2); });
`);
    const lines = (env: Record<string, string>) =>
      sh(['bun', 'test', spec], root, { FORCE_COLOR: '0', NO_COLOR: '1', ...env })
        .output.split('\n')
        .filter((l) => /^\((pass|fail)\)/.test(l));

    // Both markers are cleared for the "person" run, not just the one this
    // project sets. bun reads AGENT as well, so under `AGENT=1` the person run
    // saw an agent console and this case was red: 63 / 1, measured by the
    // reviewer on both bun versions and reproduced here. The case is about the
    // console, so inheriting either marker from the shell that happens to be
    // running the suite is the fixture leaking into the measurement. Finding 7
    // of the third re-review.
    const asAgent = lines({ CLAUDECODE: '1' });
    const asPerson = lines({ CLAUDECODE: '', AGENT: '' });

    // The red test is named either way; the green one only for a person.
    expect(asAgent.some((l) => l.includes('a red test'))).toBe(true);
    expect(asAgent.some((l) => l.includes('a green test'))).toBe(false);
    expect(asPerson.some((l) => l.includes('a green test'))).toBe(true);
  }, 300_000);
});

describe('MU-46 and MU-47 a name that resolves to more than one test is refused', () => {
  // Finding 1 of the third re-review, and the one that produced a false
  // VALIDATED -- the only verdict this tool must never print wrongly.
  //
  // The predicate was widened on purpose, because a case here is often a
  // describe block whose tests are generated in a loop, and MU-42 is that
  // counterpart. What the widening did not do is ask *what* the name resolved
  // to, so "red if any is red" credited whichever test happened to redden.
  //
  // Measured at 0018c6d against the fixture below:
  //   VALIDATED FX-1  rejects a bad value  (1 red, 2 green)   exit 0
  // with the policy test green throughout. The runner already refuses a `from`
  // that occurs twice, because nobody can say which occurrence carried the rule;
  // this is the same ambiguity on the other side and gets the same answer.
  //
  // MU-42 is the positive counterpart and is deliberately not duplicated here:
  // if the repair had closed the ambiguity by narrowing the predicate back to
  // exact leaf names, MU-42 would be red.
  //
  // **Not asserted, because it cannot be:** that the refusal happens before the
  // mutation rather than after it. A test comparing the subject's hash after the
  // run was written here and the control removed it -- it was green in both
  // worlds, because every path restores the subject, so the hash cannot tell a
  // baseline refusal from a validated entry. What the message says is the
  // evidence, and MU-33 is where the restore itself is held.
  const twoBlocks = 'spec/samename.test.ts';
  const blockAndTest = 'spec/blockandtest.test.ts';

  beforeAll(() => {
    const head = `
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
`;
    // Two blocks, one leaf name. The entry means the one under `policy`; the
    // mutation reddens the one under `mode`, which shares its name and nothing
    // else.
    writeFileSync(join(root, twoBlocks), `${head}
describe('policy', () => { test('rejects a bad value', () => { expect(s).toContain('POLICY="protected"'); }); });
describe('mode', () => { test('rejects a bad value', () => { expect(s).toContain('MODE=600'); }); });
test('unrelated', () => { expect(1).toBe(1); });
`);
    // A block and a top-level test sharing a name: is the entry about the block
    // or about the test? Nobody can say, so neither may be assumed.
    writeFileSync(join(root, blockAndTest), `${head}
describe('rejects a bad value', () => { test('under the block', () => { expect(s).toContain('MODE=600'); }); });
test('rejects a bad value', () => { expect(s).toContain('POLICY="protected"'); });
`);
  });

  test('MU-46 the same test name in two blocks is refused, and the remedy is named', () => {
    const r = run(registry([entry({ spec: twoBlocks, mustFail: 'rejects a bad value', from: 'MODE=600', to: 'MODE=777' })]));
    expect(r.output).toContain('resolves to more than one test');
    expect(r.output).toContain("name it in full, as 'describe > test'");
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
  }, 300_000);

  test('MU-47 a block whose name is also a test name is refused too', () => {
    const r = run(registry([entry({ spec: blockAndTest, mustFail: 'rejects a bad value', from: 'MODE=600', to: 'MODE=777' })]));
    expect(r.output).toContain('resolves to more than one test');
    expect(r.code).not.toBe(0);
  }, 300_000);

  test('MU-47 and naming it in full resolves the ambiguity rather than only reporting it', () => {
    // The counterpart that makes the refusal useful: the remedy the message
    // names has to work. `rejects a bad value > under the block` is the block's
    // test, and MODE is what it asserts, so this is a true control.
    const r = run(registry([entry({
      spec: blockAndTest,
      mustFail: 'rejects a bad value > under the block',
      from: 'MODE=600',
      to: 'MODE=777'
    })]));
    expect(r.output).toContain('VALIDATED');
    expect(r.code).toBe(0);
  }, 300_000);
});

describe('MU-48 and MU-49 the budget and a signal take bun with them', () => {
  // Finding 2. `( ... bun test ... ) &` put a subshell between the runner and
  // bun, so `$!` was the subshell's pid and neither the budget nor the handler
  // reached bun. Measured at 0018c6d: a 3000ms budget against a mutation that
  // makes the named test spin gives `REFUSED ... did not finish`, the subject
  // restored, and `bun test` at 98.7% CPU five seconds later. The suite's own
  // MU-37 and MU-39 left three such processes behind on every run.
  //
  // The sharpest consequence is not the CPU: the orphan still holds
  // --reporter-outfile, so it **writes the record after the handler removed
  // it**. `lu-mutate-junit.XXXXXX` reappeared in TMPDIR eight seconds after the
  // runner had gone, and that file is where every later entry reads its verdict.
  //
  // The subject is `exec` inside the subshell. What it still does not reach is a
  // process the spec itself started; that needs a process group and is in
  // BACKLOG.md.
  const spinning = 'spec/spins-when-mutated.test.ts';
  // Slow only once mutated, so the signal in MU-49 lands while bun is still
  // running. Without this the case used the ordinary fixture spec, which
  // finishes first -- and the control showed it: MU-49 was green with the
  // repair reverted, because there was no live bun left to orphan.
  const slow = 'spec/slow-when-mutated.test.ts';

  // A private TMPDIR per case, which is also how the assertion is made precise:
  // "no process is still running this run" is checked by looking for that
  // directory's path in the process table, rather than by counting anything
  // named `bun test` -- a count over `ps` also matches a shell whose command
  // line merely mentions it, which is how a false reading would get in.
  const tmp = () => mkdtempSync(join(tmpdir(), 'mu-budget-'));
  const stillRunning = (dir: string) =>
    sh(['ps', '-eo', 'args'])
      .output.split('\n')
      .filter((l) => l.includes(dir) && l.includes('bun'));

  beforeAll(() => {
    writeFileSync(join(root, spinning), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('the policy is protected', () => {
  if (!s.includes('POLICY="protected"')) { while (true) {} }
  expect(1).toBe(1);
});
`);
    writeFileSync(join(root, slow), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('the policy is protected', async () => {
  if (!s.includes('POLICY="protected"')) await Bun.sleep(8000);
  expect(s).toContain('POLICY="protected"');
}, 20000);
`);
  });

  test('MU-48 a run stopped by the budget leaves no bun behind, and no record either', () => {
    const dir = tmp();
    const r = run(registry([entry({ spec: spinning })]), [], {
      TMPDIR: dir,
      MUTATE_RUN_BUDGET_MS: '3000'
    });
    expect(r.output).toContain('did not finish within 3000ms');
    // Measured after the repair: 0 processes, and 0 again five seconds later.
    expect(stillRunning(dir)).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  }, 300_000);

  test('MU-49 a TERM while the subject is mutated takes bun with it, and nothing writes the record afterwards', () => {
    // The signal is sent when the mutated subject is on disk, not after a fixed
    // wait: a clock here would be measuring the machine. The wait is bounded so
    // a run that never mutates fails rather than hangs.
    //
    // The eight-second pause is the assertion, not padding -- at 0018c6d the
    // orphan wrote `lu-mutate-junit.XXXXXX` into TMPDIR about that long after
    // the runner had gone, so a check made immediately would have passed.
    const dir = tmp();
    const reg = registry([entry({ spec: slow })]);
    const script = [
      'set -u',
      `bash "$1" --registry "$2" --root "$3" --timeout 30000 >/dev/null 2>&1 &`,
      'p=$!',
      'i=0',
      `while [ $i -lt 600 ] && ! grep -q 'POLICY="public"' "$3/${SUBJECT}"; do sleep 0.05; i=$((i+1)); done`,
      `if grep -q 'POLICY="public"' "$3/${SUBJECT}"; then found=yes; else found=no; fi`,
      // Whether there was still a run to interrupt. Without this the case passes
      // vacuously when the run finishes first -- nothing was signalled, nothing
      // could be orphaned, and every assertion below holds for the wrong reason.
      'if kill -0 "$p" 2>/dev/null; then alive=yes; else alive=no; fi',
      'kill -TERM "$p" 2>/dev/null',
      'wait "$p"; rc=$?',
      'printf "rc=%s mutated_at_signal=%s alive_at_signal=%s\\n" "$rc" "$found" "$alive"',
      'sleep 8',
      'printf "left=[%s]\\n" "$(ls "$TMPDIR" | tr "\\n" " ")"'
    ].join('\n');
    const r = sh(['bash', '-c', script, 'mu49', RUNNER, reg, root], undefined as unknown as string, {
      TMPDIR: dir
    });

    // The run was actually interrupted mid-mutation rather than having finished
    // on its own: without this the rest would pass over a completed run.
    // A word, not a count: 600 is the poll giving up and matches a digit too.
    expect(r.output).toContain('mutated_at_signal=yes');
    // **Why this guard is here, and what it is watching.** This case went red
    // once in ten runs of the suite and has not been reproduced since -- six
    // runs of its own logic in isolation and three full suite runs, all clean.
    // Rather than ship something known to flicker, the two premises are now
    // asserted where they are used: a run that finished before the signal, which
    // is the race this case has, makes it red with a name instead of green for
    // nothing. If it reddens again, the reading below says which premise broke.
    expect(r.output).toContain('alive_at_signal=yes');
    expect(r.output).toContain('left=[]');
    expect(stillRunning(dir)).toEqual([]);
    expect(sha()).toBe(cleanSha);
    rmSync(dir, { recursive: true, force: true });
  }, 300_000);
});

describe('MU-50 the run budget is a setting, and a setting can be wrong', () => {
  // Finding 4. Three ways to get it wrong, and two of them were silent.
  // Measured at 0018c6d: `5m` gave an arithmetic error on every poll, no bound at
  // all, and the entry still printed VALIDATED with exit 0 -- a verdict from a
  // run nothing was watching. `abc` killed the runner with `unbound variable`,
  // no report, and left lu-mutate.XXXXXX and lu-mutate-junit.XXXXXX in TMPDIR.
  // `0` refused every entry, which is wrong but at least visible.
  //
  // The values are the reviewer's own three, kept rather than invented, so his
  // reproduction and this case measure the same things.
  // Written out rather than looped, so each title is a literal: MU-59 compares
  // the specification's scenario rows against these names, and a title built by
  // interpolation cannot be compared.
  const refusesBudget = (v: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'mu-badbudget-'));
    const r = run(registry([entry()]), [], { MUTATE_RUN_BUDGET_MS: v, TMPDIR: dir });
    expect(r.output).toContain('MUTATE_RUN_BUDGET_MS is milliseconds');
    expect(r.output).toContain(`got '${v}'`);
    expect(r.code).toBe(2);
    // Nothing ran, so nothing may be left: `abc` used to leave two files.
    expect(readdirSync(dir)).toEqual([]);
    expect(r.output).not.toContain('VALIDATED');
    rmSync(dir, { recursive: true, force: true });
    expect(sha()).toBe(cleanSha);
  };

  test('MU-50 a budget of zero is refused before anything runs', () => {
    refusesBudget('0');
  }, 300_000);

  test('MU-50 a budget that is not a number at all is refused before anything runs', () => {
    refusesBudget('abc');
  }, 300_000);

  test('MU-50 a budget carrying a unit is refused before anything runs', () => {
    refusesBudget('5m');
  }, 300_000);

  test('MU-50 and a whole number is still accepted, so the check refuses only what it should', () => {
    // The counterpart. Without it the finding is answered by a check that
    // refuses every budget, and MU-48 -- which needs 3000 to be honoured -- is
    // the other half of the same guarantee.
    const r = run(registry([entry()]), [], { MUTATE_RUN_BUDGET_MS: '120000' });
    expect(r.output).not.toContain('MUTATE_RUN_BUDGET_MS is milliseconds');
    expect(r.output).toContain('VALIDATED');
    expect(r.code).toBe(0);
  }, 300_000);
});

describe('MU-51 a signal during the baseline leaves nothing behind', () => {
  // Finding 8. The backup is taken before the baseline and SUBJECT is set after
  // it, and `restore` wanted both -- so a signal in that window left the copy in
  // TMPDIR for ever. Measured at 0018c6d: TERM while the unmutated spec ran gives
  // exit 143, the subject untouched, and `lu-mutate.XXXXXX` still there, with the
  // orphaned bun adding `lu-mutate-junit.XXXXXX` to it eight seconds later.
  //
  // MU-33 holds the two baseline refusals; this is the signal, which it does not
  // cover.
  const slowAlways = 'spec/slow-always.test.ts';

  beforeAll(() => {
    // Slow whether or not it is mutated, so the signal lands during the baseline
    // rather than after it. The subject is never written in this case at all,
    // which is the point: there is nothing to restore and the copy is rubbish.
    writeFileSync(join(root, slowAlways), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
test('the policy is protected', async () => {
  await Bun.sleep(8000);
  expect(s).toContain('POLICY="protected"');
}, 20000);
`);
  });

  test('MU-51 TERM while the unmutated spec runs leaves no backup and no record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mu-baseline-'));
    const reg = registry([entry({ spec: slowAlways })]);
    // The signal is sent once the backup exists, which is the window the finding
    // is about -- polled rather than timed, so the case is not measuring this
    // machine's speed. Bounded, so a run that never takes a backup fails.
    const script = [
      'set -u',
      'bash "$1" --registry "$2" --root "$3" --timeout 30000 >/dev/null 2>&1 &',
      'p=$!',
      'i=0',
      // `lu-mutate-junit.XXXXXX` is created at startup, unconditionally, and a
      // poll for `lu-mutate.` matched **that** -- so the signal went out before
      // the backup existed and there was nothing to leave behind. The control
      // found it: the case was green with the repair reverted. The junit file is
      // excluded by name here.
      'while [ $i -lt 600 ] && [ -z "$(ls "$TMPDIR" | grep -v junit | grep lu-mutate || true)" ]; do sleep 0.05; i=$((i+1)); done',
      'if [ -n "$(ls "$TMPDIR" | grep -v junit | grep lu-mutate || true)" ]; then found=yes; else found=no; fi',
      'kill -TERM "$p" 2>/dev/null',
      'wait "$p"; rc=$?',
      'printf "rc=%s backup_present_at_signal=%s\\n" "$rc" "$found"',
      'sleep 8',
      'printf "left=[%s]\\n" "$(ls "$TMPDIR" | tr "\\n" " ")"'
    ].join('\n');
    const r = sh(['bash', '-c', script, 'mu51', RUNNER, reg, root], undefined as unknown as string, {
      TMPDIR: dir
    });

    // The backup really did exist when the signal was sent, so the rest is not
    // passing over a window that never opened. Stated as a word rather than a
    // count: `backup_seen=600` -- the poll giving up -- also matches a number,
    // which is how the first version of this guard admitted a run that had
    // already finished.
    expect(r.output).toContain('backup_present_at_signal=yes');
    expect(r.output).toContain('left=[]');
    expect(sha()).toBe(cleanSha);
    rmSync(dir, { recursive: true, force: true });
  }, 300_000);
});

describe('MU-52 the counts come from the record, which the spec cannot write', () => {
  // Finding 6. `tally` matched `^ *N pass|fail|error$` over combined stdout and
  // stderr, and a test can print such a line. Two readings, both measured at
  // 0018c6d:
  //
  //   a two-test spec where both redden under the mutation -- the broken-file
  //   condition -- with one test doing console.log(" 3 pass"):
  //     VALIDATED FX-6a  the policy is protected  (2 red, 3 green)   exit 0
  //   a test doing console.log(" 1 error"):
  //     REFUSED   FX-6b  ... did not load before the mutation -- 1 error(s)
  //
  // The first is a false VALIDATED produced by the subject under test, which is
  // the worst shape a measurement can take. The counts come from
  // `<testsuites tests= failures= skipped=>` now; the error signal still reads
  // the console, and is required to agree with a record that shows nothing ran.
  //
  // MU-30 and MU-44 are the counterparts and are deliberately not duplicated:
  // they hold a spec that really does throw at import, after and before the
  // mutation. If this repair had closed the hole by dropping the error signal,
  // both would be red.
  const echoPass = 'spec/echoes-pass.test.ts';
  const echoError = 'spec/echoes-error.test.ts';

  beforeAll(() => {
    const head = `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
`;
    // Both tests assert the same thing, so the mutation reddens both: a file
    // with no survivor, which the runner must refuse rather than credit.
    writeFileSync(join(root, echoPass), `${head}
test('the policy is protected', () => { console.log(' 3 pass'); expect(s).toContain('POLICY="protected"'); });
test('the policy is protected as well', () => { expect(s).toContain('POLICY="protected"'); });
`);
    // One test reddens and one survives, so this is a valid control -- the
    // console line must not turn it into a load failure.
    writeFileSync(join(root, echoError), `${head}
test('the policy is protected', () => { console.log(' 1 error'); expect(s).toContain('POLICY="protected"'); });
test('an unrelated green test', () => { expect(1).toBe(1); });
`);
  });

  test('MU-52 a spec printing a pass line does not get a survivor it has not got', () => {
    const r = run(registry([entry({ spec: echoPass })]));
    expect(r.output).toContain('every test in');
    expect(r.output).toContain('that is a broken file, not a control');
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
  }, 300_000);

  test('MU-52 and a spec printing an error line is still read as the control it is', () => {
    const r = run(registry([entry({ spec: echoError })]));
    expect(r.output).toContain('VALIDATED');
    expect(r.output).not.toContain('did not load');
    expect(r.code).toBe(0);
  }, 300_000);
});

describe('MU-53 a subject is judged by where it leads, not by how it is written', () => {
  // Finding 5. The two shape refusals were lexical, on the string the registry
  // carries, and a link needs neither. Measured at 0018c6d with
  // `alias.sh -> spec/a.test.ts` and `file: "alias.sh"`:
  //     VALIDATED FX-5  the assertion in this file is the subject  (1 red, 0 green)
  // The redness it credited was the test's own source being rewritten -- the
  // fixture's test asserts over `../subject.sh`, which was never touched, so the
  // only way it can redden is its own assertion changing. MU-9, MU-21 and MU-28
  // claim this cannot happen.
  //
  // Low severity, as the reviewer says: the registry is reviewed and the link
  // has to exist in the tree. It is in here because the property is claimed.
  const linkToSpec = 'alias-to-spec.sh';
  const linkToLib = 'lnk/helper.ts';
  const linkToPlain = 'alias-to-plain.sh';
  const upper = 'UPPER.TEST.ts';

  beforeAll(() => {
    symlinkSync(join(root, SPEC), join(root, linkToSpec));
    mkdirSync(join(root, 'tests'), { recursive: true });
    mkdirSync(join(root, 'tests/lib'), { recursive: true });
    writeFileSync(join(root, 'tests/lib/helper.ts'), 'export const POLICY = "protected";\n');
    symlinkSync(join(root, 'tests/lib'), join(root, 'lnk'));
    // A link to an ordinary file, which must still be allowed: without this the
    // repair is met by refusing every link, and a link is not the defect.
    symlinkSync(join(root, SUBJECT), join(root, linkToPlain));
    // Upper case, for the half the reviewer reasoned rather than ran. This
    // machine's filesystem is case-insensitive, so this path reaches the same
    // file the lower-case patterns are written for.
    writeFileSync(join(root, upper), 'POLICY="protected"\n');
  });

  test('MU-53 a link to a test file is refused, and the refusal says where it led', () => {
    const r = run(registry([entry({ file: linkToSpec })]));
    expect(r.output).toContain('which is a test file');
    expect(r.output).toContain(SPEC);
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
  }, 300_000);

  test('MU-53 a directory link into tests/lib is refused too', () => {
    const r = run(registry([entry({ file: linkToLib, from: 'POLICY = "protected"', to: 'POLICY = "public"' })]));
    expect(r.output).toContain('which is test infrastructure');
    expect(r.code).not.toBe(0);
  }, 300_000);

  test('MU-53 and an upper-case test name is refused, which was reasoned rather than run', () => {
    const r = run(registry([entry({ file: upper })]));
    expect(r.output).toMatch(/is a test file|names a test file/);
    expect(r.code).not.toBe(0);
  }, 300_000);

  test('MU-53 the counterpart: a link to an ordinary file is still a subject', () => {
    // The resolver must refuse what the link leads to, not the link. Without
    // this the finding is answered by refusing every indirection.
    const r = run(registry([entry({ file: linkToPlain })]));
    expect(r.output).toContain('VALIDATED');
    expect(r.code).toBe(0);
    expect(sha()).toBe(cleanSha);
  }, 300_000);
});

describe('MU-54 a spec that is red before the mutation is refused, not blamed', () => {
  // Finding 3. The baseline ran the whole spec and kept only the named test's
  // state, so a red sibling went unnoticed and the count after the mutation
  // carried it. Measured at 0018c6d:
  //
  //   (a) one unrelated red test, a mutation on a line nothing asserts:
  //       FAILED  FX-3a  1 test(s) red but not 'the policy is protected'
  //       -- nothing reddened, so by this tool's own definition that is
  //          unresolved, and the mutation is blamed for a test it never touched.
  //   (b) the other test already red, with a correct mutation:
  //       REFUSED FX-3b  every test ... failed -- that is a broken file
  //       -- true of the file, but it was broken before the mutation arrived.
  //
  // Both failed in the safe direction, which is why this is "can follow" and not
  // a blocker; both stated the wrong reason, which is why it is worth fixing. A
  // control means everything green except what the mutation reddens, so a
  // baseline that is red anywhere measured nothing -- the same answer the named
  // test already got one case earlier.
  const siblingRed = 'spec/sibling-red.test.ts';
  const bothRed = 'spec/both-red.test.ts';
  const redName = 'this one was red before anything was mutated';

  beforeAll(() => {
    const head = `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
`;
    // The mutation below changes MODE, which nothing here asserts, so nothing
    // this spec contains can redden because of it.
    writeFileSync(join(root, siblingRed), `${head}
test('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });
test('${redName}', () => { expect('x').toBe('y'); });
`);
    writeFileSync(join(root, bothRed), `${head}
test('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });
test('${redName}', () => { expect('x').toBe('y'); });
`);
  });

  test('MU-54 a red sibling is named, and the mutation is not blamed for it', () => {
    const r = run(registry([entry({ spec: siblingRed, from: 'MODE=600', to: 'MODE=777' })]));
    expect(r.output).toContain('is already red before the mutation');
    expect(r.output).toContain(redName);
    // The two wrong reasons, neither of which may be given any more.
    expect(r.output).not.toContain('red but not');
    expect(r.output).not.toContain('that is a broken file');
    expect(r.code).not.toBe(0);
  }, 300_000);

  test('MU-54 and a correct mutation over a red sibling is refused for the right reason', () => {
    const r = run(registry([entry({ spec: bothRed })]));
    expect(r.output).toContain('is already red before the mutation');
    expect(r.output).not.toContain('that is a broken file');
    expect(r.code).not.toBe(0);
  }, 300_000);

  test('MU-54 the counterpart: a green baseline is still measured rather than refused', () => {
    // Without this the finding is answered by refusing everything, and the
    // refusal above would be indistinguishable from a tool that never runs.
    const r = run(registry([entry()]));
    expect(r.output).toContain('VALIDATED');
    expect(r.output).not.toContain('is already red before the mutation');
    expect(r.code).toBe(0);
  }, 300_000);
});

describe('MU-56 a mutation may span several lines', () => {
  // The property MU-5's row claimed while MU-5's test measured something else --
  // the broken-file refusal. Finding 9 of the third re-review: the row and the
  // test had drifted apart, so this property had no case and the refusal had no
  // row. Both have one now.
  //
  // It matters because `from` travels as a JSON string and reaches the subject
  // through base64, and a newline is the one character that would not survive a
  // line-oriented path -- sed, read, a here-string. Nothing says it is replaced
  // by a byte-exact rewrite except this.
  test('MU-56 a from carrying a newline is applied, and the subject goes back', () => {
    const r = run(registry([entry({
      from: 'POLICY="protected"\nMODE=600',
      to: 'POLICY="public"\nMODE=600'
    })]));
    expect(r.output).toContain('VALIDATED');
    expect(r.code).toBe(0);
    // The survivor is `the mode is 600`, which the mutation deliberately leaves
    // intact: without it this would be a broken file rather than a control.
    expect(r.output).toMatch(/\(1 red, [1-9]\d* green\)/);
    expect(sha()).toBe(cleanSha);
  }, 300_000);

  test('MU-56 and a multi-line from that is not there is still refused', () => {
    // The counterpart. A newline must not become a wildcard on the way through.
    const r = run(registry([entry({
      from: 'POLICY="protected"\nSOMETHING_ELSE=1',
      to: 'POLICY="public"\nSOMETHING_ELSE=1'
    })]));
    expect(r.output).toContain('is not in');
    expect(r.code).not.toBe(0);
  }, 300_000);
});

describe('MU-57 a mutation that stops the tests registering at all', () => {
  // The zero-tally branch -- `no test executed in <spec>` -- was reachable and
  // had no case: the reviewer named it in finding 9, and the way there is a spec
  // whose tests are registered conditionally. The baseline runs them, the
  // mutation makes the condition false, and bun then runs a file with no tests
  // in it.
  //
  // MU-20 is the other way into the same refusal -- a spec path matching no file
  // -- and its row said "no test executed" while its test asserts the baseline's
  // "did not run in". Both messages are real and they are different branches;
  // the row names MU-20's now, and this case holds the one it had claimed.
  const conditional = 'spec/conditional.test.ts';

  beforeAll(() => {
    writeFileSync(join(root, conditional), `
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const s = readFileSync(join(import.meta.dir, '..', 'subject.sh'), 'utf8');
if (s.includes('POLICY="protected"')) {
  test('the policy is protected', () => { expect(s).toContain('POLICY="protected"'); });
  test('an unrelated survivor', () => { expect(1).toBe(1); });
}
`);
  });

  test('MU-57 is refused as a run that did not happen, not as a test that passed', () => {
    const r = run(registry([entry({ spec: conditional })]));
    expect(r.output).toContain('no test executed in');
    expect(r.output).toContain('the run did not happen, so it answered nothing');
    expect(r.output).not.toContain('VALIDATED');
    expect(r.code).not.toBe(0);
    expect(sha()).toBe(cleanSha);
  }, 300_000);
});

describe('MU-59 the specification and this file say the same thing', () => {
  // Finding 9 of the third re-review, answered by a check rather than by a
  // promise. The reviewer read the names out of this file and compared them with
  // `docs/TEST-SPEC-mutation-runner.md`, and found eight places where they had
  // drifted: MU-5's row described a property its test does not measure, MU-14's
  // row belonged to a test labelled MU-13, MU-20's expected message was the
  // baseline's rather than its own, MU-10 was cited as specified and had no row,
  // and several scenarios -- counterparts, the missing-spec refusal, the two
  // `--gaps` runs against the real checkout -- had no row at all.
  //
  // Every one of those was a human comparison that nothing repeats. This is the
  // repeat: the scenario table in that document is generated from the titles
  // here, and this case fails when the two part company in either direction.
  // Renaming a test is then a two-file change, which is the point -- the
  // specification is what a reviewer signs, so it has to move with the code.
  //
  // **This case reads the real repository**, not a fixture, which is why it is
  // named: so does MU-8's pair, and the specification says so now.
  const specPath = join(repoRoot, 'docs/TEST-SPEC-mutation-runner.md');
  const filePath = join(repoRoot, 'tests/integration/m-mu.runner.test.ts');

  // Only single-quoted literals, which is why MU-50's three scenarios are
  // written out rather than looped: a title built by interpolation cannot be
  // compared with a document.
  const titlesInFile = () => {
    const src = readFileSync(filePath, 'utf8');
    const out: string[] = [];
    const re = /^\s+test(?:\.skipIf\([^)]*\))?\(\s*'((?:[^'\\]|\\.)*)'/gm;
    let m;
    while ((m = re.exec(src)) !== null) if (m[1].startsWith('MU-')) out.push(m[1]);
    return out;
  };

  // Two cells, which is what tells the scenario table from the overview above it:
  // the overview's rows have the same leading `| **MU-n** |` and a sign column,
  // so a regex alone read them as scenarios and this case was red for its own
  // parser rather than for a drift.
  const scenariosInSpec = () => {
    const doc = readFileSync(specPath, 'utf8');
    const out: string[] = [];
    for (const line of doc.split('\n')) {
      if (!/^\|\s+\*\*MU-/.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length !== 2) continue;
      const cid = cells[0].replace(/\*\*/g, '');
      for (const t of cells[1].split('<br>')) out.push(`${cid} ${t.trim()}`);
    }
    return out;
  };

  test('MU-59 every scenario in this file has a row in the specification', () => {
    const missing = titlesInFile().filter((t) => !scenariosInSpec().includes(t));
    expect(missing).toEqual([]);
  });

  test('MU-59 and the specification lists no scenario this file does not have', () => {
    const extra = scenariosInSpec().filter((t) => !titlesInFile().includes(t));
    expect(extra).toEqual([]);
  });

  test('MU-59 and the comparison is over something, so an empty read fails', () => {
    // The guard the other two need: both lists empty would satisfy them, which
    // is the shape #12's leftover had on #10 -- `'' === ''` is a pass.
    expect(titlesInFile().length).toBeGreaterThan(80);
    expect(scenariosInSpec().length).toBeGreaterThan(80);
  });
});

describe('MU-60 the gap is printed on every run, which the documents always claimed', () => {
  // A2 of the 2026-10-01 re-review of #17. `docs/FEATURE-test-mutation.md` said a
  // missing mutation "blocks", that the gap "is printed on every run", and called
  // the second of those "the thing that makes this decision safe" -- the decision
  // being to backfill the registry per milestone. Neither held: `--gaps` exits 0
  // with `missing=271`, and an ordinary run printed the per-entry verdicts and the
  // tally and no gap at all. So a reader concluded the debt was visible where it
  // was not.
  //
  // The operator chose to make the document true rather than to narrow it to
  // "on --gaps". One computation serves both, because the whole value of the line
  // is that it agrees with `--gaps` -- and this case is what says it does.
  //
  // **Informational by decision.** It does not touch the exit status: a gap is the
  // ordinary state of a registry being filled in, and the error is an orphan,
  // which `--gaps` enforces. MU-36 holds that. The second scenario here is what
  // stops the line quietly becoming a failure.
  test('MU-60 an ordinary run ends with the gap line, and it agrees with --gaps', () => {
    const reg = registry([entry()]);
    const run1 = run(reg);
    const gaps = run(reg, ['--gaps']);

    const line = run1.output.split('\n').find((l) => l.startsWith('gap: '));
    expect(line).toBeDefined();
    expect(line).toContain('mutate.sh --gaps lists them');

    // The same five numbers, read out of both, which is the claim worth holding:
    // two computations that drift are worse than one report.
    const numbers = (s: string) =>
      (s.match(/specified=\d+ registered=\d+ missing=\d+ orphaned=\d+ exempt=\d+/) ?? [''])[0];
    expect(numbers(line ?? '')).not.toBe('');
    expect(numbers(line ?? '')).toBe(numbers(gaps.output));
  }, 300_000);

  test('MU-60 and the line does not change what the run concluded', () => {
    // A validated entry still exits 0 with the gap beside it, and a refused one
    // still exits non-zero for its own reason rather than for the gap.
    const good = run(registry([entry()]));
    expect(good.code).toBe(0);
    expect(good.output).toContain('VALIDATED');

    const bad = run(registry([entry({ from: 'NOT_IN_THE_SUBJECT=1' })]));
    expect(bad.code).not.toBe(0);
    expect(bad.output).toContain('is not in');
    // Printed in both cases: a run that refused still owes the reader the gap.
    expect(bad.output.split('\n').some((l) => l.startsWith('gap: '))).toBe(true);
  }, 300_000);
});
