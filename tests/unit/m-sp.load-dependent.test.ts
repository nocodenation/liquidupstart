/**
 * M-SP · Unit · A run that was cut off is not a verdict on the code
 *
 * Purpose:  Two cases built an image inside the suite's 60-second budget and
 *           reached the network doing it. They failed twice on 2026-10-09 —
 *           `Received: 130` and `this test timed out after 60000ms` — and **passed
 *           in two later runs on a quiet machine**. `BACKLOG.md` records why that
 *           is the worse of the two findings: a case whose colour depends on the
 *           load is how red stops meaning anything.
 *
 *           And the two read the interruption in opposite, both wrong, ways.
 *           `OC-15` expects exit 0, so a cut-off build reads as *"expected 0,
 *           received 130"* — a statement about the machine presented as a verdict
 *           on `--allow-scripts`. `OC-16` expects a **non-zero** exit, so a cut-off
 *           build satisfies its first assertion **by accident**; only the second,
 *           that npm named the script it refused to run, keeps it honest.
 *
 *           A third instance of the same class, found 2026-10-17 by walking into
 *           it: `startDashboard` asked `docker port` **once**, immediately after
 *           `docker run -d`, and threw *"no published port"* with an empty answer.
 *           What made it empty was never established (see the specification); the
 *           wait is now bounded by the clock, asks by the container's id, and says
 *           how the last attempt ended.
 * Given:    `wasInterrupted`, `refuseInterrupted` and `parsePublishedPort`, pure
 *           functions of what a child said, fed the answers measured on
 *           2026-10-21 (docker 29.8.1, bun 1.4.3); `sh()` with a timeout of its
 *           own, run against a real child; and `awaitPublishedPort` with an
 *           injected probe
 * When:     They are given a build cut off by its own timeout, one cut off by
 *           SIGINT, an ordinary failure, a success whose log says `context
 *           canceled`, and the answers `docker port` gives for a mapping, for a
 *           container not yet started, for one that is gone, and for nothing
 * Then:     Only the interruptions are called interruptions, and only they make
 *           the guard throw, naming the timeout it was given; only a real mapping
 *           parses as a port, the wait stops on the clock and asks by the id it
 *           was given; and the two cases that reach the network carry a budget
 *           of their own, a build timeout inside it, and the guard before each
 *           verdict
 * Covers:   SP-5
 *
 * Beside SP-3, not instead of it: `SP-3` (PR #24) skips these two where **no**
 *           registry answers, and `SP-5` refuses to turn a run that was cut off
 *           **although** one answered into a verdict. The two were written ten
 *           days apart as competing answers to one backlog line, and the
 *           division between them was settled on 2026-10-20 -- see the
 *           specification, which carries the account.
 * Negative: The interrupted results, the unparsable answers and the wait that
 *           never maps. Their counterparts carry the weight here: a guard that
 *           called **every** failure an interruption would swallow `OC-16`, which
 *           is a case whose whole point is that the build fails — and a parser
 *           that accepted anything would hand `startDashboard` a port of 1.5 and
 *           fail later, somewhere else.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh, wasInterrupted, refuseInterrupted, type Result } from '../lib/shell';
import { parsePublishedPort, awaitPublishedPort } from '../lib/dashboardserver';

// Measured 2026-10-21 against a `RUN sleep 40` build, docker 29.8.1.
const SIGINT_OUTPUT = '#5 CANCELED\nERROR: failed to build: failed to solve: Canceled: context canceled';

describe('SP-5 an interrupted child is told apart from a failing one', () => {
  test('SP-5 a build stopped by its own timeout is an interruption, whatever it exits with', () => {
    // What `Bun.spawnSync(..., { timeout })` gave for that build: exit 255,
    // `exitedDueToTimeout: true`, and not a word about it in the output.
    expect(wasInterrupted({ code: 255, output: '#5 0.131 start', timedOut: true })).toBe(true);
  });

  test('SP-5 and sh() reports its own timeout from a real child', () => {
    const r = sh(['sleep', '5'], repoRoot, {}, 200);
    expect(r.timedOut).toBe(true);
    expect(wasInterrupted(r)).toBe(true);
  });

  test('SP-5 a child a signal ended is an interruption, from a real child', () => {
    // The OOM killer, or anyone's kill: no exit code at all, which sh() reports
    // as -1 -- and -1 is not 0, which is what OC-16's first assertion asks.
    const r = sh(['sh', '-c', 'kill -9 $$'], repoRoot, {}, 10_000);
    expect({ code: r.code, signal: r.signal }).toEqual({ code: -1, signal: 'SIGKILL' });
    expect(wasInterrupted(r)).toBe(true);
  });

  test('SP-5 SIGINT is an interruption: 130, and the words docker prints for it', () => {
    expect(wasInterrupted({ code: 130, output: SIGINT_OUTPUT })).toBe(true);
    expect(wasInterrupted({ code: 1, output: SIGINT_OUTPUT })).toBe(true);
  });

  test('SP-5 the counterpart: an ordinary failure is not an interruption', () => {
    // This is the one that matters. OC-16 exists to see a build **fail**, so a
    // guard that called every failure an interruption would swallow the case it
    // was written to protect.
    expect(wasInterrupted({ code: 1, output: 'npm error ... install.cjs ... not run' })).toBe(false);
    const failed = sh(['sh', '-c', 'echo install.cjs >&2; exit 1'], repoRoot, {}, 10_000);
    expect({ timedOut: failed.timedOut, signal: failed.signal, interrupted: wasInterrupted(failed) }).toEqual({
      timedOut: false,
      signal: null,
      interrupted: false
    });
  });

  test('SP-5 and neither is success, not even one whose log mentions a cancellation', () => {
    expect(wasInterrupted({ code: 0, output: '1.2.3 (Claude Code)' })).toBe(false);
    expect(wasInterrupted({ code: 0, output: `${SIGINT_OUTPUT}\n1.2.3 (Claude Code)` })).toBe(false);
  });
});

describe('SP-5 the guard refuses an interrupted run and lets a finished one through', () => {
  const said = (r: Parameters<typeof refuseInterrupted>[0]): string | null => {
    try {
      refuseInterrupted(r, 'OC-1x', 570_000);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  test('SP-5 the negative: a build past its own timeout throws, naming that timeout', () => {
    const m = said({ code: 255, output: '#5 0.131 start', timedOut: true });
    expect({ timeout: m?.includes('ran past its 570s timeout'), nothing: m?.includes('this run measured nothing') }).toEqual({
      timeout: true,
      nothing: true
    });
  });

  test('SP-5 the negative: a build cut off by SIGINT throws, with its exit', () => {
    expect(said({ code: 130, output: SIGINT_OUTPUT })).toContain('was interrupted (exit 130)');
  });

  test('SP-5 and a caller that is not a build names its own subject and reason', () => {
    let m = '';
    try {
      refuseInterrupted({ code: 255, output: '', timedOut: true }, 'B6-35', 150_000, {
        subject: 'the watcher run',
        reason: ['  A debian:bookworm-slim pull that stalled says nothing about nar-watch.sh.']
      });
    } catch (e) {
      m = (e as Error).message;
    }
    expect(m).toContain('B6-35: the watcher run ran past its 150s timeout, so this run measured nothing.');
    expect(m).toContain('says nothing about nar-watch.sh');
    expect(m).not.toContain('docker build');
    expect(m).not.toContain('npm');
  });

  test('SP-5 the counterpart: an ordinary failure and a success pass through', () => {
    expect([
      said({ code: 1, output: 'npm error ... install.cjs ... not run' }),
      said({ code: 0, output: '1.2.3 (Claude Code)' })
    ]).toEqual([null, null]);
  });
});

describe('SP-5 and a published port is read, not assumed', () => {
  test.each([
    ['one mapping', '127.0.0.1:59685', 59685],
    ['two lines, the first wins', '0.0.0.0:32768\n[::]:32768', 32768],
    ['an IPv6 mapping', '[::]:32768', 32768],
    ['an IPv4-mapped IPv6 one', '[::ffff:127.0.0.1]:32768', 32768],
    ['the bare form older daemons print', ':::32768', 32768]
  ])('SP-5 %s parses', (_name, stdout, expected) => {
    expect(parsePublishedPort(stdout as string)).toBe(expected);
  });

  test.each([
    ['the empty answer, which is what a docker call that timed out returns', ''],
    ["a container created and not started, as docker 29.8.1 answers it", "no public port '3000' published for lu-f1-probe"],
    ['a container that is gone', 'Error response from daemon: No such container: lu-f1-probe'],
    ['a zero port, which docker never publishes on', '127.0.0.1:0'],
    ['a fraction', '127.0.0.1:1.5'],
    ['hex', 'x:0x10'],
    ['past the last port', '127.0.0.1:99999'],
    ['prose that happens to end in a number', 'nonsense:1']
  ])('SP-5 the negative: %s is no port', (_name, stdout) => {
    expect(parsePublishedPort(stdout as string)).toBeNull();
  });
});

describe('SP-5 and the wait for the mapping is bounded by time, and asks by id', () => {
  const answer = (stdout: string, code = 0): Result => ({ code, stdout, stderr: '', output: stdout });

  test('SP-5 a mapping that appears on the third ask is returned', async () => {
    const said = ['', '', '127.0.0.1:59685'];
    const asked: string[] = [];
    const r = await awaitPublishedPort('abc123', (id) => (asked.push(id), answer(said.shift() ?? '')), 5_000, 1);
    expect(parsePublishedPort(r.last.stdout)).toBe(59685);
    expect(r.attempts).toBe(3);
    expect(asked).toEqual(['abc123', 'abc123', 'abc123']);
  });

  // No upper bound on elapsed time in these: a case written against
  // load-dependent results must not have one of its own. That the call returns
  // at all is what shows it stops.
  test('SP-5 the negative: one that never appears stops at the deadline, with the last answer', async () => {
    const t0 = Date.now();
    const r = await awaitPublishedPort('abc123', () => answer('', -1), 300, 10);
    expect(r.last.code).toBe(-1);
    expect(r.attempts).toBeGreaterThan(3);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
  });

  test('SP-5 and a slow docker cannot multiply the wait, because the bound is the clock', async () => {
    const slow = () => (Bun.sleepSync(100), answer(''));
    const r = await awaitPublishedPort('abc123', slow, 250, 1);
    expect(r.attempts).toBeLessThanOrEqual(4);
  });

  test('SP-5 and a deadline used up before the second ask still gets three asks', async () => {
    // What three dashboards started side by side do to each other: the others'
    // synchronous docker calls run between this one's asks.
    const r = await awaitPublishedPort('abc123', () => (Bun.sleepSync(120), answer('')), 100, 1);
    expect(r.attempts).toBe(3);
  });

  test('SP-5 and startDashboard goes by the id docker run returned, for the port, the logs and the stop', () => {
    const body = readFileSync(join(repoRoot, 'tests/lib/dashboardserver.ts'), 'utf8');
    expect({
      id: /const id = started\.stdout\.trim\(\);/.test(body),
      port: /awaitPublishedPort\(id\)/.test(body),
      logsById: (body.match(/docker\(\['logs', id\]/g) ?? []).length,
      rmById: (body.match(/docker\(\['rm', '-f', id\]/g) ?? []).length,
      logsByName: /docker\(\['logs', name\]/.test(body),
      asksOnce: /const mapped = docker\(\['port', name, '3000'\], 60_000\);/.test(body)
    }).toEqual({ id: true, port: true, logsById: 2, rmById: 2, logsByName: false, asksOnce: false });
  });
});

describe('SP-5 and the cases that reach the network say how long they may take', () => {
  const file = readFileSync(join(repoRoot, 'tests/component/m-oc.allow-scripts.test.ts'), 'utf8');
  // One case's source: from its title to the next case or the end of the
  // describe, so both `test(title, fn, N)` and `test.skipIf(...)(\n title, fn,\n N\n)`
  // are read the same way.
  const caseOf = (title: string): string => {
    const at = file.indexOf(title);
    if (at < 0) return '';
    const rest = file.slice(at);
    const ends = [rest.indexOf('\n  test'), rest.indexOf('\n});')].filter((i) => i > 0);
    return rest.slice(0, Math.min(...ends));
  };
  const constant = (name: string): number => {
    const m = file.match(new RegExp(`const ${name} = ([0-9_]+);`));
    return m ? Number(m[1].replace(/_/g, '')) : NaN;
  };
  const budgetOf = (src: string): number => {
    const m = src.trimEnd().match(/,\s*([0-9_]+|[A-Z_]+)\s*\)\s*;?$/);
    if (!m) return NaN;
    return /^[0-9_]+$/.test(m[1]) ? Number(m[1].replace(/_/g, '')) : constant(m[1]);
  };
  const CASES = [
    ['OC-15', 'OC-15 with the flag'],
    ['OC-16', 'OC-16 without the flag']
  ];

  test.each(CASES)('SP-5 %s carries a budget of its own, at least ten minutes', (_id, title) => {
    // The suite's default is 60 seconds, which is a figure for cases that do not
    // reach the network.
    const src = caseOf(title);
    expect(src, `${title} not found`).not.toBe('');
    expect(budgetOf(src)).toBeGreaterThanOrEqual(600_000);
  });

  test('SP-5 and the build stops on its own timeout, inside that budget', () => {
    // Only a timeout the helper set is known to have fired: bun's budget kills the
    // child with SIGTERM and docker exits 255 without saying why.
    expect(file).toMatch(/const BUILD_TIMEOUT_MS = BUILD_BUDGET_MS - [0-9_]+;/);
    expect(file).toContain("dir], repoRoot, {}, BUILD_TIMEOUT_MS);");
  });

  test.each(CASES)('SP-5 and in %s the interruption guard runs before the verdict', (id, title) => {
    // Order is the whole point for OC-16: its first assertion is satisfied by an
    // interrupted build, so the guard has to come first or it guards nothing.
    // Read inside the case, so one case's guard cannot be vouched for by the
    // other case's assertion further down the file.
    const src = caseOf(title);
    const guard = src.indexOf(`refuseInterrupted(r, '${id}', BUILD_TIMEOUT_MS)`);
    const verdict = src.indexOf('expect(r.code');
    expect(guard, `${id} does not guard`).toBeGreaterThan(0);
    expect(verdict, `${id} has no verdict`).toBeGreaterThan(0);
    expect(guard).toBeLessThan(verdict);
  });
});
