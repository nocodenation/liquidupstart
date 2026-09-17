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

describe('A9-4 a skip is acted on at once, not at the next poll', () => {
  test('a click during the wait is noticed within a second', () => {
    // Measured on 2026-09-17 against the dashboard: a skip pressed at 6s was
    // acted on at 11s, because the loop slept out its whole interval and then
    // ran the condition -- a clone against an unreachable host -- before looking.
    // The operator pressed the button a second time, which is what a button that
    // appears not to work invites. The interval is now waited out in one-second
    // steps with the skip checked in each.
    const proj = mkdtempSync(join(tmpdir(), 'lu-wait-'));
    writeFileSync(join(proj, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=300\n');
    const script = `
      set -uo pipefail
      PROJECT_DIR=${JSON.stringify(proj)}
      ENV_FILE="$PROJECT_DIR/.env"
      . ${JSON.stringify(join(repoRoot, LIB))}
      lu_clear_skips
      # At 6s, which is after the check that runs before the loop: at 3s the
      # pre-loop check would catch it in either version and the case would not
      # discriminate -- it did not, on the first attempt.
      ( sleep 6; touch "$(lu_skip_dir)/probe" ) &
      start=$(date +%s)
      lu_wait_for_operator probe 5 sh -c 'sleep 3; false'
      echo "rc=$? after=$(( $(date +%s) - start ))"
    `;
    const r = sh(['bash', '-c', script]);
    const after = Number(r.output.match(/after=(\d+)/)?.[1] ?? -1);
    const code = Number(r.output.match(/rc=(\d+)/)?.[1] ?? -1);
    // Pressed at 6s. The old loop answered at 11s: five seconds sleeping, then
    // three running the condition, and only then a look at the file.
    expect({ code, prompt: after >= 6 && after <= 8, after }).toEqual({
      code: 1,
      prompt: true,
      after
    });
    // Its own limit: bun allows five seconds per test by default, and this one
    // deliberately waits longer than that. Without it the spawn is killed, the
    // output is empty, and the case fails with a parse of nothing -- which reads
    // like a broken helper rather than a short timeout.
  }, 60_000);
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

/**
 * A9-11 — the wait budget belongs to the start, not to each wait.
 *
 * Purpose: the deadline was read per wait, so it multiplied. Four sign-ins and
 * three unregistered deploy keys meant seven times `SYSTEM_SIGNIN_WAIT_SECONDS`,
 * and a host left alone overnight could sit for an hour and three quarters on a
 * setting that reads as fifteen minutes. The operator asked what happens with
 * more than one key; this is the answer — the number of waits no longer changes
 * how long a start can take. `lu_clear_skips` fixes one deadline for the start
 * and every wait after it shares that.
 *
 * Given  `SYSTEM_SIGNIN_WAIT_SECONDS=3` and a start whose skips have been cleared
 * When   two waits run in turn, neither of them satisfied
 * Then   the first waits out the budget and the second returns at once, saying
 *        the budget is used up — and the two together stay inside one budget
 *
 * What the budget bounds is a start in which nothing happens. A wait that ends
 * because someone acted — a key registered, Skip pressed — gives the rest of the
 * start a full budget again, or the operator working through a queue of three
 * keys would be cut off at a deadline fixed before the first of them. The third
 * case is that refresh, and without it the budget would be indistinguishable
 * from a start-wide guillotine.
 *
 * The positive counterpart matters as much: a budget that refuses while it still
 * has time would make every second wait useless. With ten seconds and a
 * condition that comes true at two, the second wait still returns 0.
 *
 * Test data: a scratch `.env` holding `SYSTEM_SIGNIN_WAIT_SECONDS=3` (10 for the
 * counterpart), a condition that is `test -f <scratch>/ready`, and the deadline
 * file `<scratch>/volumes/.start-skip/.deadline`.
 *
 * Requirements covered: A9-11, the operator's question of 2026-09-17.
 */
describe('A9-11 the budget is per start', () => {
  test('a second wait does not get a second deadline', () => {
    const proj = mkdtempSync(join(tmpdir(), 'lu-wait-'));
    writeFileSync(join(proj, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=3\n');
    const script = `
      set -uo pipefail
      PROJECT_DIR=${JSON.stringify(proj)}
      . ${JSON.stringify(join(repoRoot, LIB))}
      lu_clear_skips
      start=$(date +%s)
      lu_wait_for_operator first 1 false; echo "first=$?"
      lu_wait_for_operator second 1 false; echo "second=$? at=$(( $(date +%s) - start ))"
    `;
    const r = sh(['bash', '-c', script]);
    const at = Number(r.output.match(/at=(\d+)/)?.[1] ?? -1);
    expect({
      first: Number(r.output.match(/first=(\d+)/)?.[1] ?? -1),
      second: Number(r.output.match(/second=(\d+)/)?.[1] ?? -1),
      withinOneBudget: at <= 8,
      at
    }).toEqual({ first: 2, second: 2, withinOneBudget: true, at });
    expect(r.output).toContain('used up its 3s wait budget');
  }, 60_000);

  test('and a wait the operator ended gives the rest of the start a fresh budget', () => {
    // The refresh. Otherwise the second key of three would be asked for under a
    // deadline set before the first was registered, and an operator doing
    // exactly what the panel asks would be cut off for taking part.
    const proj = mkdtempSync(join(tmpdir(), 'lu-wait-'));
    writeFileSync(join(proj, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=4\n');
    const flag = join(proj, 'ready');
    const script = `
      set -uo pipefail
      PROJECT_DIR=${JSON.stringify(proj)}
      . ${JSON.stringify(join(repoRoot, LIB))}
      lu_clear_skips
      # The first wait ends at ~2s because the operator acted, not at the deadline.
      ( sleep 2; touch ${JSON.stringify(flag)} ) &
      lu_wait_for_operator first 1 test -f ${JSON.stringify(flag)}; echo "first=$?"
      start=$(date +%s)
      lu_wait_for_operator second 1 false; echo "second=$? waited=$(( $(date +%s) - start ))"
    `;
    const r = sh(['bash', '-c', script]);
    const waited = Number(r.output.match(/waited=(\d+)/)?.[1] ?? -1);
    // Without the refresh the second wait would have had 2 of its 4 seconds
    // left; with it, a full budget.
    expect({
      first: Number(r.output.match(/first=(\d+)/)?.[1] ?? -1),
      second: Number(r.output.match(/second=(\d+)/)?.[1] ?? -1),
      full: waited >= 3,
      waited
    }).toEqual({ first: 0, second: 2, full: true, waited });
  }, 60_000);

  test('and while the budget has time, a later wait still waits', () => {
    // The counterpart. A budget that refuses early would be indistinguishable
    // from a deadline of 0 for every wait after the first.
    const proj = mkdtempSync(join(tmpdir(), 'lu-wait-'));
    writeFileSync(join(proj, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=10\n');
    const flag = join(proj, 'ready');
    const script = `
      set -uo pipefail
      PROJECT_DIR=${JSON.stringify(proj)}
      . ${JSON.stringify(join(repoRoot, LIB))}
      lu_clear_skips
      lu_wait_for_operator first 1 true; echo "first=$?"
      ( sleep 2; touch ${JSON.stringify(flag)} ) &
      lu_wait_for_operator second 1 test -f ${JSON.stringify(flag)}
      echo "second=$?"
    `;
    const r = sh(['bash', '-c', script]);
    expect({
      first: Number(r.output.match(/first=(\d+)/)?.[1] ?? -1),
      second: Number(r.output.match(/second=(\d+)/)?.[1] ?? -1)
    }).toEqual({ first: 0, second: 0 });
    expect(existsSync(join(proj, 'volumes', '.start-skip', '.deadline'))).toBe(true);
  }, 60_000);
});

/**
 * A9-12 — one file can end a group of waits, and only the group that asked.
 *
 * Purpose: "Skip all" is a single click covering every deploy key this start is
 * waiting on. It is implemented as a group sentinel the caller names through
 * `LU_SKIP_GROUP`, rather than derived from the step name, so that no wait is
 * taken into a group by accident — a Claude sign-in must not end because a
 * deploy key was skipped.
 *
 * Given  the sentinel `<scratch>/volumes/.start-skip/git-key-all`
 * When   a wait runs with `LU_SKIP_GROUP=git-key-all`, and again without it
 * Then   the first returns 1 at once, and the second does not see the file at
 *        all and runs to its deadline
 *
 * Test data: step `git-key-probe`, group file `git-key-all`,
 * `SYSTEM_SIGNIN_WAIT_SECONDS=2` so the negative half returns quickly.
 *
 * Requirements covered: A9-12, the operator's request of 2026-09-17 for a
 * "Skip all" button.
 */
describe('A9-12 a group sentinel skips the waits that joined the group', () => {
  function withGroup(useGroup: boolean): { code: number; out: string } {
    const proj = mkdtempSync(join(tmpdir(), 'lu-wait-'));
    writeFileSync(join(proj, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=2\n');
    mkdirSync(join(proj, 'volumes', '.start-skip'), { recursive: true });
    writeFileSync(join(proj, 'volumes', '.start-skip', 'git-key-all'), '');
    const script = `
      set -uo pipefail
      PROJECT_DIR=${JSON.stringify(proj)}
      . ${JSON.stringify(join(repoRoot, LIB))}
      ${useGroup ? 'LU_SKIP_GROUP=git-key-all ' : ''}lu_wait_for_operator git-key-probe 1 false
      echo "rc=$?"
    `;
    const r = sh(['bash', '-c', script]);
    return { code: Number(r.output.match(/rc=(\d+)/)?.[1] ?? -1), out: r.output };
  }

  test('with the group named, the wait ends at once', () => {
    const r = withGroup(true);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Skipping git-key-probe');
  });

  test('and a wait that named no group ignores the same file', () => {
    // The negative half: the group is opt-in, so one click on the deploy-key
    // panel cannot silently end a sign-in wait somewhere else in the start.
    const r = withGroup(false);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain('Skipping');
  });
});
