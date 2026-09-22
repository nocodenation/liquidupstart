/**
 * M-A16 · Component · The deploy-key panel is held for its own skips, and counts what follows
 *
 * Purpose:  Two findings of 2026-09-21 in one panel, and the first case in this
 *           repository to mount a Svelte component. Both are conditions in
 *           markup, which is the layer `tests/component/` could not reach until
 *           the tier was opened for them.
 *
 *           Finding 3: `skipStep` held the panel open for three seconds after
 *           *any* skip. The git step runs before the sign-ins (`start.sh:255`
 *           and `:267`), so `needGitKey` still names the last repository and
 *           `gitKeyDone` is true — pressing "Skip for this start" on the Claude,
 *           Copilot, Codex or Grok panel therefore brought "Add a deploy key to
 *           continue" back for three seconds, over a repository that had been
 *           dealt with.
 *
 *           Finding 4: the countdown said "Next repository in 3…" whenever more
 *           than one repository was pending, including when the one being
 *           skipped was the last of them — after which the panel simply closed.
 * Given:    A task log carrying `::aiw-git-keys-pending::<a> <b>` and
 *           `::aiw-git-key-required::<b>`, so the panel is on the second of two
 *           repositories, and `/start-skip` stubbed to accept.
 * When:     "Skip for this start" is pressed on that panel, and separately on a
 *           provider panel after the git step is done.
 * Then:     The last repository counts down to "Closing", and a provider skip
 *           does not reopen the deploy-key panel at all.
 * Covers:   A16-12, A16-13, A16-14, A16-15, U11
 * Unhappy:  A16-12 and A16-14 are the refusals; A16-13 and A16-15 are their
 *           counterparts — the panel *is* still held for a git-key skip, and
 *           the label *does* say "Next repository" when one follows. Without
 *           them the fix could pass by never holding the panel and never
 *           counting, which is the defect M-A14 was built to remove: a
 *           confirmation swept away with its panel was never read.
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { mountComponent, reactiveProps, setupComponentTier } from '../lib/mount';

const TASK_RUNNER = join(repoRoot, 'dashboard/src/lib/components/TaskRunner.svelte');
const A = 'github.com_nocodenation_agent-skills';
const B = 'github.com_nocodenation_liquid-flows';

await setupComponentTier();
const { task } = await import(join(repoRoot, 'dashboard/src/lib/task-state.svelte.js'));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  // Every request this panel makes: the skip is accepted, and the repository
  // lookup answers with nothing, which the panel renders as the slug.
  globalThis.fetch = (async (url: any) => {
    // The sign-in probe must come back unreadable, because that is the state in
    // which the log's own marker decides -- which is the state finding 3 lives
    // in. A probe that answers puts the panel under its answer instead.
    if (String(url).includes('/claude-auth')) throw new Error('probe unavailable');
    return new Response(JSON.stringify(String(url).includes('/start-skip') ? { ok: true } : {}), {
      headers: { 'content-type': 'application/json' }
    });
  }) as any;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  task.log = '';
});

const waitingOn = (slug: string, pending: string[]) =>
  `::aiw-git-keys-pending::${pending.join(' ')}\n::aiw-git-key-required::${slug}\n`;

async function panel(log: string) {
  task.log = log;
  const props: any = await reactiveProps({ running: true, showStart: false });
  const m = await mountComponent(TASK_RUNNER, props);
  await m.settle();
  return m;
}

describe('A16-14 the countdown names what actually follows', () => {
  test('skipping the last of two says Closing', async () => {
    const m = await panel(waitingOn(B, [A, B]));
    expect(m.text()).toContain('Add a deploy key to continue');
    m.click('Skip for this start');
    await m.settle();
    // The whole sentence, not the two words: the countdown used to render as
    // `repository.Closing in 1…`, with no space, because Svelte trims the
    // whitespace at the start of the block that follows the full stop.
    expect(m.text()).toContain('without this repository. Closing in');
    expect(m.text()).not.toContain('Next repository in');
    m.unmount();
  });
});

describe('A16-15 and it does say Next repository when one follows', () => {
  test('skipping the first of two', async () => {
    const m = await panel(waitingOn(A, [A, B]));
    m.click('Skip for this start');
    await m.settle();
    expect(m.text()).toContain('without this repository. Next repository in');
    expect(m.text()).not.toContain('Closing in');
    m.unmount();
  });
});

describe('A16-13 a git-key skip is still held long enough to read', () => {
  test('the confirmation is on screen after the panel would have closed', async () => {
    const m = await panel(waitingOn(B, [B]));
    m.click('Skip for this start');
    await m.settle();
    // The panel is still drawn, and it is the skipped repository's own panel.
    expect(m.text()).toContain('Skipped — the start continues without this repository');
    m.unmount();
  });
});

describe('A16-12 a provider skip does not reopen a finished deploy-key panel', () => {
  test('skipping Claude leaves the git panel closed', async () => {
    const m = await panel(waitingOn(B, [B]));
    // Deal with the repository the way a start does: the skip, then the start's
    // own `::aiw-git-key-done::` for it, then the sign-in that comes after.
    m.click('Skip for this start');
    await m.settle();
    task.log += `::aiw-git-key-done::${B}\n::aiw-claude-auth-required::\n`;
    await m.settle();
    // And let the hold run out, so the panel is genuinely finished rather than
    // merely counting down.
    await Bun.sleep(3200);
    await m.settle();
    expect(m.text()).not.toContain('Add a deploy key to continue');

    const claudeSkip = m.find('Skip for this start');
    expect(claudeSkip).toBeDefined();   // the Claude panel's own control
    claudeSkip!.click();
    await m.settle();
    expect(m.text()).not.toContain('Add a deploy key to continue');
    m.unmount();
  }, 30_000);
});
