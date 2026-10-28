/**
 * A8-39 · Component · The repositories card draws itself only where the git integration is used
 *
 * Purpose:  A8-37 holds this through the served launchpad, which needs docker,
 *           so a run without it never checked the condition. Review round 1 of
 *           #52 asked for a case on every run. The condition moved from around
 *           the element on the page into `GitRepositories.svelte`, where a
 *           mounted case reaches it.
 * Given:    A project made by `tests/lib/gitproject.ts`, carrying the real
 *           `git-repos.sh`, its `.env` written by `declaredEnv`; the card data
 *           `gitCard()` builds from it; and `GitRepositories.svelte` mounted in
 *           the component tier with that data.
 * When:     The declaration is empty, refused by the parser, declared but not
 *           yet prepared, and declared with keys and a manifest.
 * Then:     The empty declaration draws nothing. The refused one draws the card
 *           with the parser's sentence and the hint naming *Git integration*.
 *           Both declared projects draw the card with their repositories.
 * Covers:   A8-39, A8-37's condition, FR3, U2
 * Negative: an empty declaration draws no card, and no "No repositories are
 *           declared".
 * Counterpart: a refused declaration keeps the card, since only
 *           `declarationError` tells it from the empty one, both being state
 *           `none`; and an unprepared and a ready project keep it, so a card that
 *           drew nothing at all cannot pass.
 * Precondition: DASHBOARD_DEPS -- the dashboard's dependencies are installed, since
 *           the component tier takes its DOM and svelte from
 *           `dashboard/node_modules`. Without them the cases are skipped, and the
 *           file says so under SP-2, as every mounted file does. SP-1, SP-2.
 *
 * Test data: empty is `GIT_REPOSITORIES` written empty. Refused is
 * `git@github.com:nocodenation/liquid-flows.git|sometimes|protected`, which
 * `git-repos.sh parse` refuses with "access must be read or write, not
 * 'sometimes'", A8-37's own line. Declared is `PAIR_DECLARATION`, which holds
 * `liquid-flows` and `agent-skills`: without `volumes/_git-secrets` the card's
 * state is `unprepared`; `pairProject` adds both key pairs and a manifest, and
 * the state is `ready`. The heading searched for is `Agent repositories`.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { DASHBOARD_DEPS } from '../lib/preconditions';
import { mountComponent } from '../lib/mount';
import { newProject, declaredEnv, pairProject, PAIR_DECLARATION } from '../lib/gitproject';

const CARD = join(repoRoot, 'dashboard/src/lib/components/GitRepositories.svelte');
const MISDECLARATION = 'git@github.com:nocodenation/liquid-flows.git|sometimes|protected';

const dir = newProject('lu-a839-');
const previous = process.env.ENV_DIR;
afterAll(() => {
  if (previous === undefined) delete process.env.ENV_DIR;
  else process.env.ENV_DIR = previous;
  rmSync(dir, { recursive: true, force: true });
});

async function drawn(prepare: () => void) {
  prepare();
  process.env.ENV_DIR = dir;
  const { gitCard } = await import(join(repoRoot, 'dashboard/src/lib/server/git.ts'));
  const git = gitCard();
  const m = await mountComponent(CARD, { git });
  const seen = { state: git.state, text: m.text(), html: m.html() };
  m.unmount();
  return seen;
}

describe.skipIf(!DASHBOARD_DEPS)('A8-39 the repositories card, mounted over gitCard()', () => {
  // A skipped describe still has its body evaluated; see A16-18.
  if (!DASHBOARD_DEPS) return;

  test('A8-39 the negative: an empty declaration draws no card', async () => {
    const seen = await drawn(() => declaredEnv(dir, ''));
    expect(seen.state).toBe('none');
    expect(seen.text).not.toContain('Agent repositories');
    expect(seen.text).not.toContain('No repositories are declared');
    expect(seen.html).not.toContain('<section');
  });

  test('A8-39 the counterpart: a declaration the parser refuses keeps the card, with its reason', async () => {
    const seen = await drawn(() => declaredEnv(dir, MISDECLARATION));
    expect(seen.state).toBe('none');
    expect(seen.text).toContain('Agent repositories');
    expect(seen.text).toContain("access must be read or write, not 'sometimes'");
    expect(seen.text).toContain('The declaration is under Git integration in the');
  });

  test('A8-39 the counterpart: a declared project keeps the card, prepared or not', async () => {
    const unprepared = await drawn(() => declaredEnv(dir, PAIR_DECLARATION));
    const ready = await drawn(() => pairProject(dir));
    expect([unprepared.state, ready.state]).toEqual(['unprepared', 'ready']);
    for (const seen of [unprepared, ready]) {
      expect(seen.text).toContain('Agent repositories');
      expect(seen.text).toContain('liquid-flows');
      expect(seen.text).toContain('agent-skills');
    }
  });
});

// The describe above registers nothing without the dependencies; this says so. SP-2.
test.skipIf(DASHBOARD_DEPS)(
  'SP-2 the cases in this file need the dashboard dependencies, which are absent here',
  () => {
    expect(existsSync(join(repoRoot, 'dashboard', 'node_modules'))).toBe(false);
  }
);
