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
 * Covers:   OC-66, OC-68, R2, U11
 * Unhappy:  The timeout is the finding. The counterpart is a stub that answers at
 *           once: without it this would pass against a `run()` that always
 *           reports a timeout, which is the same defect wearing the other sign.
 *
 * On the grandchild, because it is the whole point: the stub writes its PID to a
 * file and the case reads that file and asks the operating system whether the
 * process still exists. Asserting only that `pendingRequests()` returned in time
 * would have passed against the defect, since the promise did eventually resolve.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BUDGET_MS = 2000;

/**
 * One project directory for the file, and the script rewritten per scenario.
 *
 * `$lib/server/project` captures `ENV_DIR` when it is first loaded, so a second
 * directory cannot be introduced by importing again -- and a query string on the
 * specifier breaks the module's own relative imports (measured: `Cannot find
 * module './project'`). `SCRIPT()` is a function and `spawn` reads the file at
 * each call, so swapping the script's contents is the seam that actually exists.
 */
const dir = mkdtempSync(join(tmpdir(), 'm-oc-budget-'));
mkdirSync(join(dir, 'config', 'scripts'), { recursive: true });
const scriptPath = join(dir, 'config', 'scripts', 'openclaw-pairing.sh');
const script = (body: string) => writeFileSync(scriptPath, body, { mode: 0o755 });

script('#!/usr/bin/env bash\nprintf \'%s\' \'{"pending":[]}\'\n');
process.env.ENV_DIR = dir;
process.env.OPENCLAW_PAIRING_BUDGET_MS = String(BUDGET_MS);
const { pendingRequests } = await import('../../dashboard/src/lib/server/pairing');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OPENCLAW_PAIRING_BUDGET_MS;
});

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
