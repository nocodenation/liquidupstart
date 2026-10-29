/**
 * M-CS · Component · The launchpad mounts no pairing card while OpenClaw is off
 *
 * Purpose:  CS-14's route answers an empty listing with OpenClaw off, which covers a tab
 *           opened before the switch. A launchpad loaded after it should not poll at all:
 *           every poll is a request for an image that may not exist. So the page mounts
 *           `OpenClawPairing` only while `data.components.openclaw` is true.
 * Given:    `dashboard/src/routes/+page.svelte` mounted in the component tier with load data
 *           for a running stack, no tiles, an undeclared git card and the components below;
 *           `fetch` replaced by a stub that answers `/openclaw-pairing` with one browser
 *           waiting and every other request with `{ "needed": false }`, and counts the
 *           pairing requests.
 * When:     The page is mounted with `components.openclaw` false, then true, and allowed to
 *           settle.
 * Then:     Off, no pairing request is made and the card's heading is not drawn. On, the
 *           card asks and draws *A browser is waiting to be let in*.
 * Covers:   CS-14, CS-FR10
 * Negative: with OpenClaw off the page never asks `/openclaw-pairing`.
 * Counterpart: with it on, the same page asks and draws the card, so a page that never
 *           mounted the card cannot pass.
 * Precondition: DASHBOARD_DEPS -- the component tier takes its DOM and svelte from
 *           `dashboard/node_modules`. Without them the cases are skipped, and the file says
 *           so under SP-2, as every mounted file does.
 *
 * Test data: the waiting browser is OC-52's operator request: request
 * `09cc464f-690a-4a51-9ac9-c97b7011eb34`, device `dev-alpha-aaaaaaaaaaaa`, client
 * `openclaw-control-ui`, role `operator`. The heading searched for is `A browser is waiting
 * to be let in`. The other components are on in both mounts.
 */
import { test, expect, describe, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { DASHBOARD_DEPS } from '../lib/preconditions';
import { mountComponent } from '../lib/mount';

const PAGE = join(repoRoot, 'dashboard/src/routes/+page.svelte');
const WAITING = {
  ok: true,
  pending: [
    {
      requestId: '09cc464f-690a-4a51-9ac9-c97b7011eb34',
      deviceId: 'dev-alpha-aaaaaaaaaaaa',
      clientId: 'openclaw-control-ui',
      role: 'operator',
      scopes: ['operator.read'],
      remoteAddress: '10.99.0.2',
      requestedAt: 945
    }
  ],
  revoked: []
};

let pairingAsked = 0;
let restore: (() => void) | null = null;
let mounted: Awaited<ReturnType<typeof mountComponent>> | null = null;

function serve() {
  const original = globalThis.fetch;
  pairingAsked = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).startsWith('/openclaw-pairing')) {
      pairingAsked += 1;
      return new Response(JSON.stringify(WAITING), { status: 200 });
    }
    return new Response(JSON.stringify({ needed: false }), { status: 200 });
  }) as typeof fetch;
  restore = () => {
    globalThis.fetch = original;
  };
}

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  restore?.();
  restore = null;
});

async function page(openclaw: boolean) {
  serve();
  mounted = await mountComponent(PAGE, {
    data: {
      running: true,
      needBuild: false,
      groups: [],
      extras: [],
      git: { state: 'none', message: '', declared: [], declarationError: null, repositories: [], pending: [] },
      components: { liquid: true, openclaw, opencode: true }
    }
  });
  for (let i = 0; i < 5; i++) await mounted.settle();
  return mounted;
}

describe.skipIf(!DASHBOARD_DEPS)('CS-14 the launchpad mounts no pairing card without OpenClaw', () => {
  // A skipped describe still has its body evaluated; see A16-18.
  if (!DASHBOARD_DEPS) return;

  test('CS-14 the negative: with OpenClaw off, no pairing request and no card', async () => {
    const m = await page(false);
    expect(pairingAsked).toBe(0);
    expect(m.text()).not.toContain('A browser is waiting to be let in');
  });

  test('CS-14 the counterpart: with OpenClaw on, the card asks and draws', async () => {
    const m = await page(true);
    expect(pairingAsked).toBeGreaterThan(0);
    expect(m.text()).toContain('A browser is waiting to be let in');
  });
});

// The describe above registers nothing without the dependencies; this says so. SP-2.
test.skipIf(DASHBOARD_DEPS)(
  'SP-2 the cases in this file need the dashboard dependencies, which are absent here',
  () => {
    expect(existsSync(join(repoRoot, 'dashboard', 'node_modules'))).toBe(false);
  }
);
