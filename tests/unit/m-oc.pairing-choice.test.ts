/**
 * M-OC · Unit · Which request Approve means, and what a refusal says
 *
 * Purpose:  Findings 2 and 3 of the 2026-09-29 review.
 *
 *           `latest` approved `pending[0]` — the newest request of **any**
 *           device. Anything on the stack's network can put a request in that
 *           queue: `openclaw node run --host openclaw.localhost` from a
 *           container leaves a `role: node`, `clientId: node-host` one, and the
 *           reviewer's two-device run answered
 *           `200 "Approved dev-bravo-bbbbbbbbbbbb"` while alpha stayed pending.
 *           The operator presses Approve to let their own browser back in, so
 *           that click let in the wrong thing **and** left them locked out. The
 *           card's copy — "Approving gives it back what it had" — was false for
 *           such a request. `toRequest` also dropped `role` entirely, so neither
 *           the rule nor the operator could tell the two apart.
 *
 *           And `firstLine()` returned the **last** non-empty line. The CLI ends
 *           a refusal with its own usage footer, so
 *           `Reason: missing scope: operator.pairing` was replaced by
 *           `[openclaw] Help: openclaw --help` on its way to the operator.
 * Given:    `chooseRequest` and `cliMessage` from
 *           `dashboard/src/lib/server/pairing.ts`, called directly. Two devices
 *           in the queue: `dev-alpha-aaaaaaaaaaaa`, a
 *           `clientId: openclaw-control-ui` / `role: operator` request at
 *           ts 945, and `dev-bravo-bbbbbbbbbbbb`, a `clientId: node-host` /
 *           `role: node` request at ts 1000 — the 55 ms gap the reviewer
 *           measured. Ids are real-shaped UUIDs, because the guard checks the
 *           shape. And the CLI's five-line refusal as it was captured live,
 *           ending in `[openclaw] Help: openclaw --help`.
 * When:     A choice is asked for with no id, with a device, and with an id.
 * Then:     The node host is never chosen, the operator's own browser is, two
 *           browsers are a question rather than a guess, and the refusal carries
 *           the reason.
 * Covers:   OC-48, OC-49, OC-50, OC-51, R2
 * Unhappy:  OC-48 and OC-50 are the refusals. OC-49 is the counterpart — one
 *           browser retrying must still be approved without a question, which is
 *           the case this whole card exists for, so the guard cannot be met by
 *           refusing whenever anything is ambiguous.
 */
import { test, expect, describe } from 'bun:test';
import { chooseRequest, cliMessage, type PendingRequest } from '../../dashboard/src/lib/server/pairing';

const req = (over: Partial<PendingRequest> = {}): PendingRequest => ({
  requestId: '09cc464f-690a-4a51-9ac9-c97b7011eb34',
  deviceId: 'dev-alpha-aaaaaaaaaaaa',
  clientId: 'openclaw-control-ui',
  role: 'operator',
  scopes: ['operator.read', 'operator.write'],
  remoteAddress: '10.99.0.2',
  isRepair: true,
  requestedAt: 945,
  ...over
});

const NODE_HOST = req({
  requestId: '22222222-2222-2222-2222-222222222222',
  deviceId: 'dev-bravo-bbbbbbbbbbbb',
  clientId: 'node-host',
  role: 'node',
  scopes: ['node.run'],
  requestedAt: 1000
});

/**
 * The refusal the real CLI prints, captured 2026-10-14.
 *
 * **It was not a capture before**, which is B5 of the 2026-10-01 review: it was
 * labelled "captured on 2026-09-29" and carried `Gateway call failed:
 * devices.approve`, `The gateway requires operator.pairing for this method.` and
 * `Usage: openclaw devices approve <requestId>` -- three lines the CLI does not
 * print. The reviewer noticed because it disagreed with their own capture, and
 * said it was harmless since `cliMessage` handles both. Harmless and wrong are
 * different things: a fixture that is labelled as a measurement is the thing a
 * reviewer trusts instead of running the command.
 *
 * Taken from `liquidupstart/openclaw:latest` on the running stack, the same
 * invocation `config/scripts/openclaw-pairing.sh` makes -- `devices list --json`
 * over `ws://openclaw.localhost:8888` with `--token unused`, inside
 * `nocodenation_liquid_upstart_network_8888`. Verbatim, five lines, in this
 * order. The grant is still missing on that stack, which is why the command
 * answers this at all.
 */
const CLI_REFUSAL = [
  '[openclaw] Could not start the CLI.',
  '[openclaw] Reason: missing scope: operator.pairing',
  '[openclaw] Debug: set OPENCLAW_DEBUG=1 to include the stack trace.',
  '[openclaw] Try: openclaw doctor',
  '[openclaw] Help: openclaw --help'
].join('\n');

describe('OC-48 a request that is not the operator browser is never chosen', () => {
  test('OC-48 the node host does not take the operator click', () => {
    // The whole of finding 2: the node request is newer, so pending[0] was it.
    const choice = chooseRequest([NODE_HOST, req()], {});
    expect(choice.kind).toBe('request');
    expect(choice.kind === 'request' && choice.requestId).toBe(req().requestId);
  });

  test('OC-48 and naming its id explicitly does not get it approved either', () => {
    // Otherwise the rule would be a matter of which field the caller filled in.
    const choice = chooseRequest([NODE_HOST, req()], { requestId: NODE_HOST.requestId });
    expect(choice.kind).toBe('refuse');
    expect(choice.kind === 'refuse' && choice.message).toContain('not a Control UI browser');
    expect(choice.kind === 'refuse' && choice.status).toBe(409);
  });

  test('OC-48 and with only such a request pending, the refusal says what is there', () => {
    // "Nothing is waiting" would be a lie with a queue that is not empty, and it
    // is the operator's only view of that queue.
    const choice = chooseRequest([NODE_HOST], {});
    expect(choice.kind).toBe('refuse');
    expect(choice.kind === 'refuse' && choice.message).toContain('1 other request is pending');
    expect(choice.kind === 'refuse' && choice.message).toContain('OpenClaw CLI');
  });
});

describe('OC-76 a device that is gone is not the same as an empty queue', () => {
  const CHARLIE = req({
    requestId: '33333333-3333-3333-3333-333333333333',
    deviceId: 'dev-charlie-cccccccccccc',
    requestedAt: 1200
  });

  test('OC-76 a stale deviceId with another browser waiting says so, and does not claim the queue is empty', () => {
    // C1 of the 2026-10-01 review, reproduced before it was fixed:
    // `chooseRequest([charlie], { deviceId: 'dev-alpha-aaaaaaaaaaaa' })` answered
    // 409 with "Nothing is waiting for approval." -- while charlie was waiting and
    // the card beside that sentence was listing him. `others` counts only what
    // this cannot approve, so it was 0 and the message fell through to the
    // emptiest of three. The path is ordinary: a refused browser stops asking,
    // the gateway drops its request after about five minutes, and a card left
    // open still carries the button.
    const choice = chooseRequest([CHARLIE], { deviceId: 'dev-alpha-aaaaaaaaaaaa' });
    expect(choice.kind).toBe('refuse');
    expect(choice.kind === 'refuse' && choice.status).toBe(409);
    expect(choice.kind === 'refuse' && choice.message).toContain('no longer waiting');
    expect(choice.kind === 'refuse' && choice.message).toContain('1 other request is waiting');
    // The sentence that was wrong, named so it cannot come back.
    expect(choice.kind === 'refuse' && choice.message).not.toContain('Nothing is waiting');
  });

  test('OC-76 and it counts them, so two waiting browsers do not read as one', () => {
    const choice = chooseRequest([CHARLIE, req({ deviceId: 'dev-delta-dddddddddddd' })], {
      deviceId: 'dev-alpha-aaaaaaaaaaaa'
    });
    expect(choice.kind === 'refuse' && choice.message).toContain('2 other requests are waiting');
    expect(choice.kind === 'refuse' && choice.message).toContain('press the one you mean');
  });

  test('OC-76 the counterpart: with nothing waiting at all, the empty answer is the right one', () => {
    // Otherwise the fix would be a message that never says the queue is empty,
    // which is just as wrong in the other direction.
    const choice = chooseRequest([], { deviceId: 'dev-alpha-aaaaaaaaaaaa' });
    expect(choice.kind).toBe('refuse');
    expect(choice.kind === 'refuse' && choice.message).toBe('Nothing is waiting for approval.');
  });

  test('OC-76 and with only a request it cannot approve, that is still what the refusal says', () => {
    // The third branch, unchanged: the node host is pending, nothing eligible is,
    // and the operator is told what is actually there.
    const choice = chooseRequest([NODE_HOST], { deviceId: 'dev-alpha-aaaaaaaaaaaa' });
    expect(choice.kind === 'refuse' && choice.message).toContain('1 other request is pending');
    expect(choice.kind === 'refuse' && choice.message).toContain('OpenClaw CLI');
    expect(choice.kind === 'refuse' && choice.message).not.toContain('no longer waiting');
  });
});

describe('OC-49 while one browser retrying is approved without a question', () => {
  test('OC-49 the counterpart: the newest id of that one device is chosen', () => {
    // The id churn is the mechanism this card was built around: four ids for one
    // device within thirty minutes on 2026-09-19. Those are not four browsers.
    const older = req({ requestId: '53176b95-0000-4000-8000-000000000000', requestedAt: 900 });
    const newest = req({ requestId: '09cc464f-690a-4a51-9ac9-c97b7011eb34', requestedAt: 990 });
    const choice = chooseRequest([older, newest], {});
    expect(choice.kind === 'request' && choice.requestId).toBe(newest.requestId);
  });

  test('OC-49 and a named device is resolved to its own newest request', () => {
    const mine = req({ requestId: '11111111-1111-1111-1111-111111111111', requestedAt: 900 });
    const other = req({
      requestId: '33333333-3333-3333-3333-333333333333',
      deviceId: 'dev-charlie-cccccccccccc',
      requestedAt: 1200
    });
    const choice = chooseRequest([other, mine], { deviceId: mine.deviceId });
    expect(choice.kind === 'request' && choice.requestId).toBe(mine.requestId);
  });
});

describe('OC-50 and two browsers are a question, not a guess', () => {
  test('OC-50 an unqualified approval refuses and says how many', () => {
    const other = req({
      requestId: '33333333-3333-3333-3333-333333333333',
      deviceId: 'dev-charlie-cccccccccccc',
      requestedAt: 1200
    });
    const choice = chooseRequest([other, req()], {});
    expect(choice.kind).toBe('refuse');
    expect(choice.kind === 'refuse' && choice.status).toBe(409);
    expect(choice.kind === 'refuse' && choice.message).toContain('2 different browsers');
  });
});

describe('OC-51 a refusal carries the reason, not the usage footer', () => {
  test('OC-51 the reason survives', () => {
    const message = cliMessage(CLI_REFUSAL);
    expect(message).toContain('missing scope: operator.pairing');
    expect(message).not.toContain('openclaw --help');
    // The three trailing lines of the real capture, none of which is the reason.
    // Asserted by name because the defect was that the **last** line won: with
    // `.slice(-1)` the operator read `Help: openclaw --help`, and `Try: openclaw
    // doctor` and the `Debug:` hint are two more ways to be wrong in the same
    // direction. The old fixture had none of them.
    expect(message).not.toContain('openclaw doctor');
    expect(message).not.toContain('OPENCLAW_DEBUG');
  });

  test('OC-51 and a one-line answer still passes through unchanged', () => {
    // The ordinary case: a request id goes stale within seconds, and that answer
    // is a single line. It is the reason the original took the last line, so the
    // repair has to keep it working.
    expect(cliMessage('[openclaw] Request 09cc464f is no longer pending.')).toBe(
      'Request 09cc464f is no longer pending.'
    );
  });

  test('OC-51 and an empty output is empty, so the caller can say its own thing', () => {
    expect(cliMessage('')).toBe('');
    expect(cliMessage('\n  \n')).toBe('');
  });
});

/**
 * A1 of the 2026-10-01 review: `devices … --json` reports a failure as
 * **pretty-printed** JSON on stdout with a non-zero exit, so the first non-empty
 * line is `{` — and `cliMessage` returned exactly that. The card read "OpenClaw
 * could not be asked what is waiting: {", and Approve answered 502 carrying the
 * same character.
 *
 * Reproduced against the unfixed function before this was written:
 *
 *   JSON failure      -> "{"
 *   JSON with reason  -> "{"
 *   plain text        -> "Gateway call failed: … — Reason: missing scope: …"
 *
 * **OC-52 passed throughout**, because its fixture is the non-JSON string, which
 * is the reviewer's point and the reason these scenarios use the two shapes he
 * captured live rather than invented ones.
 */
describe('OC-65 a JSON answer is read as JSON, not as its first line', () => {
  // The shapes, as captured from the real CLI by the reviewer.
  const transportError = JSON.stringify(
    { ok: false, error: { type: 'gateway_transport_error', message: 'connect ECONNREFUSED 10.99.0.2:8833' } },
    null,
    2
  );
  const forbidden = JSON.stringify(
    {
      ok: false,
      error: { type: 'forbidden', message: 'device approval refused', reason: 'missing scope: operator.pairing' }
    },
    null,
    2
  );

  test('OC-65 a transport failure says what failed, not "{"', () => {
    const got = cliMessage(transportError);
    expect(got).toBe('connect ECONNREFUSED 10.99.0.2:8833');
    expect(got).not.toBe('{');
  });

  test('OC-65 and the reason is carried, because it is the half that names the remedy', () => {
    // `missing scope: operator.pairing` is what tells an operator the grant is
    // absent rather than the gateway being down. Appended rather than chosen
    // between, the same shape the text path uses for `Reason:`.
    const got = cliMessage(forbidden);
    expect(got).toContain('device approval refused');
    expect(got).toContain('missing scope: operator.pairing');
  });

  test('OC-65 and plain text still goes through the line reader', () => {
    // The counterpart, and it is not decoration: the CLI also answers in plain
    // text with a usage footer, and that path is finding 3 of the 2026-09-29
    // review. A JSON-only reader would undo it.
    const got = cliMessage(
      '[openclaw] Gateway call failed: devices.list\nReason: missing scope: operator.pairing\n[openclaw] Help: openclaw --help'
    );
    expect(got).toBe('Gateway call failed: devices.list — Reason: missing scope: operator.pairing');
  });

  test('OC-65 and something that is neither falls back rather than throwing', () => {
    // A parse failure is a legitimate answer here, so it must not be an error.
    expect(cliMessage('not json at all')).toBe('not json at all');
    expect(cliMessage('')).toBe('');
    expect(cliMessage('[]')).toBe('[]');
  });
});

describe('OC-48 the branches of chooseRequest nothing had exercised', () => {
  // B5 of the 2026-10-01 review: "an explicit eligible `requestId` is never shown
  // to be accepted, and the `'latest'` branch is never exercised. OC-48 holds only
  // the refusal." A guard shown only to refuse is not shown to permit, and this
  // one decides which browser a press of Approve means.
  const alpha = req({
    requestId: '09cc464f-690a-4a51-9ac9-c97b7011eb34',
    deviceId: 'dev-alpha-aaaaaaaaaaaa',
    requestedAt: 945
  });
  const beta = req({
    requestId: '1b2c3d4e-5f60-4712-8899-aabbccddeeff',
    deviceId: 'dev-bravo-bbbbbbbbbbbb',
    requestedAt: 1000
  });

  test('OC-48 an explicit eligible requestId is accepted, and it is the one asked for', () => {
    // Not the newest: the whole point of the explicit path is that the operator's
    // choice wins over recency.
    const c = chooseRequest([alpha, beta], { requestId: alpha.requestId });
    expect(c.kind).toBe('request');
    expect(c.kind === 'request' && c.requestId).toBe(alpha.requestId);
  });

  test('OC-48 and the literal "latest" takes the newest request of the one device', () => {
    // The branch exists because the card once posted that literal, and the route
    // still accepts it. Unexercised, it could have resolved to the oldest.
    //
    // **One device, because my first version of this was wrong about the design.**
    // With two different devices pending, `latest` refuses — "2 different browsers
    // are waiting. Choose the one you mean." — which is OC-50's property and
    // deliberate. So the branch that resolves is the one-device case, and the
    // scenario below is its counterpart rather than a duplicate of OC-50.
    const retry = req({
      requestId: 'cccc3333-dddd-4eee-8fff-000011112222',
      deviceId: alpha.deviceId,
      requestedAt: 3000
    });
    const c = chooseRequest([alpha, retry], { requestId: 'latest' });
    expect(c.kind).toBe('request');
    expect(c.kind === 'request' && c.requestId).toBe(retry.requestId);
  });

  test('OC-48 and "latest" with two browsers waiting is a question, not a guess', () => {
    const c = chooseRequest([alpha, beta], { requestId: 'latest' });
    expect(c.kind).toBe('refuse');
    expect(c.kind === 'refuse' && c.status).toBe(409);
    expect(c.kind === 'refuse' && c.message).toContain('different browsers');
  });

  test('OC-48 and an explicit id that is not eligible is refused with 409', () => {
    // The counterpart to the first scenario: explicit does not mean unchecked.
    const nodeHost = req({
      requestId: '7777aaaa-bbbb-4ccc-8ddd-eeeeffff0000',
      deviceId: 'dev-node-cccccccccccc',
      clientId: 'node-host',
      role: 'node'
    });
    const c = chooseRequest([nodeHost], { requestId: nodeHost.requestId });
    expect(c.kind).toBe('refuse');
    expect(c.kind === 'refuse' && c.status).toBe(409);
  });

  test('OC-48 and a device with two requests resolves to that device newest', () => {
    // The `deviceId` path, which is what the card actually posts.
    const retry = req({
      requestId: 'aaaa1111-bbbb-4ccc-8ddd-eeeeffff2222',
      deviceId: alpha.deviceId,
      requestedAt: 2000
    });
    const c = chooseRequest([alpha, retry, beta], { deviceId: alpha.deviceId });
    expect(c.kind).toBe('request');
    expect(c.kind === 'request' && c.requestId).toBe(retry.requestId);
  });
});
