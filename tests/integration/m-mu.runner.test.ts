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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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

function run(reg: string, extra: string[] = []) {
  return sh(['bash', RUNNER, '--registry', reg, '--root', root, '--timeout', '30000', ...extra]);
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
    run(registry([entry()]));
    const leftovers = sh(['bash', '-lc', `ls ${root} | grep -c 'subject.sh.' || true`]);
    expect(leftovers.output.trim()).toBe('0');
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
    const r = sh(['bash', RUNNER, '--gaps']);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/specified=\d+ registered=\d+ missing=\d+ orphaned=\d+/);
    const specified = Number(r.output.match(/specified=(\d+)/)![1]);
    // The four specifications on this branch carry hundreds of cases; a parser
    // that found none would print a reassuring gap of zero.
    expect(specified).toBeGreaterThan(100);
  });

  test('and an entry no specification mentions is reported as orphaned', () => {
    // A case renamed or deleted leaves its entry behind, and a registry that
    // grows entries for cases that no longer exist is a registry nobody trusts.
    const r = sh(['bash', RUNNER, '--gaps', '--registry', registry([entry({ case: 'ZZ-99' })])]);
    expect(r.output).toContain('orphaned=1');
    expect(r.output).toContain('ZZ-99');
  });
});
