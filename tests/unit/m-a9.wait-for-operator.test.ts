/**
 * A9-2 to A9-5 — the start waits for the operator, and comes back either way.
 *
 * Purpose: three steps in `config/scripts/start/openclaw.sh` already waited on a
 * human — Claude, Codex, Copilot, Grok — and each carried its own copy of the
 * deadline: the literal `900`, four times in one file. None of them could be
 * skipped. An operator without their phone, or without access to the repository
 * settings, could wait the fifteen minutes out or kill the start; those were the
 * two options. Review point 2 of #9 asks for a third.
 *
 * `config/scripts/start/lib/wait-for-operator.sh` is the one implementation:
 * announce, poll, honour a skip, stop at the deadline.
 *
 * Given  the helper, a condition under the case's control, and a scratch skip
 *        directory
 * When   it is asked to wait
 * Then   it returns 0 as soon as the condition is met, 1 when the operator
 *        skips, and 2 when the deadline passes — never later than the deadline
 *
 * A9-3 and A9-5 carry the weight and are both negative. A wait that cannot time
 * out turns an unattended start into a hang, and a skip that outlives its run is
 * a setting nobody remembers making.
 *
 * Test data: `SYSTEM_SIGNIN_WAIT_SECONDS=2` in a scratch `.env`, a condition that
 * is a `test -f` on a file the case creates, and the sentinel
 * `<scratch>/.start-skip/probe`.
 *
 * Requirements covered: A9-2, A9-3, A9-4, A9-5, review point 2 of #9.
 */
import { test, expect, describe } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const LIB = 'config/scripts/start/lib/wait-for-operator.sh';

/** Runs the helper in a scratch project, with the deadline the case chooses. */
function wait(opts: {
  seconds: string;
  step?: string;
  conditionTrue?: boolean;
  skipPresent?: boolean;
  staleSkip?: boolean;
  clearFirst?: boolean;
}): { code: number; out: string; elapsedMs: number } {
  const proj = mkdtempSync(join(tmpdir(), 'lu-wait-'));
  writeFileSync(join(proj, '.env'), `SYSTEM_SIGNIN_WAIT_SECONDS=${opts.seconds}\n`);
  const step = opts.step ?? 'probe';
  const flag = join(proj, 'ready');
  if (opts.conditionTrue) writeFileSync(flag, '');
  if (opts.skipPresent || opts.staleSkip) {
    mkdirSync(join(proj, 'volumes', '.start-skip'), { recursive: true });
    writeFileSync(join(proj, 'volumes', '.start-skip', step), '');
  }
  const script = `
    set -uo pipefail
    PROJECT_DIR=${JSON.stringify(proj)}
    ENV_FILE="$PROJECT_DIR/.env"
    get_env() { grep -E "^\${1}=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d "'\\"" || true; }
    . ${JSON.stringify(join(repoRoot, LIB))}
    ${opts.clearFirst ? 'lu_clear_skips' : ''}
    lu_wait_for_operator ${step} 1 test -f ${JSON.stringify(flag)}
    echo "rc=$?"
  `;
  const started = Date.now();
  const r = sh(['bash', '-c', script]);
  return { code: Number(r.output.match(/rc=(\d+)/)?.[1] ?? -1), out: r.output, elapsedMs: Date.now() - started };
}

describe('A9-2 a condition already met is not a wait', () => {
  test('it returns 0 at once, and says nothing', () => {
    const r = wait({ seconds: '900', conditionTrue: true });
    expect({ code: r.code, quick: r.elapsedMs < 3000 }).toEqual({ code: 0, quick: true });
    // No banner for a credential that is already there.
    expect(r.out).not.toContain('Skipping');
  });
});

describe('A9-3 a wait that is never satisfied still comes back', () => {
  test('it returns 2 at the deadline rather than blocking', () => {
    // The negative half, and the reason the deadline exists: an unattended start
    // that hangs is worse than one that reports a missing credential.
    const r = wait({ seconds: '2' });
    expect(r.code).toBe(2);
    expect(r.elapsedMs).toBeLessThan(20_000);
  });

  test('and a deadline of 0 does not wait at all', () => {
    const r = wait({ seconds: '0' });
    expect({ code: r.code, quick: r.elapsedMs < 3000 }).toEqual({ code: 2, quick: true });
    expect(r.out).toContain('SYSTEM_SIGNIN_WAIT_SECONDS is 0');
  });
});

describe('A9-4 the operator can skip one step', () => {
  test('a sentinel ends the wait immediately, naming the step', () => {
    const r = wait({ seconds: '900', skipPresent: true });
    expect({ code: r.code, quick: r.elapsedMs < 3000 }).toEqual({ code: 1, quick: true });
    expect(r.out).toContain('Skipping probe');
  });
});

describe('A9-5 a skip belongs to one run', () => {
  test('a sentinel from an earlier run does not skip this one', () => {
    // The negative half. Without the clear, an operator who skipped a sign-in
    // once would never be asked again, and the step would stay silent for good.
    const r = wait({ seconds: '2', staleSkip: true, clearFirst: true });
    expect(r.code).toBe(2);
    expect(r.out).not.toContain('Skipping');
  });
});
