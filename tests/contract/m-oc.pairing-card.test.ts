/**
 * OC-43 / OC-44 / OC-45 — the card an operator can actually use.
 *
 * Purpose: R2 of §9. On 2026-09-19 the operator's browser was refused by the
 * Control UI and the only remedy that worked was deleting its site data. Their
 * words are the requirement: *"das würde kein user von sich aus tun."* A
 * recovery that assumes someone knows device tokens exist, that a browser stores
 * one, and where, is not a recovery.
 *
 * The one mechanism this card must respect is the id churn. A refused browser
 * retries and mints a **new request id every time** — four were observed for one
 * device within thirty minutes:
 *
 *   e626a793 → 0e4e2a95 → 53176b95 → 09cc464f
 *
 * — so an id rendered into a page is stale before it is clicked, and the id the
 * Control UI offers for copying is stale within seconds. The card therefore
 * sends `latest` and the server reads the current id at the moment the button is
 * pressed.
 *
 * Given  the route, the server module, the card and the script, read as text
 * When   each is examined
 * Then   the card never posts an id it rendered, the route resolves `latest`
 *        itself, the guard refuses anything that is not a request id before a
 *        command is built, and a failure arrives as the CLI's own words
 * And    the card is drawn only when something is actually waiting
 *
 * OC-44 and OC-45 are the negative halves. OC-43 is their counterpart and is
 * what stops the guard from being satisfied by a route that refuses everything:
 * a well-formed id must reach the command.
 *
 * Test data, both sides. Accepted: `09cc464f-690a-4a51-9ac9-c97b7011eb34`, the
 * real id that was approved on 2026-09-19. Refused: `latest-ish`,
 * `"; docker rm -f openclaw-gateway; #`, and
 * `09cc464f-690a-4a51-9ac9-c97b7011eb34 extra` — the last because a guard that
 * only looks at a prefix is the usual way this check is written wrong.
 *
 * What is NOT asserted here is how it looks: that needs eyes, and is the manual
 * observation in the test specification. What can be read out of the source is.
 *
 * Requirements covered: OC-G5, §9 R2, §9.4, OC-43 to OC-45.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REQUEST_ID } from '../../dashboard/src/lib/server/pairing';

const repoRoot = join(import.meta.dir, '..', '..');
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

const route = read('dashboard/src/routes/openclaw-pairing/+server.ts');
const server = read('dashboard/src/lib/server/pairing.ts');
const card = read('dashboard/src/lib/components/OpenClawPairing.svelte');
const script = read('config/scripts/openclaw-pairing.sh');
const page = read('dashboard/src/routes/+page.svelte');

const REAL_ID = '09cc464f-690a-4a51-9ac9-c97b7011eb34';

describe('OC-43 the operator has a control, and it is on the page', () => {
  test('the card is mounted', () => {
    expect(page).toContain('OpenClawPairing');
  });

  test('it offers an approve button and reads what is pending', () => {
    expect(card).toContain("fetch('/openclaw-pairing')");
    expect(card).toMatch(/method:\s*'POST'/);
    expect(card.toLowerCase()).toContain('approv');
  });

  test('and it is silent when nothing is waiting', () => {
    // A card that says "nothing pending" on every load is a card the operator
    // stops reading, and this one has to be noticed exactly once in a while.
    expect(card).toMatch(/\{#if[^}]*pending\.length > 0/);
  });

  test('a well-formed id reaches the command, so the guard is not refusing everything', () => {
    expect(REQUEST_ID.test(REAL_ID)).toBe(true);
  });
});

describe('OC-44 the id is read when the button is pressed, not when the page was drawn', () => {
  test('the card posts `latest` rather than an id it rendered', () => {
    expect(card).toContain("requestId: 'latest'");
    // The negative half of the same rule: nothing in the card may send a
    // req.requestId it has in hand.
    expect(card).not.toMatch(/requestId:\s*req\./);
  });

  test('the route resolves `latest` against what is pending now', () => {
    expect(route).toContain("asked === 'latest'");
    expect(route).toContain('pendingRequests()');
  });

  test('an id that is no longer pending fails loudly, in the CLI words', () => {
    // 502 with the message, never a quiet success. "No longer pending" is an
    // ordinary answer here, because the browser keeps replacing its id.
    expect(server).toContain('status: 502');
    expect(server).toContain('firstLine(output)');
    expect(route).toContain('Nothing is waiting for approval.');
  });
});

describe('OC-45 nothing but a request id reaches a command line', () => {
  const refused = [
    'latest-ish',
    '"; docker rm -f openclaw-gateway; #',
    `${REAL_ID} extra`,
    `x${REAL_ID}`,
    '',
    '09CC464F-690A-4A51-9AC9-C97B7011EB34'
  ];

  test('the guard accepts a real id', () => {
    expect(REQUEST_ID.test(REAL_ID)).toBe(true);
  });

  for (const bad of refused) {
    test(`and refuses ${JSON.stringify(bad)}`, () => {
      expect(REQUEST_ID.test(bad)).toBe(false);
    });
  }

  test('the script checks it again, because this route is not its only caller', () => {
    expect(script).toContain('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
  });

  test('and the script carries the three things that make the call work', () => {
    // Each was measured on 2026-09-19 and each is load-bearing: without the
    // host entry the name does not resolve and nginx routes by server_name to
    // pgadmin; without the variable the CLI refuses plaintext ws://; without a
    // token it refuses --url outright.
    expect(script).toContain('--add-host');
    expect(script).toContain('OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1');
    expect(script).toContain('--token unused');
  });

  test('and it computes the port and the proxy address rather than hardcoding them', () => {
    expect(script).toContain('get_env SYSTEM_HTTP_PORT');
    expect(script).toContain('get_env SYSTEM_PROXY_IP');
  });
});
