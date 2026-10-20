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
 *          numbers for different cases on 2026-09-19. **What `TR-1` does not catch
 *          is exactly that:** it compares tested ids against declared ids and says
 *          nothing about two cases sharing one id, because a stolen id *is*
 *          declared -- by the case it was taken from. That is why the collision
 *          survived until a merge surfaced it.
 *
 *          *As of 2026-10-09 no uniqueness check was written; `TR-4` is that check,
 *          since 2026-10-13.* It covers the half that is decidable from the test
 *          files: **no id is carried by two test files unless that is on record.**
 *          Two further halves named in `BACKLOG.md` are still unbuilt -- one id
 *          twice inside a single document, and one id declared by two documents --
 *          and `A16-20` is the class `TR-4` cannot see at all: one file, one id,
 *          and a specification row that is not its case. The specification's
 *          *What this check still does not do* carries all three with their
 *          measurements.
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
 * Given    every `*.test.ts` under `tests/`, and every `docs/TEST-SPEC-*.md` -- the
 *          test files for the ids their titles carry and **which file carries
 *          each**, the documents for the ids their rows declare and for the files
 *          their *Implemented by* rows claim
 * When     the ids in test titles are compared with the ids in specification rows,
 *          and every id carried by more than one test file is compared with what
 *          its own detail block claims and, failing that, with the reviewed list
 *          in this file
 * Then     no test carries an id no row declares; the comparison is over something
 *          rather than over two empty sets; and no id is carried by two test files
 *          unless its block names both or an entry here names that exact file set
 * Covers:  TR-1, TR-2, TR-3, TR-4, TR-FR1, TR-FR2, TR-FR3
 * Unhappy: TR-1 is the finding. TR-2 is its counterpart, and it is the one that
 *          matters most here: `[] ⊆ anything` holds, so a reader that silently
 *          matched nothing would make TR-1 green for ever. That is the shape of
 *          the `'' === ''` leftover the 2026-10-01 review found in B1-8.
 *
 *          `TR-4` has three refusals and one counterpart. It refuses an id spanning
 *          files that nothing claims; a reason that is a placeholder; and an entry
 *          that has outlived what it exempts, which is now either an id that no
 *          longer spans files **or** one its block has come to claim, so the list
 *          can only shrink. The counterpart is that a real level split is
 *          **accepted** by both routes -- `OC-17` through the list, `OC-68`
 *          through its own block -- because a rule that refused everything would
 *          satisfy all three refusals.
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

/** An id as a whole token, so `A8-2` does not match inside `A8-20`. */
function idToken(id: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9-])`);
}

/**
 * The test files a specification block claims for an id, by **full path**.
 *
 * This is the computed half of `TR-4`, and it is what the house rule asks for:
 * where a question has a determinable answer, compute it rather than keeping a
 * list somebody has to remember to update. The detail-block convention already
 * carries the answer -- *Implemented by* names the files -- so an id whose block
 * names **every** file carrying it has already been judged, in the place
 * reviewers read, and needs no entry below.
 *
 * A full path and not a basename, because `m-oc.pairing-card` exists twice: as a
 * contract file reading the card as text and as a component file mounting it. A
 * basename match would accept the wrong one silently.
 *
 * Measured on the tree of 2026-10-20, with `main` merged: of **15** ids carried by
 * more than one test file, **3** are accepted here -- `OC-68`, `OC-69`, `OC-70`,
 * which came in with #15 and whose blocks name both files each. The other 12 have
 * blocks that predate the convention, which is why the list survives beside this.
 *
 * **What this cannot distinguish, stated because it is the rule's one weakness:**
 * a block whose heading names several ids -- `OC-43 / OC-44 / OC-45` -- claims its
 * files for all of them together, so within such a block the rule cannot say which
 * id a file belongs to. What it still catches is a file that **no** block
 * mentioning the id claims, which is the shape a stolen id takes.
 */
function namedByBlock(id: string): string[] {
  const out = new Set<string>();
  const docs = join(repoRoot, 'docs');
  const token = idToken(id);
  for (const name of readdirSync(docs)) {
    if (!/^TEST-SPEC-.*\.md$/.test(name)) continue;
    let heading = '';
    for (const line of readFileSync(join(docs, name), 'utf8').split('\n')) {
      if (/^#{2,6} /.test(line)) {
        heading = line;
        continue;
      }
      if (!/^\|\s*\*{0,2}Implemented by\*{0,2}\s*\|/.test(line)) continue;
      if (!token.test(heading)) continue;
      for (const m of line.matchAll(/tests\/[A-Za-z0-9._/-]+\.test\.ts/g)) out.add(m[0]);
    }
  }
  return [...out].sort();
}

const rel = (p: string) => p.replace(`${repoRoot}/`, '');

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
 * Ids carried by more than one test file **whose block does not name every file**,
 * each with the file set it is allowed and the reason it is allowed.
 *
 * **Why a list survives beside the computed rule.** Two shapes look identical from
 * the outside: one case tested at two levels, which this project asks for, and two
 * unrelated cases wearing one id, which is a defect. "One id, one file" would fail
 * the first -- measured 2026-10-13, nine of eleven spanning ids were level splits.
 * `namedByBlock` above decides the ones whose specification follows the
 * *Implemented by* convention, which is the determinable half; the blocks that
 * predate it are what is left, and they are listed here until their blocks are
 * brought up to the convention. **The list can therefore only shrink**, and
 * `TR-4`'s third scenario makes that true rather than hoped for: an entry the
 * computed rule has made unnecessary is reported, as is one whose id no longer
 * spans files at all.
 *
 * **Each entry names its files, and the match is equality.** Judging only the
 * **id** left the exemption open to theft: once `OC-17` was listed, any third file
 * could carry `OC-17` for an unrelated case and the suite stayed green. The
 * reviewer measured exactly that on 2026-10-20 -- `describe('OC-17 an unrelated
 * case wearing a listed id')` appended to `tests/contract/m-a6.command-mounted.test.ts`
 * gave 7 pass / 0 fail. It had also already happened, harmlessly, on `main`:
 * `SP-2` grew from three carrying files to four when #15 added
 * `tests/component/m-oc.pairing-card.test.ts`, and nobody had to judge it, so the
 * reason in this list had quietly become false. A surplus file is now reported as
 * unjudged and a missing one as stale.
 *
 * The judgement is made once, written down with its reason, and reviewed like any
 * other data -- the shape `mutations.json` uses for its exemptions, and the
 * argument is the same: an exception with a reason is reviewable, one without is
 * invisible.
 *
 * **Two live collisions got through two green suites before this existed.**
 * `OC-40`/`OC-42` (renumbered on #26, after surfacing as a merge conflict rather
 * than a test failure) and `A8-24`/`A8-25`/`A8-26` (renumbered on #27, found by
 * accident while chasing an unrelated red). `TR-1` is blind to both: it compares
 * tested ids against declared ids, and a stolen id *is* declared -- by the case it
 * was taken from.
 */
const SPANS_FILES: Array<{ id: string; files: string[]; why: string }> = [
  // One case, two levels. The project's own rule is to test at every level, so
  // these are the shape it asks for rather than an exception to it.
  {
    id: 'A3c-8',
    files: ['tests/contract/m-a3c.ssh-isolation.test.ts', 'tests/system/m-a3c.clone-identity.test.ts'],
    why: 'ssh identity isolation: the contract case reads the invocations, the system case reads the clones a real start produced'
  },
  {
    id: 'A6-12',
    files: ['tests/contract/m-a6.command-mounted.test.ts', 'tests/system/m-a6.publish-in-container.test.ts'],
    why: 'the mounted commands: contract checks which services carry them, system checks they are on PATH there'
  },
  {
    id: 'A8-20',
    files: ['tests/component/m-a8.declaration-drift.test.ts', 'tests/integration/m-a8.served-card.test.ts'],
    why: 'manifest-against-declaration drift: integration draws the lost repository, component asserts nothing is pending when they agree'
  },
  {
    id: 'A8-21',
    files: ['tests/contract/m-a8.preflight-order.test.ts', 'tests/unit/m-a8.declaration-preflight.test.ts'],
    why: 'the declaration pre-flight: unit parses it, contract holds that it is judged before the teardown'
  },
  {
    id: 'OC-12',
    files: ['tests/component/m-oc.config-shape.test.ts', 'tests/system/m-oc.device-scopes.test.ts'],
    why: 'the retired dangerouslyDisableDeviceAuth: component reads the written config, system reads what doctor says about it'
  },
  {
    id: 'OC-17',
    files: ['tests/integration/m-oc.version-probe-images.test.ts', 'tests/unit/m-oc.version-probe.test.ts'],
    why: 'the version probe: unit parses the line, integration runs it against the images themselves'
  },
  {
    id: 'OC-18',
    files: ['tests/integration/m-oc.version-probe-images.test.ts', 'tests/unit/m-oc.version-probe.test.ts'],
    why: 'as OC-17 -- the bare form 2026.7.1 prints, parsed and then probed for real'
  },
  {
    id: 'OC-19',
    files: ['tests/integration/m-oc.version-probe-images.test.ts', 'tests/unit/m-oc.version-probe.test.ts'],
    why: 'as OC-17 -- a line that is not a version line, and an image that cannot be identified'
  },
  {
    id: 'OC-31',
    files: ['tests/component/m-oc.config-shape.test.ts', 'tests/system/m-oc.codex-plugin.test.ts'],
    why: 'the codex plugin: component asserts it does not stay enabled unasked, system reads the error it raises'
  },
  // By design, and the design is in SP-2 itself. **Four files since #15**, not the
  // three this entry used to describe: the rule is "a case that needs a
  // precondition says so in its header", so every file the rule reaches carries
  // the id, and the DOM list it checks is itself computed. The fourth arrived
  // without anyone judging it, which is why the entry now names the set.
  {
    id: 'SP-2',
    files: [
      'tests/component/m-a16.result-line.test.ts',
      'tests/component/m-a16.skip-panel.test.ts',
      'tests/component/m-oc.pairing-card.test.ts',
      'tests/unit/m-sp.preconditions.test.ts'
    ],
    why: 'SP-2 is a rule rather than a single case: the unit file holds the rule, and each DOM file carries the voiced skip the rule requires -- so the id is the rule plus one instance per file the computation finds'
  },
  // A real collision, already repaired on a branch that has not merged.
  {
    id: 'A16-19',
    files: ['tests/component/m-a16.skip-panel.test.ts', 'tests/contract/m-a16.text-only.test.ts'],
    why: 'COLLISION, not a level split: m-a16.text-only is about git tracking test files and m-a16.skip-panel about the skip-all wording. Renumbered to A16-30 on #24; delete this entry when #24 merges'
  }
];

/** Every id carried by more than one test file, with those files, sorted. */
function spanningIds(): Array<[string, string[]]> {
  return [...idsInTests().entries()]
    .map(([id, files]) => [id, files.map(rel).sort()] as [string, string[]])
    .filter(([, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));
}

const listed = new Map(SPANS_FILES.map((e) => [e.id, [...e.files].sort()]));
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

describe('TR-4 no id is carried by two different cases without that being on record', () => {
  test('TR-4 every id spanning files is one its specification claims, or one somebody judged', () => {
    // Two ways to be allowed, and the first is the one the house rule prefers:
    // the detail block names every file carrying the id, so the judgement is
    // computed out of the document reviewers already read. The list is for the
    // blocks that predate that convention, and it names the exact file set.
    const unjudged: string[] = [];
    for (const [id, files] of spanningIds()) {
      const named = namedByBlock(id);
      if (files.every((f) => named.includes(f))) continue;
      const entry = listed.get(id);
      if (entry && same(entry, files)) continue;
      // A surplus file is the OC-40 mechanism aimed at an id this list has just
      // made safe to take, so it is named rather than counted.
      const surplus = entry ? files.filter((f) => !entry.includes(f)) : files;
      unjudged.push(
        entry
          ? `${id} carried by a file its entry does not name: ${surplus.join(', ')}`
          : `${id} (${files.join(', ')})`
      );
    }
    expect(unjudged.sort()).toEqual([]);
  });

  test('TR-4 the counterpart: a level split on record is accepted, by either route', () => {
    // Without this, every scenario here is a refusal, and a rule that refuses
    // everything would satisfy all of them. Two real ids, one per route:
    //
    //   OC-17 -- unit parses the version line, integration probes the images --
    //            is on the list, so this is the judged route.
    //   OC-68 -- component draws the refusal, integration holds the budget --
    //            came in with #15 and its block names both files, so this is the
    //            computed route, and nothing about it is listed.
    const spanning = new Map(spanningIds());
    const oc17 = spanning.get('OC-17') ?? [];
    expect(oc17).toEqual([
      'tests/integration/m-oc.version-probe-images.test.ts',
      'tests/unit/m-oc.version-probe.test.ts'
    ]);
    expect(listed.get('OC-17')).toEqual(oc17);

    const oc68 = spanning.get('OC-68') ?? [];
    expect(oc68.length).toBe(2);
    expect(listed.has('OC-68')).toBe(false);
    expect(namedByBlock('OC-68')).toEqual(expect.arrayContaining(oc68));
  });

  test('TR-4 the negative: every reason is a reason, not a placeholder', () => {
    // A list whose entries say nothing is a list nobody reviewed. The floor is 40
    // characters, measured against the shortest real reason written above, and the
    // placeholder pattern is what a reason looks like when somebody meant to come
    // back to it.
    for (const { id, files, why } of SPANS_FILES) {
      expect(why.length).toBeGreaterThan(40);
      expect(why).not.toMatch(/^(todo|tbd|see above|n\/a)/i);
      expect(id).toMatch(/^[A-Z][A-Za-z0-9]*-[A-Za-z0-9]+$/);
      // And an entry that names no files judges nothing.
      expect(files.length).toBeGreaterThan(1);
      for (const f of files) expect(f).toMatch(/^tests\/[A-Za-z0-9._/-]+\.test\.ts$/);
    }
  });

  test('TR-4 the negative: the list does not outlive what it exempts', () => {
    // The direction that makes the list shrink rather than grow for ever, and it
    // is now two things. An entry whose id no longer spans files is stale --
    // A16-19's own text says it goes when #24 merges. And an entry the computed
    // rule would accept anyway is **redundant**: bringing a block up to the
    // *Implemented by* convention is how an entry is meant to leave this list, so
    // it has to be red until the entry goes with it.
    const spanning = new Map(spanningIds());
    const gone: string[] = [];
    for (const { id, files } of SPANS_FILES) {
      const carried = spanning.get(id);
      if (!carried) {
        gone.push(`${id} no longer spans files`);
        continue;
      }
      const named = namedByBlock(id);
      if (files.every((f) => named.includes(f))) {
        gone.push(`${id} is claimed by its own block now, so this entry is redundant`);
      }
    }
    expect(gone.sort()).toEqual([]);
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
