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
 *          and one class `TR-4` cannot see at all: an id specified for one case
 *          and later given to another, where the specified case carries a
 *          different id in its title -- `A16-20`, resolved by renumbering the
 *          later case to `A16-31`. The specification's
 *          *No id is carried by two test files unless that is on record* carries
 *          all three with their measurements.
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
 *          `TR-4` runs twice. On this tree: no id spanning files that nothing
 *          claims, no reason that is a placeholder, no entry that has outlived
 *          what it exempts -- and the counterpart, that real level splits are
 *          **accepted** by both routes, `OC-68` through its own block and the
 *          rest through the list, because a rule that refused everything would
 *          satisfy every refusal. And on **stated data**, since this tree is green
 *          and reaches none of the refusals: a heading claims only the cases it
 *          names first; two blocks do not add up to a claim; a file an entry does
 *          not name, an entry made redundant by its block, a file an entry names
 *          that no longer carries the id, an id that spans nothing, and an id
 *          listed twice are each reported by name; and the two accepted shapes
 *          are accepted with nothing else reported (2026-10-21).
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
      // read as a case. None existed when this was written -- that is what the
      // 7 above being real test files established -- and if one appeared, the
      // check would report an id a human can look at, which is the better
      // failure.
      //
      // **One has appeared, with #18 on `main` (2026-10-21):** MU-42's fixture
      // spec in `m-mu.runner` writes `describe('A10-14 a checked-in template is
      // not a credential', …)` at column 0, because it is the shape of the real
      // case. `TR-1` is untouched by it -- A10-14 is declared -- and `TR-4` saw
      // A10-14 in two files, which is how it was found. It is judged on the list
      // below. Blanking template contents before reading was measured and is not
      // safe: the scanner `tests/scenario-table.ts` uses for its one file hid 34
      // ids across this tree, 33 of them real titles -- TR-1 to TR-4 among them --
      // because it misreads backticks and regex literals in code. The method and
      // the list are in the specification's TR-4 block.
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

/**
 * The cases a heading is about: the list it **starts** with, ranges expanded.
 *
 * This replaced a search for the id as a token anywhere in the heading, and that
 * search claimed an id the heading's prose merely mentions -- `B6-17 — the build
 * budget, and what B5-14 could not see` gave its file to `B5-14`, so a `B5-14`
 * case added to that file was accepted without a word. And a range named only its
 * ends: `B6-10 to B6-13` claimed nothing for `B6-11`. Findings 2 and 7 of the
 * local review of 2026-10-21.
 *
 * The list is the start of the heading, before any ` — `. A list runs while each
 * next id is joined by `,`, `/`, `and` or `to`, and the first word that is not an
 * id ends it, so `SP-1, tightened 2026-10-14` is about SP-1 alone. A heading that
 * does not **start** with an id claims nothing: `The write itself — A12-3 to
 * A12-6, added …` is the one such heading on the tree, its ids are carried by one
 * file, and reading past the dash would let any prose that opens with an id claim
 * it -- which is the defect this replaces, one dash further on. Found by the
 * second pass over this repair, as was the suffix: an id may end in letters
 * (`A16-M1`), as `idsInTests` reads them, and only a numeric pair makes a range.
 */
const LEADING_ID = /^([A-Z][A-Za-z0-9]*)-([A-Za-z0-9]+)\b/;
function ownIds(heading: string): string[] {
  const part = heading.replace(/^#+\s*/, '').split(' — ')[0];
  const out: string[] = [];
  let rest = part;
  let prev: [string, number] | null = null;
  let range = false;
  for (let m = LEADING_ID.exec(rest); m; m = LEADING_ID.exec(rest)) {
    const [prefix, n] = [m[1], /^\d+$/.test(m[2]) ? Number(m[2]) : NaN];
    if (range && prev && prev[0] === prefix && n > prev[1]) {
      for (let k = prev[1] + 1; k <= n; k++) out.push(`${prefix}-${k}`);
    } else {
      out.push(`${prefix}-${m[2]}`);
    }
    prev = [prefix, n];
    rest = rest.slice(m[0].length);
    const sep = /^\s*(,|\/|and\b|to\b)\s*/.exec(rest);
    if (!sep) break;
    range = sep[1] === 'to';
    rest = rest.slice(sep[0].length);
  }
  return out;
}

/**
 * A detail block: the cases its heading names, and the files its *Implemented by*
 * rows name -- each with the cases it holds, where the row says so.
 *
 * `` `tests/unit/m-b6.nothing-to-judge.test.ts` (B6-10, B6-11) `` is how three
 * blocks on the tree say which file holds which case, and a file so annotated is
 * claimed for those cases only. Without it a block about a range claims every
 * file for every case in it, so a `B6-12` case added to the unit file above would
 * be accepted. Found by the second pass over this repair.
 */
type Block = { ids: string[]; files: Array<{ path: string; only?: string[] }> };

/**
 * Every block in the given documents that names a case and a file, by **full
 * path** -- `m-oc.pairing-card` exists both as a contract file and as a component
 * file, so a basename would accept the wrong one silently. Documents are passed
 * as text, so the decision below can be put to stated data as well as to this
 * tree, and this tree is read once rather than once per id.
 */
function blocksOf(documents: string[]): Block[] {
  const out: Block[] = [];
  for (const body of documents) {
    let block: Block | null = null;
    for (const line of body.split('\n')) {
      if (/^#{2,6} /.test(line)) {
        block = { ids: ownIds(line), files: [] };
        out.push(block);
        continue;
      }
      if (!block || !/^\|\s*\*{0,2}Implemented by\*{0,2}\s*\|/.test(line)) continue;
      for (const m of line.matchAll(/(tests\/[A-Za-z0-9._/-]+\.test\.ts)`?\s*(?:\(([^)]*)\))?/g)) {
        const only = m[2] ? ownIds(m[2]) : [];
        block.files.push(only.length ? { path: m[1], only } : { path: m[1] });
      }
    }
  }
  return out.filter((b) => b.ids.length > 0 && b.files.length > 0);
}

const specDocuments = () =>
  readdirSync(join(repoRoot, 'docs'))
    .filter((n) => /^TEST-SPEC-.*\.md$/.test(n))
    .sort()
    .map((n) => readFileSync(join(repoRoot, 'docs', n), 'utf8'));
const rel = (p: string) => p.replace(`${repoRoot}/`, '');

describe('TR-1 a test carries no case id that no specification declares', () => {
  test('TR-1 every id in a test title has a row', () => {
    const tested = idsInTests();
    const declared = idsInSpecs();
    const undocumented = [...tested.keys()]
      .filter((id) => !declared.has(id))
      .map((id) => `${id} (${tested.get(id)!.map(rel).join(', ')})`)
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
 * `blocksOf` above reads the ones whose specification follows the *Implemented
 * by* convention, which is the determinable half; the blocks that predate it are
 * what is left, and they are listed here until their blocks are brought up to the
 * convention. An entry **leaves** when that happens: `TR-4`'s *does not outlive*
 * scenario reports an entry the block has made unnecessary, and one whose id no
 * longer spans files. Nothing stops an entry being **added** -- that is a reviewed
 * change to this file, like any other. *(This said the list "can only shrink",
 * and called the scenario TR-4's third; it is the fourth of the live-tree ones.
 * Findings 9 and 13 of the local review of 2026-10-21.)*
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
  // Not a second case: fixture data that this reader cannot tell from one.
  {
    id: 'A10-14',
    files: ['tests/integration/m-mu.runner.test.ts', 'tests/unit/m-a10.scan-paths.test.ts'],
    why: 'not a level split: m-mu.runner holds MU-42 fixture source in a template literal whose column-0 line is describe(A10-14 …), the shape of the real case in m-a10.scan-paths, and idsInTests reads it as a title'
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
      'tests/contract/m-a17.computed-state.test.ts',
      'tests/unit/m-sp.preconditions.test.ts'
    ],
    why: 'SP-2 is a rule rather than a single case: the unit file holds the rule, and each DOM file carries the voiced skip the rule requires, as m-a17 does for its stub forge without a jq -- so the id is the rule plus one instance per file that skips'
  }
];

/** Every id carried by more than one test file, with those files, sorted. */
function spanningIds(): Array<[string, string[]]> {
  return [...idsInTests().entries()]
    .map(([id, files]) => [id, files.map(rel).sort()] as [string, string[]])
    .filter(([, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));
}

type Entry = { id: string; files: string[]; why: string };
type Verdict = { problems: string[]; stale: string[]; viaBlock: string[]; viaList: string[] };

/**
 * `TR-4`'s whole decision, over data rather than over this tree.
 *
 * Every refusal in it used to run only against the live tree, which is green and
 * so reaches none of them; four defects sat in those branches and no run could
 * see them. Taking the spanning ids, the blocks and the list as arguments is what
 * lets each refusal be put to stated values below. Finding 10 of the local review
 * of 2026-10-21.
 *
 * - **One block has to claim every carrying file.** The files used to be pooled
 *   over every block naming the id, so two unrelated cases with a block each
 *   passed as one -- the `OC-40` shape this exists for. Finding 1.
 * - **Redundant means the block accepts what is carried**, not that the entry's
 *   own files are all named: an entry naming a file that does not carry the id
 *   was never reported, and stood ready to accept that file later. Finding 3.
 * - **A file the entry names and nobody carries is stale, by name.** It was
 *   reported as a surplus with an empty list. Finding 4.
 * - **An id listed twice is reported.** A Map kept the last entry, so a reader
 *   saw two files where three were accepted. Finding 6.
 */
function judge(spanning: Array<[string, string[]]>, blocks: Block[], list: Entry[]): Verdict {
  const v: Verdict = { problems: [], stale: [], viaBlock: [], viaList: [] };
  const entries = new Map<string, Entry>();
  const twice = new Set<string>();
  for (const e of list) {
    if (entries.has(e.id) && !twice.has(e.id)) {
      v.problems.push(`${e.id} is listed twice, and only one entry can be read`);
      twice.add(e.id);
    }
    entries.set(e.id, e);
  }
  const holds = (b: Block, id: string, f: string) =>
    b.files.some((x) => x.path === f && (!x.only || x.only.includes(id)));
  const claimed = (id: string, files: string[]) =>
    blocks.some((b) => b.ids.includes(id) && files.every((f) => holds(b, id, f)));
  const carried = new Map(spanning);
  for (const [id, files] of spanning) {
    if (claimed(id, files)) {
      v.viaBlock.push(id);
      continue;
    }
    if (twice.has(id)) continue;
    const e = entries.get(id);
    if (!e) {
      v.problems.push(`${id} (${files.join(', ')})`);
      continue;
    }
    // A surplus file is the OC-40 mechanism aimed at an id this list has made
    // safe to take, so it is named rather than counted.
    const surplus = files.filter((f) => !e.files.includes(f));
    if (surplus.length) v.problems.push(`${id} carried by a file its entry does not name: ${surplus.join(', ')}`);
    else v.viaList.push(id);
  }
  for (const e of entries.values()) {
    if (twice.has(e.id)) continue;
    const files = carried.get(e.id);
    if (!files) {
      v.stale.push(`${e.id} no longer spans files`);
      continue;
    }
    if (claimed(e.id, files)) {
      v.stale.push(`${e.id} is claimed by its own block now, so this entry is redundant`);
      continue;
    }
    const gone = e.files.filter((f) => !files.includes(f));
    if (gone.length) v.stale.push(`${e.id} names a file that no longer carries it: ${gone.join(', ')}`);
  }
  return v;
}

// Read once: the tree does not change during a run, and three scenarios ask.
let treeVerdict: Verdict | undefined;
const onThisTree = () => (treeVerdict ??= judge(spanningIds(), blocksOf(specDocuments()), SPANS_FILES));

describe('TR-4 no id is carried by two different cases without that being on record', () => {
  test('TR-4 every id spanning files is one its specification claims, or one somebody judged', () => {
    // Two ways to be allowed, and the first is the one the house rule prefers:
    // a detail block names every file carrying the id, so the judgement is
    // computed out of the document reviewers already read. The list is for the
    // blocks that predate that convention, and it names the exact file set.
    expect(onThisTree().problems.sort()).toEqual([]);
  });

  test('TR-4 the counterpart: a level split on record is accepted, by either route', () => {
    // Without this, every scenario here is a refusal, and a rule that refuses
    // everything would satisfy all of them. On this tree `OC-68` -- component
    // draws the refusal, integration holds the budget -- is accepted by its own
    // block, and the list accepts the blocks that predate the convention.
    //
    // *Corrected 2026-10-21*: this named `OC-17` as the list's witness and
    // compared its entry by hand, so bringing OC-17's block up to the convention
    // -- which is how an entry is meant to leave -- would have broken this case.
    // So would any live witness for the list: a fully drained list is the state
    // the design aims at. The list route's witness is the stated-data scenario
    // *the exact file set on the list is accepted*. Finding 8 of the local review,
    // and the second pass over its repair.
    expect(onThisTree().viaBlock).toContain('OC-68');
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
      // And an entry that names no files judges nothing -- nor one that names a
      // file twice, which passed this floor with a single file.
      expect(new Set(files).size).toBeGreaterThan(1);
      expect(new Set(files).size).toBe(files.length);
      for (const f of files) expect(f).toMatch(/^tests\/[A-Za-z0-9._/-]+\.test\.ts$/);
    }
  });

  test('TR-4 the negative: the list does not outlive what it exempts', () => {
    // The direction that makes entries leave. An entry whose id no longer spans
    // files is stale -- A16-19's was, once #28 and #24 were both on one tree, and
    // it was deleted on #24 on 2026-10-21 after this scenario named it. An entry
    // the block now accepts is **redundant**: bringing a block up to the
    // *Implemented by* convention is how an entry is meant to leave this list, so
    // it has to be red until the entry goes with it. And a file an entry names
    // that no longer carries the id is reported by name.
    expect(onThisTree().stale.sort()).toEqual([]);
  });
});

describe('TR-4 the decision, put to stated data', () => {
  // The live tree is green, so the scenarios above reach no refusal. These put
  // each one to values chosen for it. The ids are `ZZ-`, which no specification
  // in this repository declares, and the paths name no file that exists, so
  // nothing here can be read as a real case or a real file.
  const a = 'tests/unit/zz.alpha.test.ts';
  const b = 'tests/integration/zz.beta.test.ts';
  const c = 'tests/contract/zz.gamma.test.ts';
  const why = 'stated data for the decision, not a judgement about any real case';

  test('TR-4 a heading claims the cases it names first, never one its prose mentions', () => {
    expect(ownIds('#### ZZ-17 — the build budget, and what ZZ-14 could not see')).toEqual(['ZZ-17']);
    expect(ownIds('### ZZ-43 / ZZ-44 / ZZ-45 — three cases, one block')).toEqual(['ZZ-43', 'ZZ-44', 'ZZ-45']);
    expect(ownIds('#### ZZ-10 to ZZ-13 — a range')).toEqual(['ZZ-10', 'ZZ-11', 'ZZ-12', 'ZZ-13']);
    expect(ownIds('##### ZZ-14, ZZ-15, ZZ-20 to ZZ-22 — a list holding a range')).toEqual([
      'ZZ-14', 'ZZ-15', 'ZZ-20', 'ZZ-21', 'ZZ-22'
    ]);
    expect(ownIds('#### ZZ-5 and ZZ-7 — two cases')).toEqual(['ZZ-5', 'ZZ-7']);
    expect(ownIds('#### The write itself — ZZ-3 to ZZ-6, added 2026-10-02')).toEqual([]);
    expect(ownIds('#### The build budget — ZZ-14 could not see it')).toEqual([]);
    expect(ownIds('#### ZZ-M1 — a manual case')).toEqual(['ZZ-M1']);
    expect(ownIds('### ZZ-1, tightened 2026-10-14 — prose naming ZZ-2')).toEqual(['ZZ-1']);
    expect(ownIds('## Overview')).toEqual([]);
  });

  test('TR-4 two blocks that each claim part of an id do not add up to a claim', () => {
    const v = judge([['ZZ-70', [a, c]]], [{ ids: ['ZZ-70'], files: [{ path: a }] }, { ids: ['ZZ-70'], files: [{ path: c }] }], []);
    expect(v).toEqual({ problems: [`ZZ-70 (${a}, ${c})`], stale: [], viaBlock: [], viaList: [] });
  });

  test('TR-4 and one block naming every file is a claim', () => {
    const v = judge([['ZZ-70', [a, c]]], [{ ids: ['ZZ-70'], files: [{ path: a }, { path: c }] }], []);
    expect(v).toEqual({ problems: [], stale: [], viaBlock: ['ZZ-70'], viaList: [] });
  });

  test('TR-4 a file a block says holds other cases does not claim this one', () => {
    // The block is about ZZ-10 to ZZ-13 and its row says alpha holds ZZ-10 and
    // ZZ-11, beta ZZ-12 and ZZ-13. A ZZ-12 case in alpha is not the block's.
    const row = `| **Implemented by** | \`${a}\` (ZZ-10, ZZ-11) and \`${b}\` (ZZ-12, ZZ-13). |`;
    const blocks = blocksOf([`#### ZZ-10 to ZZ-13 — a range\n\n${row}\n`]);
    expect(judge([['ZZ-12', [a, b]]], blocks, [])).toEqual({ problems: [`ZZ-12 (${a}, ${b})`], stale: [], viaBlock: [], viaList: [] });
    // And the counterpart on the same block: alpha and beta both hold ZZ-11 here.
    const both = blocksOf([`#### ZZ-10 to ZZ-13 — a range\n\n| **Implemented by** | \`${a}\` (ZZ-10, ZZ-11) and \`${b}\` (ZZ-11 to ZZ-13). |\n`]);
    expect(judge([['ZZ-11', [a, b]]], both, [])).toEqual({ problems: [], stale: [], viaBlock: ['ZZ-11'], viaList: [] });
  });

  test('TR-4 a file the entry does not name is reported by name', () => {
    const v = judge([['ZZ-17', [a, b, c]]], [], [{ id: 'ZZ-17', files: [a, b], why }]);
    expect(v).toEqual({ problems: [`ZZ-17 carried by a file its entry does not name: ${c}`], stale: [], viaBlock: [], viaList: [] });
  });

  test('TR-4 and the exact file set on the list is accepted', () => {
    const v = judge([['ZZ-17', [a, b]]], [], [{ id: 'ZZ-17', files: [a, b], why }]);
    expect(v).toEqual({ problems: [], stale: [], viaBlock: [], viaList: ['ZZ-17'] });
  });

  test('TR-4 an entry the block has made unnecessary is reported, even when it names a file that does not carry the id', () => {
    const v = judge([['ZZ-45', [a, b]]], [{ ids: ['ZZ-45'], files: [{ path: a }, { path: b }] }], [{ id: 'ZZ-45', files: [a, b, c], why }]);
    expect(v).toEqual({ problems: [], stale: ['ZZ-45 is claimed by its own block now, so this entry is redundant'], viaBlock: ['ZZ-45'], viaList: [] });
  });

  test('TR-4 an entry naming a file that no longer carries the id says which', () => {
    const v = judge([['ZZ-31', [a, b]]], [], [{ id: 'ZZ-31', files: [a, b, c], why }]);
    expect(v).toEqual({ problems: [], stale: [`ZZ-31 names a file that no longer carries it: ${c}`], viaBlock: [], viaList: ['ZZ-31'] });
  });

  test('TR-4 an entry whose id spans no files any more is stale', () => {
    const v = judge([], [], [{ id: 'ZZ-19', files: [a, b], why }]);
    expect(v).toEqual({ problems: [], stale: ['ZZ-19 no longer spans files'], viaBlock: [], viaList: [] });
  });

  test('TR-4 an id listed twice is reported, not silently read as one entry', () => {
    const v = judge([['ZZ-31', [a, b, c]]], [], [
      { id: 'ZZ-31', files: [a, b], why },
      { id: 'ZZ-31', files: [a, b, c], why }
    ]);
    // Refused and not accepted: an id whose entry cannot be told is judged by none.
    expect(v).toEqual({ problems: ['ZZ-31 is listed twice, and only one entry can be read'], stale: [], viaBlock: [], viaList: [] });
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
