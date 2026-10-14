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
 *
 * **Every mount passes `running: true` since 2026-10-13.** The card takes
 * `running` and `busy` now and asks nothing while the stack is down or a task
 * holds the page — A3 of the 2026-10-01 review, where it ran a `docker run` every
 * 15 s in every open tab, stack up or down. These five scenarios are about what
 * the card does when there *is* something to ask, so they say so at the mount
 * rather than relying on a default. `OC-67` is the case for the other state.
 * Precondition: DASHBOARD_DEPS -- the dashboard's dependencies are installed.
 *           These four cases mount a Svelte component, so they need a DOM, and
 *           `tests/lib/mount.ts` resolves both happy-dom and svelte out of
 *           `dashboard/node_modules`. Without them the file used to produce five
 *           failures reading `Cannot find module .../@happy-dom/global-registrator`
 *           -- red for a reason that has nothing to do with the code, which is the
 *           failure mode #22 exists against. Its repair covered the eight
 *           milestone-A files and could not cover this one, because this file
 *           arrives with #15. Added 2026-10-13.
 * Unhappy:  OC-52 is the silent failure. OC-53 is its counterpart — an empty
 *           queue must still draw nothing, or the card would be on the page
 *           always and stop being read at all.
 */
import { test, expect, describe, afterEach } from 'bun:test';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { repoRoot } from '../lib/paths';
import { DASHBOARD_DEPS } from '../lib/preconditions';
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
  if (!DASHBOARD_DEPS) return;
  mounted?.unmount();
  mounted = null;
  restore?.();
  restore = null;
});

describe.skipIf(!DASHBOARD_DEPS)('OC-52 a listing that failed is said out loud', () => {
  test('OC-52 the card shows the reason instead of nothing', async () => {
    serve([{ ok: false, pending: [], message: REFUSAL }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    expect(mounted.text()).toContain('could not be asked');
    expect(mounted.text()).toContain('missing scope: operator.pairing');
  });
});

describe.skipIf(!DASHBOARD_DEPS)('OC-53 while nothing waiting is still nothing shown', () => {
  test('OC-53 the counterpart: an empty queue draws no card', async () => {
    // A card that is always on the page is a card nobody reads, which is the
    // whole reason this one is conditional.
    serve([{ ok: true, pending: [], message: '' }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    expect(mounted.text().trim()).toBe('');
  });
});

describe.skipIf(!DASHBOARD_DEPS)('OC-54 a request the card cannot approve is named, not offered', () => {
  test('OC-54 the operator browser gets the button and the node host does not', async () => {
    serve([{ ok: true, pending: [NODE_HOST, OPERATOR], message: '' }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    const text = mounted.text();
    expect(text).toContain('openclaw-control-ui');
    // Wording changed with B2: client and role are labelled as the requester's
    // own words, and the address leads because it is the one thing here that is
    // not. The property this row asserts is unchanged.
    expect(text).toContain('asking for the role');
    expect(text).toContain('operator');
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
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    mounted.click('Approve this browser');
    await mounted.settle();
    expect(posted).toEqual([{ deviceId: OPERATOR.deviceId }]);
  });
});

describe.skipIf(!DASHBOARD_DEPS)('OC-55 and a request that arrives later appears without a reload', () => {
  test('OC-55 a focus event re-reads the list', async () => {
    let queue: unknown[] = [];
    serve(() => ({ ok: true, pending: queue, message: '' }));
    mounted = await mountComponent(CARD, { running: true });
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

describe.skipIf(!DASHBOARD_DEPS)('OC-67 the card asks nothing while there is nothing it could mean', () => {
  // A3 of the 2026-10-01 review. The card sits outside the page's
  // `{#if data.running}` block, so "stack down" is the dashboard's ordinary first
  // state -- and it polled there every 15 s, in every open tab, each poll a
  // `docker run`. With the gateway stopped one GET took 19.2 s, longer than the
  // interval, so they piled up.
  let calls = 0;
  const counting = () => {
    calls += 1;
    return { ok: true, pending: [OPERATOR], message: '' };
  };

  test('OC-67 with the stack down it does not ask at all', async () => {
    calls = 0;
    serve(counting);
    mounted = await mountComponent(CARD, { running: false });
    await mounted.settle();
    expect(calls).toBe(0);
    // And it draws nothing rather than explaining itself.
    expect(mounted.text().trim()).toBe('');
  });

  test('OC-67 and while a task holds the page it does not ask either', async () => {
    // `busy` is the page's `activeTask !== ''`: a start, a teardown or a rebuild.
    // A poll attached across a `docker compose down` is the fifth leg of A3.
    calls = 0;
    serve(counting);
    mounted = await mountComponent(CARD, { running: true, busy: true });
    await mounted.settle();
    expect(calls).toBe(0);
  });

  test('OC-67 the counterpart: with the stack up it asks, once', async () => {
    // Without this the guard could be met by never asking at all, which is the
    // dead end this whole card exists to remove.
    calls = 0;
    serve(counting);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    expect(calls).toBe(1);
    expect(mounted.text()).toContain('waiting to be let in');
  });

  test('OC-67 and two triggers while one is unfinished make no second request', async () => {
    // Returning to a tab fires `visibilitychange` **and** `focus`, so two loads
    // ran and the later answer won -- which may be the older one.
    //
    // `serve` answers synchronously, so it cannot hold a request open; this one
    // stubs fetch directly for that reason, and restores it the same way.
    let n = 0;
    let release: (() => void) | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      n += 1;
      await new Promise<void>((r) => (release = r));
      return new Response(JSON.stringify({ ok: true, pending: [OPERATOR], message: '' }), {
        status: 200
      });
    }) as typeof fetch;
    restore = () => {
      globalThis.fetch = original;
    };

    mounted = await mountComponent(CARD, { running: true });
    await new Promise((r) => setTimeout(r, 40));
    expect(n).toBe(1);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 60));
    // Still one: the first has not finished, so both triggers were dropped
    // rather than queued.
    expect(n).toBe(1);
    release?.();
  });
});

describe.skipIf(!DASHBOARD_DEPS)('OC-68 a browser that was refused and stopped asking is still said out loud', () => {
  // A4 of the 2026-10-01 review. A refused Control UI makes **one** attempt and
  // stops, and the gateway drops a pending request after five minutes. The
  // reviewer measured it: token revoked, the tab left open for 450 s and polled
  // every 30 s -- after the drop there was no card and no hint, while OpenClaw
  // still showed "Role upgrade pending". An operator arriving later than five
  // minutes saw nothing at all.
  //
  // The listing already carried the answer: `paired[].tokens[].revokedAtMs`.
  const REVOKED = {
    deviceId: 'dev-alpha-aaaaaaaaaaaa',
    clientId: 'openclaw-control-ui',
    revokedAtMs: 1_700_000_000_000
  };

  test('OC-68 with nothing pending and a revoked Control UI token, the card is drawn', async () => {
    serve([{ ok: true, pending: [], revoked: [REVOKED], message: '' }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    const text = mounted.text();
    expect(text).toContain('refused');
    expect(text).toContain('no longer asking');
    // The heading says which state this is, rather than claiming something waits.
    expect(text).toContain('has stopped asking');
    expect(text).not.toContain('is waiting to be let in');
  });

  test('OC-68 and it names the one thing that brings the request back', async () => {
    // A refusal that does not say the next step is the dead end §9 exists to
    // remove. The step is not "approve" -- there is nothing to approve yet.
    serve([{ ok: true, pending: [], revoked: [REVOKED], message: '' }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    expect(mounted.text()).toContain('reload it once');
  });

  test('OC-68 the counterpart: a paired browser with live tokens draws nothing', async () => {
    // Without this the card would be on the page for every installation that has
    // ever paired a browser, which is the "card nobody reads" failure OC-53 is
    // about. `revoked` is empty because nothing was revoked.
    serve([{ ok: true, pending: [], revoked: [], message: '' }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    expect(mounted.text().trim()).toBe('');
  });

  test('OC-68 and a pending request still wins the heading', async () => {
    // Both states at once: the browser asked again while an older revocation is
    // still on record. What the operator can act on is the pending request, so
    // that is what the card leads with.
    serve([{ ok: true, pending: [OPERATOR], revoked: [REVOKED], message: '' }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    expect(mounted.text()).toContain('is waiting to be let in');
    expect(mounted.text()).not.toContain('no longer asking');
  });
});

describe.skipIf(!DASHBOARD_DEPS)('OC-70 the row claims nothing it cannot know', () => {
  test('OC-70 no retry count is shown, because it could only ever be one', async () => {
    // B1 of the 2026-10-01 review. The row read "asked N times", and N was always
    // 1: the gateway keeps **one** pending request per device and the request id
    // stayed the same across retries, so the listing never carried two entries for
    // one device. A number that cannot change is worse than no number, because it
    // reads as information.
    serve([{ ok: true, pending: [OPERATOR], revoked: [], message: '' }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    // The pattern, not the word: "One browser has **asked** for access" is the
    // card's own sentence and legitimate. What must be gone is `asked N times`.
    expect(mounted.text()).not.toMatch(/asked \d+ times?/);
  });

  test('OC-70 and it says whose words the client and the role are', async () => {
    // B2: both are connect parameters the requester chooses, so anything that can
    // open a gateway connection can file a request declaring them. The address
    // leads because it is the one thing here the requester does not declare.
    serve([{ ok: true, pending: [OPERATOR], revoked: [], message: '' }]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    const text = mounted.text();
    expect(text).toContain('its own words');
    // And the address is there, ahead of the claims.
    expect(text.indexOf('from 10.99.0.2')).toBeLessThan(text.indexOf('its own words'));
  });
});

describe.skipIf(!DASHBOARD_DEPS)('OC-69 a refusal the operator can act on', () => {
  // A5's other half. `openclaw.sh` writes `gateway.auth.identityScopes` only at
  // start, and `./run.sh` rebuilds the dashboard without restarting the stack --
  // so a gateway still running on the configuration `main` wrote has no grant,
  // every listing comes back `missing scope: operator.pairing`, and the card said
  // only that. A sentence naming a scope nobody can grant by hand here, because
  // the CLI that would do it is the one being refused.
  test('OC-69 the scope refusal is turned into the one thing that fixes it', async () => {
    serve([
      {
        ok: false,
        pending: [],
        revoked: [],
        message: 'Gateway call failed: devices.list — Reason: missing scope: operator.pairing'
      }
    ]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    const text = mounted.text();
    // The gateway's own words are kept, verbatim.
    expect(text).toContain('missing scope: operator.pairing');
    // And the remedy is said beside them.
    expect(text).toContain('has not been started since the dashboard was updated');
    expect(text).toContain('start it once');
  });

  test('OC-69 the counterpart: another refusal gets no restart instruction', async () => {
    // Without this the card would tell every operator to restart whatever went
    // wrong, which is the advice that teaches people to stop reading advice.
    serve([
      {
        ok: false,
        pending: [],
        revoked: [],
        message: 'connect ECONNREFUSED 10.99.0.2:8833'
      }
    ]);
    mounted = await mountComponent(CARD, { running: true });
    await mounted.settle();
    expect(mounted.text()).toContain('ECONNREFUSED');
    expect(mounted.text()).not.toContain('has not been started since');
  });
});

test.skipIf(DASHBOARD_DEPS)(
  'SP-2 the cases in this file need the dashboard dependencies, which are absent here',
  () => {
    // **`SP-2`, not `OC-52`.** It was named `OC-52` until 2026-10-13, and that put a
    // **pass** under `OC-52` in the JUnit report of a run where the card was never
    // mounted -- next to the real `OC-52`, skipped. Anything reading results by
    // case id recorded "OC-52 passed" for exactly the run the guard exists to make
    // visible: the silent green, under the id of the defect it covers. N1 of the
    // 2026-10-13 re-review. `SP-2` is the case that owns this rule, and the
    // precedent in `m-a16.result-line` files it there.
    //
    // Not a label. Without this the four describes above register nothing and a run
    // never mentions them, which is the silent gap #22's SP-2 refused to accept. It
    // asserts the absence, so it is a reading: run `bun install` in `dashboard/` and
    // the four come back.
    expect(existsSync(join(repoRoot, 'dashboard', 'node_modules'))).toBe(false);
  }
);
