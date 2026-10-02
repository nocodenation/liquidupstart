/**
 * M-OC · Component · The pairing card, mounted
 *
 * Purpose:  Findings 4, 5 and 6 of the 2026-09-29 review. The card's own test
 *           read the source as text, and the reviewer showed what that buys:
 *           it stayed 18/18 with the id guard removed, with `latest` picking the
 *           oldest request, with the result line deleted, and with the Origin
 *           check replaced by `if (false)`. A case that cannot fail is not a
 *           case, so the card is mounted here and driven.
 *
 *           Finding 4: `load()` ignored `ok` and `message`, so a failed listing
 *           set `pending = []` and the card stayed silent — although the server
 *           returns `ok: false` with the CLI's own words precisely so it would
 *           not be read as an empty list. If the identity grant is missing
 *           because the stack started before it existed, **every** listing
 *           fails, no card is ever drawn, and the operator is locked out with no
 *           hint: the dead end this card exists to remove, reached by a
 *           different road.
 *
 *           Finding 5: one read at mount, no poll and no re-read on focus. The
 *           operator starts the stack here, is refused in OpenClaw, and comes
 *           back to the open tab — and sees nothing until a manual reload.
 * Given:    `OpenClawPairing.svelte` mounted in the component tier with
 *           `globalThis.fetch` replaced, so what the card does with an answer is
 *           what is under test rather than the route. Three answers:
 *           `{ok: false, message: 'Gateway call failed: devices.list — Reason:
 *           missing scope: operator.pairing'}`;
 *           `{ok: true, pending: []}`; and a queue holding
 *           `dev-alpha-aaaaaaaaaaaa` (`openclaw-control-ui`, `role: operator`,
 *           from `10.99.0.2`) and `dev-bravo-bbbbbbbbbbbb` (`node-host`,
 *           `role: node`).
 * When:     The card is mounted against each, and — for the poll — against an
 *           answer that is empty at mount and holds a request afterwards, with a
 *           `focus` event dispatched.
 * Then:     A failure is said out loud, an empty queue stays silent, the node
 *           host is named but has no button, and a request that arrives later
 *           appears without a reload.
 * Covers:   OC-52, OC-53, OC-54, OC-55, R2, U11
 * Unhappy:  OC-52 is the silent failure. OC-53 is its counterpart — an empty
 *           queue must still draw nothing, or the card would be on the page
 *           always and stop being read at all.
 */
import { test, expect, describe, afterEach } from 'bun:test';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { mountComponent } from '../lib/mount';

const CARD = join(repoRoot, 'dashboard/src/lib/components/OpenClawPairing.svelte');

const OPERATOR = {
  requestId: '09cc464f-690a-4a51-9ac9-c97b7011eb34',
  deviceId: 'dev-alpha-aaaaaaaaaaaa',
  clientId: 'openclaw-control-ui',
  role: 'operator',
  scopes: ['operator.read', 'operator.write'],
  remoteAddress: '10.99.0.2',
  isRepair: true,
  requestedAt: 945
};
const NODE_HOST = {
  requestId: '22222222-2222-2222-2222-222222222222',
  deviceId: 'dev-bravo-bbbbbbbbbbbb',
  clientId: 'node-host',
  role: 'node',
  scopes: ['node.run'],
  remoteAddress: '10.99.0.7',
  isRepair: false,
  requestedAt: 1000
};
const REFUSAL =
  'Gateway call failed: devices.list — Reason: missing scope: operator.pairing';

type Answer = Record<string, unknown>;

let restore: (() => void) | null = null;
let posted: unknown[] = [];

// The card's only way out is fetch, so that is where the fixture goes.
function serve(answers: Answer[] | (() => Answer)) {
  const original = globalThis.fetch;
  posted = [];
  let at = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true, message: 'Approved.' }), { status: 200 });
    }
    const body = typeof answers === 'function' ? answers() : answers[Math.min(at++, answers.length - 1)];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  restore = () => {
    globalThis.fetch = original;
  };
}

let mounted: Awaited<ReturnType<typeof mountComponent>> | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  restore?.();
  restore = null;
});

describe('OC-52 a listing that failed is said out loud', () => {
  test('OC-52 the card shows the reason instead of nothing', async () => {
    serve([{ ok: false, pending: [], message: REFUSAL }]);
    mounted = await mountComponent(CARD, {});
    await mounted.settle();
    expect(mounted.text()).toContain('could not be asked');
    expect(mounted.text()).toContain('missing scope: operator.pairing');
  });
});

describe('OC-53 while nothing waiting is still nothing shown', () => {
  test('OC-53 the counterpart: an empty queue draws no card', async () => {
    // A card that is always on the page is a card nobody reads, which is the
    // whole reason this one is conditional.
    serve([{ ok: true, pending: [], message: '' }]);
    mounted = await mountComponent(CARD, {});
    await mounted.settle();
    expect(mounted.text().trim()).toBe('');
  });
});

describe('OC-54 a request the card cannot approve is named, not offered', () => {
  test('OC-54 the operator browser gets the button and the node host does not', async () => {
    serve([{ ok: true, pending: [NODE_HOST, OPERATOR], message: '' }]);
    mounted = await mountComponent(CARD, {});
    await mounted.settle();
    const text = mounted.text();
    expect(text).toContain('openclaw-control-ui');
    expect(text).toContain('role operator');
    expect(text).toContain('from 10.99.0.2');
    // Named, so the operator is not left wondering where their click went.
    expect(text).toContain('node-host');
    expect(text).toContain('does not approve');
    // One button, for the one device it can approve.
    expect(mounted.target.querySelectorAll('button').length).toBe(1);
  });

  test('OC-54 and pressing it names that device, never a rendered request id', async () => {
    // The id churn: four ids for one device within thirty minutes on 2026-09-19,
    // so an id rendered into a page is stale before it is clicked.
    serve([{ ok: true, pending: [NODE_HOST, OPERATOR], message: '' }]);
    mounted = await mountComponent(CARD, {});
    await mounted.settle();
    mounted.click('Approve this browser');
    await mounted.settle();
    expect(posted).toEqual([{ deviceId: OPERATOR.deviceId }]);
  });
});

describe('OC-55 and a request that arrives later appears without a reload', () => {
  test('OC-55 a focus event re-reads the list', async () => {
    let queue: unknown[] = [];
    serve(() => ({ ok: true, pending: queue, message: '' }));
    mounted = await mountComponent(CARD, {});
    await mounted.settle();
    // The state the operator was left in: they started the stack, were refused,
    // and this tab drew nothing.
    expect(mounted.text().trim()).toBe('');
    queue = [OPERATOR];
    window.dispatchEvent(new Event('focus'));
    await mounted.settle();
    expect(mounted.text()).toContain('openclaw-control-ui');
  });
});
