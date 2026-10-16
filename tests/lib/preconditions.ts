/**
 * Where the suite is running, computed rather than assumed.
 *
 * Several cases read state that only exists in a particular kind of checkout,
 * and said so nowhere. They passed or failed on which directory the suite was
 * started from, which is the one thing their headers did not mention:
 *
 *   - a worktree cut for a feature branch has git and no started state, and no
 *     `dashboard/node_modules` until somebody installs them;
 *   - a release installation (`~/.liquidupstart`) has the started state and
 *     **no `.git` at all**;
 *   - the operator's own checkout, where a start has run, has everything.
 *
 * Measured 2026-10-08: the whole default tier from a worktree gave 9 failures
 * and 1 error, every one of them a case of this kind; moved to the installation
 * it gave the same count for the other reason. **Neither place satisfies the
 * whole suite**, so there is no directory to prescribe — which is why these are
 * values a case asks for rather than a rule somebody remembers.
 *
 * Each is a function of a root as well as a constant, so a test can put both
 * answers to it. A discriminator nobody has seen say "no" is a discriminator
 * nobody has tested.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './paths';
import { sh } from './shell';

/**
 * Has a start run in this checkout?
 *
 * `config/scripts/start/git.sh` is the only thing that creates
 * `volumes/_git-secrets` -- `mkdir -p "$SECRETS_DIR"` with `chmod 700` -- so its
 * presence *is* the question. `volumes/repos` is not the discriminator: three
 * other places create that, `m-a5.nested-clone`, `m-a10.fixture-ceiling` and
 * `gitfixture` itself, so it is there after any run of the suite.
 */
export function startedIn(root: string): boolean {
  return existsSync(join(root, 'volumes', '_git-secrets'));
}

/** Is this checkout a git repository at all? A release installation is not. */
export function inGitRepoAt(root: string): boolean {
  const r = sh(['git', 'rev-parse', '--is-inside-work-tree'], root);
  return r.code === 0 && r.stdout.trim() === 'true';
}

/**
 * Are the dashboard's dependencies installed? The component tier needs a DOM.
 *
 * **A symlink to another checkout's `node_modules` is not a substitute**, and
 * measuring with one costs an afternoon. Done here on 2026-10-09: the four cases
 * in `m-a16.result-line` passed through the link and the five in
 * `m-a16.skip-panel` failed, and the same five are 5/0 in a checkout with a real
 * install. `tests/lib/mount.ts` says why in its own header -- every bare `svelte`
 * specifier is rewritten to an absolute path under `dashboard/node_modules` so
 * that one reactive graph is shared, and a link makes that path resolve into a
 * second copy with its own signal registry. Updates are then written in one
 * universe and read in the other, which is invisible except as assertions that
 * never see a re-render.
 */
export function dashboardDepsIn(root: string): boolean {
  return existsSync(join(root, 'dashboard', 'node_modules'));
}

/**
 * Is a package registry reachable? The fourth precondition, and the one
 * `TEST-SPEC-suite-preconditions.md` first recorded as uncovered.
 *
 * **A function and not a constant, deliberately.** It costs a network round trip,
 * and a constant would charge every file that imports this module for a question
 * only two cases ask. Memoised per process, so the two pay once between them.
 *
 * **And it is not the whole answer to what was measured**, which is worth saying
 * here rather than in a commit nobody re-reads. `OC-15` and `OC-16` failed twice
 * by *timing out* at 60s and passed twice on a quiet machine: the registry was
 * reachable both times and the machine was busy. So this skips them where there is
 * no registry -- an offline machine, which is a real and common case -- while the
 * load-dependence is answered by their own budget, measured at 14s quiet against
 * the 60s that was not enough under load.
 */
// Memoised **per url**, which the first version was not: it cached one answer and
// returned it whatever it was asked about. SP-3's own case caught that -- the
// `skipIf` on its counterpart is evaluated at registration time, so the default
// url's `true` was already cached when the test for an unreachable host ran, and
// that test was green against a host that does not exist.
const registrySeen = new Map<string, boolean>();
export function registryReachable(url = 'https://registry.npmjs.org/'): boolean {
  const seen = registrySeen.get(url);
  if (seen !== undefined) return seen;
  const ok = sh(['curl', '-fsS', '--max-time', '5', '-o', '/dev/null', '-I', url]).code === 0;
  registrySeen.set(url, ok);
  return ok;
}

export const STARTED = startedIn(repoRoot);
export const IN_GIT_REPO = inGitRepoAt(repoRoot);
export const DASHBOARD_DEPS = dashboardDepsIn(repoRoot);

/**
 * One line naming what holds here, for a header or a failure message. Not
 * printed on import: a library that writes to stderr pollutes the output other
 * cases assert on.
 */
export function preconditions(): string {
  return `started=${STARTED} git=${IN_GIT_REPO} dashboard-deps=${DASHBOARD_DEPS} at ${repoRoot}`;
}
