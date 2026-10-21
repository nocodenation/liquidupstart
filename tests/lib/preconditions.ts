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
 * **The deployed key, not the directory it lives in.** Until 2026-10-14 this
 * asked for `volumes/_git-secrets` itself, on the grounds that
 * `config/scripts/start/git.sh` is the only thing that creates it. The directory
 * turned out to exist in a worktree where no start had ever run -- empty --
 * and the four cases that trust this answer then read state that was not there:
 * `A3-3` twice on `known_hosts`, `A4-16` on the shared hook, `A1-4` on the mode
 * of `volumes/repos`. Four red cases reporting a defect that did not exist, in
 * every worktree, which is the failure mode this whole module was written
 * against.
 *
 * `id_ed25519` is the artefact a start cannot finish without -- `git.sh:55`
 * generates it on every run -- and nothing in the suite writes one under
 * `repoRoot`; the fixtures that make key pairs all make them in throwaway
 * project directories. It is also not what any of those four cases assert, so
 * the discriminator and the things it gates stay independent: `known_hosts`, the
 * hooks directory and `volumes/repos` are each a separate artefact of the same
 * start.
 *
 * `volumes/repos` was already ruled out as the discriminator and still is: three
 * other places create it -- `m-a5.nested-clone`, `m-a10.fixture-ceiling` and
 * `gitfixture` itself -- so it is there after any run of the suite.
 */
export function startedIn(root: string): boolean {
  return existsSync(join(root, 'volumes', '_git-secrets', 'id_ed25519'));
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
