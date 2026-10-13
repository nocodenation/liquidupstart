/**
 * M-TR · Contract · Every case a test carries is a case somebody signed
 *
 * Purpose: a test labelled with an id that no specification declares is invisible
 *          twice over. `mutate.sh --gaps` reads ids out of `TEST-SPEC-*.md`, so it
 *          cannot count the case or report it missing; and a reviewer signing the
 *          milestone off never sees it. Measured 2026-10-09 across `main`: 243 ids
 *          in test titles, 279 in specification rows, and **13 tested ids that no
 *          row declared** -- `A8-27`, `A14-7`, `A14-8`, `A16-21`, `A16-22`,
 *          `A16-24` to `A16-29`, `OC-40` and `OC-42`.
 *
 *          The two OC ids are `OC-63` and `OC-64` since 2026-10-12 and are left as
 *          measured here, because this is a reading taken on a day and the ids are
 *          part of what was read. They moved because #15 had specified those two
 *          numbers for different cases on 2026-09-19. **What this case does not
 *          catch is exactly that:** it compares tested ids against declared ids and
 *          says nothing about two cases sharing one id, which is why the collision
 *          survived until a merge surfaced it. A uniqueness check is the obvious
 *          next case and is not written.
 *
 *          None of them was wrong; they were written after the rows around them,
 *          during the rounds of review that followed, and nothing brought the
 *          document along. That is drift, and the repair for drift is a check
 *          rather than a promise -- the same shape as `MU-59` on
 *          `feature/mutation-registry`, which keeps that milestone's scenario
 *          table in step with its test file.
 *
 *          This one is deliberately weaker than MU-59 and repository-wide: it
 *          compares **ids**, not scenario names. A per-scenario table for 241 ids
 *          is a much larger document and is not yet earned; the id-level check is
 *          what found the real drift.
 * Given    every `*.test.ts` under `tests/`, and every `docs/TEST-SPEC-*.md`
 * When     the ids in test titles are compared with the ids in specification rows
 * Then     no test carries an id no row declares, and the comparison is over
 *          something rather than over two empty sets
 * Covers:  TR-1, TR-2, TR-3, TR-FR1, TR-FR2
 * Unhappy: TR-1 is the finding. TR-2 is its counterpart, and it is the one that
 *          matters most here: `[] ⊆ anything` holds, so a reader that silently
 *          matched nothing would make TR-1 green for ever. That is the shape of
 *          the `'' === ''` leftover the 2026-10-01 review found in B1-8.
 */
import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

/** Case ids a test or describe title carries, with the file that carries them. */
function idsInTests(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.endsWith('.test.ts')) continue;
      const src = readFileSync(p, 'utf8');
      // A title at the start of a `test(`/`describe(` call, with or without a
      // modifier such as `.skipIf(...)`.
      //
      // **`^[ \t]*` and not `^\s+`, corrected 2026-10-12.** The anchor was
      // `^\s+`, meaning "indented", so that a fixture spec written inside a
      // template literal -- which starts at column 0 -- is not read as a case of
      // this suite. But `\s` includes the newline, so with the `m` flag the
      // anchor could reach over a **blank line** and match a top-level
      // `describe(` after all, while the same call preceded by `});` stayed
      // invisible. Whether a case was checked therefore depended on the blank
      // line above it.
      //
      // Measured on this tree before the change: 253 id/file pairs seen against
      // 260 seen when anchored to columns, so **7 were invisible** -- `A13-9`,
      // `A14-8`, `A9-11`, `A9-12`, `OC-64` and `SP-2` in two files. All six ids
      // turned out to be declared, so the check's answer was right today and
      // right for the wrong reason, which is the shape this project has three
      // other entries about.
      //
      // The original concern is kept in view rather than dismissed: a template
      // literal holding a literal `describe('X-1 ...` at column 0 would now be
      // read as a case. None exists on this tree -- that is what the 7 above
      // being real test files establishes -- and if one appears, the check
      // reports an id a human can look at, which is the better failure.
      const re =
        /^[ \t]*(?:test|describe)(?:\.\w+\([^)]*\))?\(\s*['"`]([A-Z][A-Za-z0-9]*-[A-Za-z0-9]+)\b/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const at = found.get(m[1]) ?? [];
        if (!at.includes(p)) at.push(p);
        found.set(m[1], at);
      }
    }
  };
  walk(join(repoRoot, 'tests'));
  return found;
}

/** Case ids a specification row declares: the first cell, optionally bolded. */
function idsInSpecs(): Set<string> {
  const out = new Set<string>();
  const docs = join(repoRoot, 'docs');
  for (const name of readdirSync(docs)) {
    if (!/^TEST-SPEC-.*\.md$/.test(name)) continue;
    const body = readFileSync(join(docs, name), 'utf8');
    const re = /^\|\s*\*{0,2}([A-Z][A-Za-z0-9]*-[A-Za-z0-9]+)\*{0,2}\s*\|/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) out.add(m[1]);
  }
  return out;
}

describe('TR-1 a test carries no case id that no specification declares', () => {
  test('TR-1 every id in a test title has a row', () => {
    const tested = idsInTests();
    const declared = idsInSpecs();
    const undocumented = [...tested.keys()]
      .filter((id) => !declared.has(id))
      .map((id) => `${id} (${tested.get(id)!.map((p) => p.replace(`${repoRoot}/`, '')).join(', ')})`)
      .sort();
    expect(undocumented).toEqual([]);
  });

  test('TR-2 and the comparison is over something, so two empty reads cannot pass it', () => {
    // Without this, a reader that matched nothing -- a changed title format, a
    // moved directory, a regex that stopped working -- would make TR-1 green for
    // ever, because every id in an empty set has a row. The numbers are floors
    // rather than exact counts: a milestone that adds cases must not turn this
    // red, and one that removes two hundred should.
    const tested = idsInTests();
    const declared = idsInSpecs();
    expect(tested.size).toBeGreaterThan(200);
    expect(declared.size).toBeGreaterThan(200);
  });
});

describe('TR-3 the reader sees a case wherever the file puts it', () => {
  test('TR-3 a top-level describe is read, whatever precedes it', () => {
    // The defect this exists against: with `^\s+` the anchor could reach over a
    // blank line, so a column-0 `describe(` after `});` was invisible while the
    // same call after an empty line was seen. Both shapes are put to the reader
    // here, because one of them passing is what hid the other.
    const tested = idsInTests();
    // `OC-64` sits at column 0 after a `});` -- the shape that was invisible.
    expect([...tested.keys()]).toContain('OC-64');
    // `OC-63` sits at column 0 after a blank line -- the shape that was seen,
    // and the counterpart that keeps this from passing on a reader that matches
    // nothing at all.
    expect([...tested.keys()]).toContain('OC-63');
  });
});

/**
 * Ids carried by more than one test file, each with the reason it is allowed.
 *
 * **Why a list and not a rule.** Two shapes look identical from the outside: one
 * case tested at two levels, which this project asks for, and two unrelated cases
 * wearing one id, which is a defect. Measured 2026-10-13: 11 ids span files and
 * nine of them are the first shape, so "one id, one file" would fail nine correct
 * things. The next rule tried -- that the specification must name every file that
 * implements an id, using the existing *Implemented by* convention -- failed 12 of
 * 14, because the older blocks predate that convention.
 *
 * So the judgement is made once, written down with its reason, and reviewed like
 * any other data. A twelfth id spanning files fails this case until somebody looks
 * at it and either fixes the collision or adds a line here. That is the shape
 * `mutations.json` uses for its exemptions, and the argument is the same: an
 * exception with a reason is reviewable, one without is invisible.
 *
 * **Two live collisions got through two green suites before this existed.**
 * `OC-40`/`OC-42` (renumbered on #26, after surfacing as a merge conflict rather
 * than a test failure) and `A8-24`/`A8-25`/`A8-26` (renumbered on #27, found by
 * accident while chasing an unrelated red). `TR-1` is blind to both: it compares
 * tested ids against declared ids, and a stolen id *is* declared -- by the case it
 * was taken from.
 */
const SPANS_FILES: Array<{ id: string; why: string }> = [
  // One case, two levels. The project's own rule is to test at every level, so
  // these are the shape it asks for rather than an exception to it.
  { id: 'A3c-8', why: 'ssh identity isolation: the contract case reads the invocations, the system case reads the clones a real start produced' },
  { id: 'A6-12', why: 'the mounted commands: contract checks which services carry them, system checks they are on PATH there' },
  { id: 'A8-20', why: 'manifest-against-declaration drift: integration draws the lost repository, component asserts nothing is pending when they agree' },
  { id: 'A8-21', why: 'the declaration pre-flight: unit parses it, contract holds that it is judged before the teardown' },
  { id: 'OC-12', why: 'the retired dangerouslyDisableDeviceAuth: component reads the written config, system reads what doctor says about it' },
  { id: 'OC-17', why: 'the version probe: unit parses the line, integration runs it against the images themselves' },
  { id: 'OC-18', why: 'as OC-17 -- the bare form 2026.7.1 prints, parsed and then probed for real' },
  { id: 'OC-19', why: 'as OC-17 -- a line that is not a version line, and an image that cannot be identified' },
  { id: 'OC-31', why: 'the codex plugin: component asserts it does not stay enabled unasked, system reads the error it raises' },
  // By design, and the design is in SP-2 itself.
  { id: 'SP-2', why: 'SP-2 asserts that a case needing a precondition says so, and the two component files carry the voiced skip it requires -- the id is the rule and its two instances' },
  // A real collision, already repaired on a branch that has not merged.
  { id: 'A16-19', why: 'COLLISION, not a level split: m-a16.text-only is about git tracking test files and m-a16.skip-panel about the skip-all wording. Renumbered to A16-30 on #24; delete this entry when #24 merges' }
];

describe('TR-4 no id is carried by two different cases without that being on record', () => {
  test('TR-4 every id spanning files is one somebody judged, with a reason', () => {
    const tested = idsInTests();
    const spanning = [...tested.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([id]) => id)
      .sort();
    const allowed = new Set(SPANS_FILES.map((e) => e.id));
    const unjudged = spanning.filter((id) => !allowed.has(id));
    // A new one fails here until it is either repaired or written down above.
    expect(unjudged).toEqual([]);
  });

  test('TR-4 and every reason is a reason, not a placeholder', () => {
    // A list whose entries say nothing is a list nobody reviewed. Measured
    // against the shortest real reason written above.
    for (const { id, why } of SPANS_FILES) {
      expect(why.length).toBeGreaterThan(40);
      expect(why).not.toMatch(/^(todo|tbd|see above|n\/a)/i);
      expect(id).toMatch(/^[A-Z][A-Za-z0-9]*-[A-Za-z0-9]+$/);
    }
  });

  test('TR-4 and the list does not outlive what it exempts', () => {
    // The other direction, and the one that makes the list shrink rather than
    // grow for ever: an entry for an id that no longer spans files is stale, and
    // A16-19's entry says in its own text that it goes when #24 merges.
    const tested = idsInTests();
    const stale = SPANS_FILES
      .map((e) => e.id)
      .filter((id) => (tested.get(id)?.length ?? 0) < 2)
      .sort();
    expect(stale).toEqual([]);
  });
});

describe('TR-1 what it deliberately does not assert', () => {
  test('TR-1 a declared id with no test is reported, not failed', () => {
    // The other direction is `mutate.sh --gaps`' *missing* count, and it is the
    // ordinary state of a specification written before the work -- which this
    // project requires. Failing on it would make "specify first" impossible. So
    // the number is read here and printed by `--gaps`, and asserted by neither.
    //
    // The assertion is that there is such a direction at all: if every declared
    // id had a test, this project would not be writing specifications first.
    const tested = idsInTests();
    const declared = idsInSpecs();
    const withoutTest = [...declared].filter((id) => !tested.has(id));
    expect(withoutTest.length).toBeGreaterThan(0);
  });
});
