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
 *          one carrying `dashboard/node_modules`, plus this checkout
 * When     each discriminator is asked about each
 * Then     it answers for the state in front of it, and the headers of the cases
 *          that depend on it say which precondition they need
 * Covers:  SP-1, SP-2
 * Unhappy: SP-1's false answers are the half that matters. The true ones are
 *          their counterparts -- a discriminator that always says "no" skips
 *          everything and is indistinguishable from a suite that does not run.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
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
  preconditions
} from '../lib/preconditions';

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
    const started = root((p) => mkdirSync(join(p, 'volumes', '_git-secrets'), { recursive: true }));
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

describe('SP-2 a case that needs a precondition says so in its header', () => {
  // The drift this exists against is the one the findings were: a case reading
  // the installation while its header described something else. A reader signing
  // the case off has to be able to see the dependency without running it.
  //
  // Checked as text, like MU-59 on #18 checks a specification against its test
  // file: the mechanism is cheap and it is the only thing that makes "say so" a
  // property rather than an intention.
  const dependent: Array<[string, string]> = [
    ['tests/contract/m-a3.known-hosts.test.ts', 'STARTED'],
    ['tests/contract/m-a4.clones-governed.test.ts', 'STARTED'],
    ['tests/integration/m-a1.workspace-dir.test.ts', 'STARTED'],
    ['tests/contract/m-a5.nested-clone.test.ts', 'IN_GIT_REPO'],
    ['tests/component/m-a6.operator-repository.test.ts', 'IN_GIT_REPO'],
    ['tests/contract/m-a16.text-only.test.ts', 'IN_GIT_REPO'],
    ['tests/component/m-a16.result-line.test.ts', 'DASHBOARD_DEPS'],
    ['tests/component/m-a16.skip-panel.test.ts', 'DASHBOARD_DEPS']
  ];

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
