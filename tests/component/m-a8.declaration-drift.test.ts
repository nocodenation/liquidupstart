/**
 * M-A8 · Component · What the card says when the manifest and .env disagree
 *
 * Purpose:  The manifest is what the last start prepared. The declaration is
 *           what the operator asked for. They part company on an ordinary
 *           sequence — declare a repository in the configuration view, save,
 *           and do not restart yet, which is A8-15 step 2 — and in the window a
 *           scoped retry leaves, because git.sh writes repositories.json whole
 *           from the declaration it is given. Until 2026-09-07 the card was
 *           built from the manifest alone and answered "All 1 prepared
 *           repository is cloned" while .env named two: the second one was not
 *           reported as missing, it was not reported at all. That is the shape
 *           U11 names — "a start that ends in a list of URLs and passwords
 *           while two repositories are unreachable" — reached from the other
 *           side.
 * Given:    A fixture declaring two repositories, with a manifest listing both.
 * When:     The manifest is narrowed to one, leaving the declaration alone.
 * Then:     The card names the missing one as declared and not yet prepared,
 *           and its message stops claiming everything is cloned.
 * Covers:   A8-20, FR11, FR20, U1, U11
 * Unhappy:  The positive half is the control: with the two in agreement the
 *           card reports nothing pending, so the assertion cannot pass by
 *           flagging everything.
 */
import { test, expect, beforeEach } from 'bun:test';
import { projectDir } from '../lib/dashboardfixture';
import {
  FLOWS,
  SKILLS,
  manifestEntry,
  pairProject,
  resetProject,
  writeManifest
} from '../lib/gitproject';

async function card() {
  process.env.ENV_DIR = projectDir;
  const { gitCard } = await import('../../dashboard/src/lib/server/git');
  return gitCard();
}

beforeEach(() => {
  resetProject(projectDir);
  pairProject(projectDir);
});

test('A8-20 with the manifest and the declaration in agreement, nothing is pending', async () => {
  const git = await card();

  expect(git.state).toBe('ready');
  expect(git.pending).toEqual([]);
  expect(git.repositories.map((r) => r.slug)).toEqual([FLOWS.slug, SKILLS.slug]);
});

test('A8-20 a repository the last start never saw is named, not dropped', async () => {
  writeManifest(projectDir, [manifestEntry(FLOWS)]);

  const git = await card();

  expect(git.repositories.map((r) => r.slug)).toEqual([FLOWS.slug]);
  expect(git.pending.map((r) => r.slug)).toEqual([SKILLS.slug]);
  expect(git.declared).toHaveLength(2);
});

test('A8-20 and the message stops claiming everything is cloned', async () => {
  writeManifest(projectDir, [manifestEntry(FLOWS)]);

  const { message } = await card();

  expect(message).toContain('no deploy key yet');
  expect(message).toContain('Start the stack');
  // Any completeness claim must be about what was prepared, never about what
  // was declared -- the declaration is the thing this state disagrees with.
  expect(message).not.toContain('declared repository is cloned');
  expect(message).not.toContain('declared repositories are cloned');
});
