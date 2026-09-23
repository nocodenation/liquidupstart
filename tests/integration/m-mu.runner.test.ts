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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'lu-mu-'));
  mkdirSync(join(root, 'spec'), { recursive: true });
  writeFileSync(join(root, SUBJECT), subjectBody);
  writeFileSync(join(root, SPEC), specBody);
  cleanSha = sha();
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

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

  test('legacy: nothing beside the subject either', () => {
    run(registry([entry()]));
    const leftovers = sh(['bash', '-lc', `ls ${root} | grep -c 'subject.sh.' || true`]);
    expect(leftovers.output.trim()).toBe('0');
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
    expect(r.output).toContain('the run did not happen');
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
