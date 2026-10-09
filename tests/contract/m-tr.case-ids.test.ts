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
 * Covers:  TR-1, TR-2, TR-FR1, TR-FR2
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
      // modifier such as `.skipIf(...)`. Anchored to the line's indentation so
      // that a fixture spec written inside a template literal -- which starts at
      // column 0 -- is not read as a case of this suite.
      const re =
        /^\s+(?:test|describe)(?:\.\w+\([^)]*\))?\(\s*['"`]([A-Z][A-Za-z0-9]*-[A-Za-z0-9]+)\b/gm;
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
