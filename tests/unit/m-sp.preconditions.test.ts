/**
 * M-SP · Unit · The suite says where it can run, and the cases ask
 *
 * Purpose: nine cases and one error in the default tier were a case reading state
 *          that only exists in a particular kind of checkout, and saying so
 *          nowhere. Measured 2026-10-08 from a feature worktree: 9 fail / 1 error,
 *          every one of that kind. Moved to the release installation at
 *          `~/.liquidupstart` the count was the same for the opposite reason --
 *          that place has the started state and no `.git` at all.
 *
 *          **So there is no directory to prescribe**, which is why the repair is
 *          three values a case asks for rather than a rule somebody remembers.
 *          CLAUDE.md puts it as: prefer a computed answer to a rule an agent has
 *          to recall and apply correctly. A computed answer reads current state,
 *          so it cannot go stale when the system changes.
 *
 *          SP-1 is the part that is easy to get wrong and hard to notice: a
 *          discriminator nobody has seen say "no" is a discriminator nobody has
 *          tested. Each is a function of a root, so both answers are put to it.
 * Given    three throwaway roots: one empty, one carrying `volumes/_git-secrets`,
 *          one carrying `dashboard/node_modules`, plus this checkout; for SP-3, the
 *          registry and two `.invalid` hosts, and a child bun whose whole PATH is
 *          a directory linking `git` and no `curl`
 * When     each discriminator is asked about each
 * Then     it answers for the state in front of it, and the headers of the cases
 *          that depend on it say which precondition they need
 * Covers:  SP-1, SP-2, SP-3
 *
 * SP-3 is the fourth precondition -- whether a package registry answers -- which
 *          `OC-15` and `OC-16` need because they run `npm install -g` inside a
 *          docker build. Its two halves are measured in different ways on
 *          purpose: the refusal against a name RFC 2606 reserves so that it
 *          cannot resolve, and the permission against the real registry, gated
 *          by a probe that does **not** go through the function under test. The
 *          first version gated it on `registryReachable()` itself, so an
 *          implementation that always said no skipped its own counterpart and
 *          the file stayed green -- measured by the reviewer as M3 of his round
 *          on #24, 2 pass / 1 skip / 0 fail against exactly that mutant. And a
 *          machine without curl answers false instead of throwing while bun
 *          collects the files that ask (2026-10-21).
 *
 * SP-2 holds two computed lists: the files importing `lib/mount`, and every test
 *          file naming `registryReachable` but this one. Each must name its
 *          precondition in its header and gate on it.
 * Unhappy: SP-1's false answers are the half that matters. The true ones are
 *          their counterparts -- a discriminator that always says "no" skips
 *          everything and is indistinguishable from a suite that does not run.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import {
  startedIn,
  inGitRepoAt,
  dashboardDepsIn,
  STARTED,
  IN_GIT_REPO,
  preconditions,
  registryReachable,
  registryProbeCount
} from '../lib/preconditions';

// Independent of the function under test, and that is the whole point: gated on
// `registryReachable()` itself, an implementation that always answers false skips
// the case that would have caught it. A different mechanism rather than a second
// `curl` line, so a curl-specific regression shows up as a disagreement between
// the two. Module level, because a top-level await cannot sit inside `describe`.
const ONLINE = await fetch('https://registry.npmjs.org/', {
  method: 'HEAD',
  signal: AbortSignal.timeout(5000)
}).then(
  (r) => r.ok,
  () => false
);

const roots: string[] = [];
const root = (make?: (p: string) => void) => {
  const p = mkdtempSync(join(tmpdir(), 'm-sp-'));
  roots.push(p);
  make?.(p);
  return p;
};
afterAll(() => roots.forEach((p) => rmSync(p, { recursive: true, force: true })));

describe('SP-1 each discriminator answers for the state in front of it', () => {
  test('SP-1 a started checkout is told apart from one where nothing has run', () => {
    const bare = root();
    const started = root((p) => {
      mkdirSync(join(p, 'volumes', '_git-secrets'), { recursive: true });
      // What `git.sh:55` generates on every start, and the discriminator.
      writeFileSync(join(p, 'volumes', '_git-secrets', 'id_ed25519'), 'not a key\n');
    });
    // `volumes/repos` is deliberately present in the bare one: it is what the
    // obvious discriminator would have used, and three other places create it --
    // m-a5.nested-clone, m-a10.fixture-ceiling and gitfixture -- so it is there
    // after any run of the suite and says nothing about a start.
    mkdirSync(join(bare, 'volumes', 'repos'), { recursive: true });
    expect({ bare: startedIn(bare), started: startedIn(started) }).toEqual({
      bare: false,
      started: true
    });
  });

  test('SP-1 and an empty _git-secrets is not a start, which is what it used to be', () => {
    // **Negative counterpart to the one above, and a regression.** Until
    // 2026-10-14 the directory's presence *was* the answer, and it exists empty in
    // a worktree where no start has ever run. `A3-3` (twice), `A4-16` and `A1-4`
    // then read state that was not there and reported four defects that did not
    // exist. Without this scenario the tighter discriminator reads as a
    // preference; with it, the thing that went wrong cannot come back quietly.
    const hollow = root((p) =>
      mkdirSync(join(p, 'volumes', '_git-secrets'), { recursive: true })
    );
    expect(startedIn(hollow)).toBe(false);
  });

  test('SP-1 a directory that is no git repository is told apart from one that is', () => {
    const plain = root();
    const repo = root((p) => {
      sh(['git', 'init', '-q'], p);
    });
    expect({ plain: inGitRepoAt(plain), repo: inGitRepoAt(repo) }).toEqual({
      plain: false,
      repo: true
    });
  });

  test('SP-1 and a dashboard without its dependencies is told apart from one with them', () => {
    const without = root((p) => mkdirSync(join(p, 'dashboard'), { recursive: true }));
    const withDeps = root((p) => mkdirSync(join(p, 'dashboard', 'node_modules'), { recursive: true }));
    expect({ without: dashboardDepsIn(without), withDeps: dashboardDepsIn(withDeps) }).toEqual({
      without: false,
      withDeps: true
    });
  });

  test('SP-1 the constants describe this checkout, and the line names it', () => {
    // The counterpart for the three above: they are exercised against throwaway
    // roots, so nothing yet says the exported constants are about the place the
    // suite is actually in.
    expect(STARTED).toBe(startedIn(repoRoot));
    expect(IN_GIT_REPO).toBe(inGitRepoAt(repoRoot));
    expect(preconditions()).toContain(repoRoot);
  });
});

describe('SP-3 the fourth precondition: a registry answers', () => {
  // Added 2026-10-10. `TEST-SPEC-suite-preconditions.md` first recorded this one as
  // uncovered, and the two cases that need it -- OC-15 and OC-16, which run
  // `npm install -g` inside a docker build -- were simply red on a machine without
  // a registry.
  //
  // **It is not what the measured failures were, and the case says so.** Those two
  // failed twice by timing out at the suite's 60s and passed twice on a quiet
  // machine: the registry was reachable every time. So this precondition answers
  // the offline machine, and their own 180s budget answers the load -- the quiet
  // build is 14s on one machine and 45s on another, both measured.
  test('SP-3 an unreachable host answers false', () => {
    // The half that can be measured anywhere. `.invalid` is reserved by RFC 2606
    // precisely so that it cannot resolve, which is why it is used rather than a
    // name that might one day belong to somebody.
    expect(registryReachable('https://not-a-registry.invalid/')).toBe(false);
  });

  test.skipIf(!ONLINE)('SP-3 and the real registry answers true', () => {
    // The counterpart, and it can only be taken where the thing it asserts holds --
    // which is the shape of every precondition in this file. Without it SP-3 would
    // be met by a function that always says no, and that function would skip
    // OC-15 and OC-16 for ever while looking green.
    //
    // **It is gated on ONLINE and not on registryReachable().** Gated on the
    // function under test, the always-false implementation skipped this case and
    // the file read 2 pass / 1 skip / 0 fail -- the offline run and the broken
    // one printing the same thing, which is the defect described one line up
    // standing in its own counterpart. Found by the reviewer, 2026-10-20.
    expect(registryReachable()).toBe(true);
  });

  test('SP-3 the answer is memoised, so two cases pay for one round trip', () => {
    // Not a performance assertion: a network call per asking case would make the
    // suite's duration depend on how many cases ask, which is the kind of quiet
    // coupling this file exists against.
    //
    // **What is asserted is the cost, not the answer.** Comparing two answers was
    // green with the cache removed -- two calls agree whether or not anything is
    // remembered, measured by the reviewer as M2. So the probe counter is the
    // seam, and a url no run can have answered before is the subject: a second
    // ask must leave the process no second time.
    const url = 'https://memo-probe.invalid/';
    const before = registryProbeCount();
    const first = registryReachable(url);
    const afterFirst = registryProbeCount();
    const second = registryReachable(url);
    expect({
      agree: second === first,
      firstAsk: afterFirst - before,
      secondAsk: registryProbeCount() - afterFirst
    }).toEqual({ agree: true, firstAsk: 1, secondAsk: 0 });
  });

  test('SP-3 and a machine without curl answers false, rather than throwing at collection', () => {
    // **Finding 5 of the local review of 2026-10-21.** `Bun.spawnSync` throws
    // `Executable not found in $PATH` where there is no curl, and the helper let
    // it through. `skipIf` runs at registration, so that took the whole of
    // m-oc.allow-scripts down while bun was still collecting it -- the offline-safe
    // `installLine()` case with it -- in place of skipping two cases. Reproduced
    // before the repair with exactly the PATH below.
    //
    // A child bun, because PATH is the input and this process has to keep its
    // own. `git` is linked in because the module asks git about the checkout as
    // it loads, which is a different precondition and not the one under test.
    // The url is `.invalid`, so the answer cannot come from a network either way.
    const bin = root();
    const git = Bun.which('git');
    expect(git).not.toBeNull();
    symlinkSync(git as string, join(bin, 'git'));
    const probe = [
      `import { registryReachable } from ${JSON.stringify(join(repoRoot, 'tests/lib/preconditions.ts'))};`,
      `console.log('answer=' + registryReachable('https://not-a-registry.invalid/'));`
    ].join('\n');
    const p = Bun.spawnSync([process.execPath, '-e', probe], {
      env: { PATH: bin, HOME: process.env.HOME ?? '' },
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const out = p.stdout.toString() + p.stderr.toString();
    expect(out).toContain('answer=false');
    expect(out).not.toContain('Executable not found');
    expect(p.exitCode).toBe(0);
  });
});

describe('SP-2 a case that needs a precondition says so in its header', () => {
  // The drift this exists against is the one the findings were: a case reading
  // the installation while its header described something else. A reader signing
  // the case off has to be able to see the dependency without running it.
  //
  // Checked as text, like MU-59 on #18 checks a specification against its test
  // file: the mechanism is cheap and it is the only thing that makes "say so" a
  // property rather than an intention.
  /**
   * The files that need a DOM, **computed rather than listed.**
   *
   * Every file that imports `tests/lib/mount.ts` needs `dashboard/node_modules`,
   * because that module resolves happy-dom and svelte out of it. Enumerating them
   * by hand was the defect: on 2026-10-13 a ninth such file arrived with #15 and
   * this list did not grow, so nothing held its guard -- and the case that was
   * added in its place took the wrong id and reported a pass. N1 of that day's
   * re-review, and the reviewer's own suggestion.
   *
   * CLAUDE.md's rule, applied to this list: prefer a computed answer to a rule an
   * agent has to remember. A tenth file cannot be missed, because nothing has to
   * notice it.
   */
  //
  // The needle is the **shape of an import line**, anchored at column 0, and it
  // took two attempts to get there. Grepping for the bare path matched this very
  // file, because the comment explaining the grep contains it; narrowing to the
  // specifier with its closing quote matched it again, for the same reason one
  // level down. **A computed answer whose input includes its own documentation is
  // a computed answer about the wrong thing.** An anchored `^import` cannot be
  // satisfied by prose, because prose here is indented or starts with `//`.
  const domFiles = sh(
    ['git', 'grep', '-l', '-E', "^import .*lib/mount'", '--', 'tests'],
    repoRoot
  )
    .stdout.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.test.ts'))
    .sort();

  // The files gated on a registry, computed rather than listed. Added 2026-10-20
  // as a hand-listed entry, with the note that a call leaves nothing for a grep to
  // enumerate -- the identifier does. Finding 6 of the local review of 2026-10-21.
  //
  // **The identifier, not an import line**, unlike the DOM computation above: an
  // anchored `^import .*registryReachable` misses an import written over several
  // lines -- this file's own is one -- and a file importing it that way would
  // never be held. Every test file that so much as names the function is asked
  // to say so in its header and to gate on it; a file that only mentions it in
  // prose is then reported, which is the better failure. This file is excluded by
  // name because it asks the function in order to test it, and gates on ONLINE.
  const registryNamers = sh(['git', 'grep', '-l', '-F', 'registryReachable', '--', 'tests'], repoRoot)
    .stdout.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.test.ts'))
    .sort();
  const registryFiles = registryNamers.filter((l) => l !== 'tests/unit/m-sp.preconditions.test.ts');

  const dependent: Array<[string, string]> = [
    // These two have no single grep that finds them: `STARTED` is read through a
    // helper and `IN_GIT_REPO` through another, so they stay enumerated and the
    // enumeration is the thing SP-2 then checks.
    ['tests/contract/m-a3.known-hosts.test.ts', 'STARTED'],
    ['tests/contract/m-a4.clones-governed.test.ts', 'STARTED'],
    ['tests/integration/m-a1.workspace-dir.test.ts', 'STARTED'],
    ['tests/contract/m-a5.nested-clone.test.ts', 'IN_GIT_REPO'],
    ['tests/component/m-a6.operator-repository.test.ts', 'IN_GIT_REPO'],
    ['tests/contract/m-a16.text-only.test.ts', 'IN_GIT_REPO'],
    ['tests/contract/m-a17.computed-state.test.ts', 'JQ'],
    ...domFiles.map((f) => [f, 'DASHBOARD_DEPS'] as [string, string]),
    ...registryFiles.map((f) => [f, 'registryReachable()'] as [string, string])
  ];

  test('SP-2 and each DOM file files its voiced skip under SP-2, not under a case id', () => {
    // **This is what N1 of the 2026-10-13 re-review needed and nothing had.** The
    // card file's voiced skip was titled `OC-52 …`, so a bare checkout's JUnit
    // report carried a **pass** under `OC-52` beside the real `OC-52`, skipped --
    // "OC-52 passed" for a run in which the card was never mounted. The silent
    // green the guard exists to prevent, under the id of the defect it covers.
    //
    // Neither `TR-1` nor `TR-4` can see it: `OC-52` is declared, and `TR-4`
    // compares ids across *files* while this is one id twice in one file.
    // Measured 2026-10-13: 86 files legitimately carry one id across several
    // top-level blocks, so TR-4 cannot simply be widened. This check is narrow
    // instead -- the skip that reports a precondition belongs to the rule, and the
    // rule is SP-2.
    for (const file of domFiles) {
      const src = readFileSync(join(repoRoot, file), 'utf8');
      const voiced = [...src.matchAll(/\(\s*['"`](SP-2 [^'"`]+)/g)].map((m) => m[1]);
      expect(voiced.length).toBeGreaterThanOrEqual(1);
      // And it says what is absent rather than carrying a label.
      expect(src).toMatch(/node_modules/);
    }
  });

  test('SP-2 the DOM files are found, not remembered', () => {
    // The computation has to be over something: an empty grep would make every
    // DASHBOARD_DEPS scenario below vanish silently, which is TR-2's argument in
    // a different place.
    expect(domFiles.length).toBeGreaterThanOrEqual(3);
    expect(domFiles).toContain('tests/component/m-oc.pairing-card.test.ts');
  });

  test('SP-2 and the registry-dependent files are found, not remembered', () => {
    // The same guard for the second computation: an empty grep would drop
    // m-oc.allow-scripts from the scenarios below without a word.
    expect(registryFiles).toContain('tests/component/m-oc.allow-scripts.test.ts');
  });

  test('SP-2 and the file that tests the function is not counted as one that needs it', () => {
    // The negative half. This file names `registryReachable` on every other page
    // and gates on ONLINE instead, so counted as a dependent it would fail the
    // header-and-skipIf scenario below for a dependency it does not have. The
    // exclusion is what keeps the computation about the files that ask.
    //
    // **And the search does see it**, which is the other thing this file is good
    // for: its import of the function spans several lines, and the first version
    // of this computation -- an anchored import line -- never found such a file.
    // Seeing it here is what shows a multi-line importer elsewhere would be held.
    expect(registryNamers).toContain('tests/unit/m-sp.preconditions.test.ts');
    expect(registryFiles).not.toContain('tests/unit/m-sp.preconditions.test.ts');
    expect(registryFiles.every((f) => f.endsWith('.test.ts'))).toBe(true);
  });

  for (const [file, which] of dependent) {
    test(`SP-2 ${file} names the precondition it skips on`, () => {
      const src = readFileSync(join(repoRoot, file), 'utf8');
      const header = src.slice(0, src.indexOf('*/') + 2);
      expect(header).toContain(which);
      // And it has to actually use it, or the header is a claim about nothing.
      expect(src).toContain(`skipIf(!${which})`);
    });
  }
});
