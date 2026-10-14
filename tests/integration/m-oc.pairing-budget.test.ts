/**
 * M-OC · Integration · The budget bounds the request, and reaches what bash started
 *
 * Purpose:  A2 of the 2026-10-01 review, and worse than first reported.
 *           `setTimeout(() => child.kill(), BUDGET_MS)` signalled `bash` alone.
 *           The `docker run` bash had started was reparented and kept the stdio
 *           pipes, and `'close'` waits for the **pipes** rather than for the
 *           child — so the promise resolved only when that grandchild finished.
 *           The reviewer measured it with a 3-second budget and a stub
 *           `docker run … sleep 20`: bash died at 3 s, the container was still
 *           running at 5 s, and `run()` resolved at about **22 s**. So the budget
 *           did not bound the HTTP request at all, and a wedged docker held it
 *           open indefinitely — the case the budget's own comment says it exists
 *           for.
 * Given:    a throwaway project directory whose
 *           `config/scripts/openclaw-pairing.sh` is a stub that starts a
 *           long-running grandchild and then waits for it, with
 *           `OPENCLAW_PAIRING_BUDGET_MS` set to 2000 so the timeout path is
 *           driven in seconds.
 * When:     `pendingRequests()` is called and the clock is read
 * Then:     it settles at the budget rather than at the grandchild's lifetime,
 *           says it was stopped, and the grandchild is gone
 * Covers:   OC-66, OC-68, OC-70, R2, U11
 * Unhappy:  The timeout is the finding. The counterpart is a stub that answers at
 *           once: without it this would pass against a `run()` that always
 *           reports a timeout, which is the same defect wearing the other sign.
 *
 * On the grandchild, because it is the whole point: the stub writes its PID to a
 * file and the case reads that file and asks the operating system whether the
 * process still exists. Asserting only that `pendingRequests()` returned in time
 * would have passed against the defect, since the promise did eventually resolve.
 */
import { test, expect, describe } from 'bun:test';
import { rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The directory and the script seam come from `tests/lib/pairingproject.ts`, which
 * owns both for every pairing file at this level. They used to be declared here,
 * and the header of that module records what that cost once a second file wanted
 * them: `ENV_DIR` is captured on the first load of `$lib/server/project`, so the
 * file that lost the race set a variable nothing would read again.
 */
import { BUDGET_MS, projectDir as dir, script } from '../lib/pairingproject';

const { pendingRequests } = await import('../../dashboard/src/lib/server/pairing');

// Nothing to undo. The directory is left standing, the way `newProject` leaves
// the ones it makes -- it is shared now, and deleting it here removed it from
// under the route cases that ran afterwards (`ENOENT`, measured). The budget was
// captured by `$lib/server/pairing` on its first load, so unsetting the variable
// would not reach it either.

describe('OC-66 the budget bounds the request, and reaches what bash started', () => {
  test('OC-66 a script whose grandchild outlives the budget is stopped, grandchild and all', async () => {
    // The stub stands in for `docker run`: a grandchild that holds the pipes far
    // longer than the budget, with bash waiting on it.
    script(
      '#!/usr/bin/env bash\n' +
        'sleep 60 &\n' +
        `echo $! > ${join(dir, 'grandchild.pid')}\n` +
        'wait\n'
    );

    const t0 = Date.now();
    const r = await pendingRequests();
    const elapsed = Date.now() - t0;

    // Settled at the budget, not at the grandchild's 60 seconds.
    expect(elapsed).toBeLessThan(BUDGET_MS + 3000);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('did not finish');
    expect(r.message).toContain('nothing was approved');

    // And the grandchild is gone, which is the half `child.kill()` never did.
    const pidFile = join(dir, 'grandchild.pid');
    expect(existsSync(pidFile)).toBe(true);
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    expect(pid).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 300));
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  }, 60_000);

  test('OC-66 the counterpart: a script that answers at once is not reported as timed out', async () => {
    // Without this, a `run()` that always reported a timeout would pass the
    // scenario above — the same defect with the other sign.
    script('#!/usr/bin/env bash\nprintf \'%s\' \'{"pending":[]}\'\n');

    const t0 = Date.now();
    const r = await pendingRequests();
    expect(Date.now() - t0).toBeLessThan(BUDGET_MS);
    expect(r.message).not.toContain('did not finish');
    expect(r.ok).toBe(true);
  }, 60_000);
});

/**
 * OC-68's server half, and it exists because a control found it missing.
 *
 * The card's own scenarios stub `fetch`, so they hand `revoked` in ready-made —
 * and when the server's parse of `paired[].tokens[].revokedAtMs` was removed
 * **nothing went red**. A case that cannot fail on what the fix actually does is
 * the shape B5 of the 2026-10-01 review is about, and this is one found in my own
 * work by running the control rather than by reading.
 *
 * It drives the real `pendingRequests()` against a stub script that prints the
 * listing the CLI prints, so the parse is the thing under test.
 */
describe('OC-77 a warning on stderr does not make the answer unreadable', () => {
  test('OC-77 valid JSON on stdout with a warning beside it is still parsed', async () => {
    // C2 of the 2026-10-01 review. Both streams were appended to one string and
    // that string was handed to `JSON.parse`, so one line on stderr answered "The
    // gateway answered something that is not JSON." with the answer sitting in
    // stdout the whole time. The reviewer found no real trigger in about sixty
    // runs; that is the odds, not the consequence.
    //
    // The warning is the shape docker really writes to stderr on this machine
    // rather than an invented one, so the case is run against something that
    // happens.
    script(
      '#!/usr/bin/env bash\n' +
        'echo "WARNING: daemon is not using the overlay2 storage driver" >&2\n' +
        `printf '%s' '${JSON.stringify({
          pending: [
            {
              requestId: '09cc464f-690a-4a51-9ac9-c97b7011eb34',
              deviceId: 'dev-alpha-aaaaaaaaaaaa',
              clientId: 'openclaw-control-ui',
              role: 'operator',
              scopes: ['operator.read'],
              remoteIp: '10.99.0.9',
              ts: 1000
            }
          ],
          paired: []
        })}'\n` +
        'exit 0\n'
    );
    const r = await pendingRequests();
    expect(r.ok).toBe(true);
    expect(r.message).toBe('');
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0].deviceId).toBe('dev-alpha-aaaaaaaaaaaa');
  });

  test('OC-77 the counterpart: output that really is not JSON is still reported as that', async () => {
    // Otherwise the fix would be a parser that never complains, which is the
    // same defect facing the other way: a card that says nothing is waiting
    // because it could not read the answer.
    script('#!/usr/bin/env bash\nprintf \'%s\' \'not json at all\'\nexit 0\n');
    const r = await pendingRequests();
    expect(r.ok).toBe(false);
    expect(r.message).toBe('The gateway answered something that is not JSON.');
  });
});

describe('OC-68 the revoked Control UI is read out of the listing itself', () => {
  const listing = (paired: unknown) =>
    `#!/usr/bin/env bash\ncat <<'JSON'\n${JSON.stringify({ pending: [], paired })}\nJSON\n`;

  test('OC-68 a revoked token on a Control UI device is reported', async () => {
    script(
      listing([
        {
          deviceId: 'dev-alpha-aaaaaaaaaaaa',
          clientId: 'openclaw-control-ui',
          tokens: [{ revokedAtMs: 1_700_000_000_000 }, { revokedAtMs: 1_700_000_999_000 }]
        }
      ])
    );
    const r = await pendingRequests();
    expect(r.ok).toBe(true);
    expect(r.revoked).toHaveLength(1);
    expect(r.revoked[0].deviceId).toBe('dev-alpha-aaaaaaaaaaaa');
    // The newest revocation wins, so the card can say when it happened.
    expect(r.revoked[0].revokedAtMs).toBe(1_700_000_999_000);
  }, 30_000);

  test('OC-68 and live tokens are not a revocation', async () => {
    // The counterpart: without it the parse could report every paired device,
    // which would put the card on the page for every installation that has ever
    // paired a browser.
    script(
      listing([
        { deviceId: 'dev-alpha-aaaaaaaaaaaa', clientId: 'openclaw-control-ui', tokens: [{}] },
        { deviceId: 'dev-beta-bbbbbbbbbbbb', clientId: 'openclaw-control-ui', tokens: [] }
      ])
    );
    const r = await pendingRequests();
    expect(r.revoked).toEqual([]);
  }, 30_000);

  test('OC-68 and a revoked token on something that is not the Control UI is not ours', async () => {
    // §9's way back is about the operator's browser. A node host that lost a
    // token is not a browser the operator can reload, so a card about it would be
    // a card with no next step.
    script(
      listing([
        {
          deviceId: 'dev-node-cccccccccccc',
          clientId: 'node-host',
          tokens: [{ revokedAtMs: 1_700_000_000_000 }]
        }
      ])
    );
    const r = await pendingRequests();
    expect(r.revoked).toEqual([]);
  }, 30_000);
});

/**
 * OC-70 — the address comes from the field the gateway emits.
 *
 * B1 of the 2026-10-01 review: `toRequest` read `remoteAddress` and the gateway
 * writes `remoteIp`, so the route always returned `""` and the card said "role
 * operator" with no address. The reviewer checked the pinned 2026.9.1 image —
 * `remoteAddress` occurs nowhere in the pairing or devices CLI code.
 *
 * **The card's own scenarios cannot see this.** They stub `fetch` and hand in the
 * route's output shape, where the field *is* called `remoteAddress`. That is the
 * same blindness the control found for OC-68, so this drives the real parse.
 */
describe('OC-70 the requester address is read from remoteIp', () => {
  const listing = (pending: unknown) =>
    `#!/usr/bin/env bash\ncat <<'JSON'\n${JSON.stringify({ pending, paired: [] })}\nJSON\n`;
  const request = (extra: Record<string, unknown>) => ({
    requestId: '09cc464f-690a-4a51-9ac9-c97b7011eb34',
    deviceId: 'dev-alpha-aaaaaaaaaaaa',
    clientId: 'openclaw-control-ui',
    role: 'operator',
    scopes: ['operator.read'],
    ts: 1000,
    ...extra
  });

  test('OC-70 remoteIp reaches the card as the address', async () => {
    // The reviewer's own capture: `"remoteIp": "10.123.45.3"`.
    script(listing([request({ remoteIp: '10.123.45.3' })]));
    const r = await pendingRequests();
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0].remoteAddress).toBe('10.123.45.3');
  }, 30_000);

  test('OC-70 and the old field name is not accepted', async () => {
    // The counterpart, and it is the finding: accepting `remoteAddress` as well
    // would keep alive a fixture no gateway produces, which is exactly how this
    // hid for two review rounds.
    script(listing([request({ remoteAddress: '10.123.45.3' })]));
    const r = await pendingRequests();
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0].remoteAddress).toBe('');
  }, 30_000);
});
