/**
 * M-A16 · Component · A result line goes when it is contradicted, not when the data moves
 *
 * Purpose:  Finding 5 of 2026-09-21. `results` is client state on the card and
 *           survives `invalidateAll()`, which `01403f6` now runs after every
 *           task — so a "still unreachable" line from an earlier Test stood
 *           under a card that the next start had already re-read as cloned. Two
 *           statements about one repository on one screen, and the older one
 *           looks exactly as current as the newer.
 *
 *           The obvious repair is the other defect. Clearing on any change to
 *           the page data would wipe the answer the operator pressed the button
 *           for, because `invalidateAll()` runs immediately after the Test
 *           itself — which is M-A14's finding, a confirmation swept away before
 *           it could be read. So the line is stamped with the clone state it
 *           was about and shown only while the card still carries it.
 * Given:    One declared repository, not cloned, with a retry offered, and
 *           `/git-auth` stubbed to answer "still unreachable".
 * When:     Test is pressed, and then the page data changes — once to a start
 *           that cloned the repository, once to data that says the same thing
 *           it said before.
 * Then:     The line goes in the first case and stays in the second.
 * Covers:   A16-16, A16-17, A16-18, U1, U11
 * Unhappy:  A16-16 is the refusal. A16-17 is the counterpart that stops it
 *           being met by never showing a result at all. A16-18 is the tier's
 *           own control and the reason the other two can be believed: the first
 *           run of A16-16 during the spike passed over a component whose props
 *           never reached it, so the card was stale in its entirety and the
 *           "stale line" it asserted was simply the original line.
 */
import { test, expect, describe, afterEach } from 'bun:test';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { mountComponent, reactiveProps } from '../lib/mount';

const CARD = join(repoRoot, 'dashboard/src/lib/components/GitRepositories.svelte');
const UNREACHABLE =
  'github.com/nocodenation/agent-skills is still unreachable: Permission denied (publickey). Register the deploy key below on github.com/nocodenation/agent-skills, then test it again.';

const repo = (over: Record<string, unknown> = {}) => ({
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
  fingerprint: 'SHA256:fixtureFixtureFixtureFixtureFixtureFixtureFi',
  ...over
});

const view = (r: Record<string, unknown>, message = 'One repository is declared.') => ({
  state: 'ready',
  message,
  declarationError: null,
  repositories: [r],
  pending: [],
  declared: []
});

// Put back after every case. `bun test` runs every file in one process, so a
// stub left in place is a stub other files inherit -- five config-view cases
// went red on 2026-09-21 for exactly that, in a file nothing had touched.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answering(message: string, ok = false) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok, message }), {
      headers: { 'content-type': 'application/json' }
    })) as any;
}

describe('A16-18 the tier can see a change at all', () => {
  test('a prop change reaches a mounted component', async () => {
    // Nothing below this line means anything if this fails. It is here rather
    // than in a helper because a control that lives somewhere else is a control
    // nobody runs.
    const props: any = await reactiveProps({ git: view(repo(), 'BEFORE-THE-CHANGE') });
    const m = await mountComponent(CARD, props);
    expect(m.text()).toContain('BEFORE-THE-CHANGE');
    props.git = view(repo(), 'AFTER-THE-CHANGE');
    await m.settle();
    expect(m.text()).toContain('AFTER-THE-CHANGE');
    expect(m.text()).not.toContain('BEFORE-THE-CHANGE');
    m.unmount();
  });
});

describe('A16-16 a line that the card contradicts is gone', () => {
  test('a later start clones the repository and the old answer goes with it', async () => {
    answering(UNREACHABLE);
    const props: any = await reactiveProps({ git: view(repo()) });
    const m = await mountComponent(CARD, props);
    m.click('Test this repository');
    await m.settle();
    expect(m.text()).toContain('is still unreachable');

    props.git = view(repo({ cloned: true, error: null, canRetry: false }));
    await m.settle();

    // The control for this very assertion: the card itself must have moved on,
    // or "the line is gone" is a statement about a component that never
    // re-rendered.
    expect(m.find('Test this repository')).toBeUndefined();
    expect(m.text()).not.toContain('is still unreachable');
    m.unmount();
  });
});

describe('A16-17 and a line the card still agrees with stays', () => {
  test('the answer survives the reload the Test itself causes', async () => {
    answering(UNREACHABLE);
    const props: any = await reactiveProps({ git: view(repo()) });
    const m = await mountComponent(CARD, props);
    m.click('Test this repository');
    await m.settle();

    // What `invalidateAll()` does one line after the Test: the page data is
    // read again and says exactly what it said before. The operator has not
    // had time to read anything yet.
    props.git = view(repo());
    await m.settle();
    expect(m.text()).toContain('is still unreachable');
    m.unmount();
  });
});
