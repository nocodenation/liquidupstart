/**
 * M-SR · Component · The repositories card raises no error while a repository test waits
 *
 * Purpose:  `test()` in `GitRepositories.svelte` sets `results[slug]` to `null` while its
 *           request runs, and the `$effect` that drops a contradicted result line read
 *           `results[slug].cloned` without checking for it. That gave *TypeError: null is not
 *           an object*, printed three times by a run of `m-a16.result-line.test.ts` although its
 *           four cases pass, because none of them looks while the answer is pending. The effect
 *           now checks for `null` (SR-FR5).
 * Given:    The card mounted with one declared repository, not cloned, with a retry offered, and
 *           `fetch` stubbed with a promise this case resolves itself.
 * When:     *Test this repository* is pressed and the card settles while the answer is pending;
 *           then the answer arrives and the card settles again.
 * Then:     No error is collected while the answer is pending, and the result line is shown
 *           once it has arrived.
 * Covers:   SR-4, SR-FR5
 * Negative: the pending state, the one that threw, raises nothing.
 * Counterpart: the line that follows it, so the case is not met by a card that never ran the
 *           test at all.
 *
 * Test data: the repository of m-a16, `github.com_nocodenation_agent-skills`, not cloned,
 * `Permission denied (publickey).`, `canRetry: true`. The answer is
 * `{"ok":false,"message":"github.com/nocodenation/agent-skills is still unreachable: …"}`, the
 * text m-a16 uses. Errors are collected from `console.error`, from the window's `error` event
 * and from errors the process reports as uncaught while the case runs.
 *
 * Precondition: DASHBOARD_DEPS, as every component case of the card; without it the cases are
 * not registered and one named case says so.
 */
import { test, expect, describe, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { DASHBOARD_DEPS } from '../lib/preconditions';
import { mountComponent, reactiveProps } from '../lib/mount';

const CARD = join(repoRoot, 'dashboard/src/lib/components/GitRepositories.svelte');
const UNREACHABLE =
  'github.com/nocodenation/agent-skills is still unreachable: Permission denied (publickey). Register the deploy key below on github.com/nocodenation/agent-skills, then test it again.';

const repo = {
  slug: 'github.com_nocodenation_agent-skills',
  name: 'agent-skills',
  host: 'github.com',
  path: 'nocodenation/agent-skills',
  url: 'git@github.com:nocodenation/agent-skills.git',
  access: 'read',
  policy: 'protected',
  cloned: false,
  clonePath: 'volumes/repos/agent-skills',
  error: 'Permission denied (publickey).',
  canRetry: true,
  publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureKeyForTestsOnly fixture',
  fingerprint: 'SHA256:fixtureFixtureFixtureFixtureFixtureFixtureFi'
};
const view = {
  state: 'ready',
  message: 'One repository is declared.',
  declarationError: null,
  repositories: [repo],
  pending: [],
  declared: []
};

const realFetch = globalThis.fetch;
const realConsoleError = console.error;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

// Every way an error from the effect can surface, gathered while `run` is in progress.
async function collecting(run: (errors: string[]) => Promise<void>): Promise<void> {
  const errors: string[] = [];
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  const onWindow = (e: any) => errors.push(String(e?.error ?? e?.message ?? e));
  const onProcess = (e: unknown) => errors.push(String(e));
  globalThis.addEventListener?.('error', onWindow);
  process.on('uncaughtException', onProcess);
  process.on('unhandledRejection', onProcess);
  try {
    await run(errors);
  } finally {
    globalThis.removeEventListener?.('error', onWindow);
    process.off('uncaughtException', onProcess);
    process.off('unhandledRejection', onProcess);
  }
}

describe.skipIf(!DASHBOARD_DEPS)('SR-4 the repositories card while a test runs', () => {
  // A skipped describe still has its body evaluated, and this body awaits a mount: without the
  // early return the missing dependencies would surface as an error between tests. SP-2.
  if (!DASHBOARD_DEPS) return;

  let answer: (r: Response) => void = () => {};
  const pending = () => {
    globalThis.fetch = (() => new Promise<Response>((resolve) => { answer = resolve; })) as any;
  };
  const reply = () =>
    answer(new Response(JSON.stringify({ ok: false, message: UNREACHABLE }), { headers: { 'content-type': 'application/json' } }));

  test('SR-4 the negative: while a repository test waits for its answer, the card raises no error', async () => {
    await collecting(async (errors) => {
      pending();
      const m = await mountComponent(CARD, await reactiveProps({ git: view }));
      m.click('Test this repository');
      await m.settle();
      await m.settle();
      expect(errors).toEqual([]);
      reply();
      await m.settle();
      m.unmount();
    });
  });

  test('SR-4 and once the answer arrives, its line is shown', async () => {
    await collecting(async () => {
      pending();
      const m = await mountComponent(CARD, await reactiveProps({ git: view }));
      m.click('Test this repository');
      await m.settle();
      reply();
      await m.settle();
      await m.settle();
      expect(m.text()).toContain('is still unreachable');
      m.unmount();
    });
  });
});

test.skipIf(DASHBOARD_DEPS)('SP-2 the cases in this file need the dashboard dependencies, which are absent here', () => {
  expect(existsSync(join(repoRoot, 'dashboard', 'node_modules'))).toBe(false);
});
