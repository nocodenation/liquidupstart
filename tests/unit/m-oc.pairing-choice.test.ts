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

// The refusal the real CLI prints, captured on 2026-09-29.
const CLI_REFUSAL = [
  '[openclaw] Gateway call failed: devices.approve',
  '[openclaw] Reason: missing scope: operator.pairing',
  '[openclaw] The gateway requires operator.pairing for this method.',
  '[openclaw] Usage: openclaw devices approve <requestId>',
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
