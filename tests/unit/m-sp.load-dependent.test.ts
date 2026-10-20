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
 *           `docker run -d`, and threw *"no published port"*. The container was up
 *           and publishing `127.0.0.1:55047->3000` seconds later. The message named
 *           the wrong cause — nobody had waited.
 * Given:    `wasInterrupted` and `parsePublishedPort`, both pure functions of what
 *           a child process said, so both answers are measured without docker and
 *           without load
 * When:     They are given an interrupted result, an ordinary failure, a success,
 *           docker's two wordings for a cancelled build, and the shapes
 *           `docker port` answers with
 *           — including the empty answer that started this
 * Then:     Only the interruptions are called interruptions, and only a real
 *           mapping parses as a port; and the two cases that reach the network
 *           carry a budget of their own rather than the suite's default
 * Covers:   SP-5
 *
 * Beside SP-3, not instead of it: `SP-3` (PR #24) skips these two where **no**
 *           registry answers, and `SP-5` refuses to turn a run that was cut off
 *           **although** one answered into a verdict. The two were written ten
 *           days apart as competing answers to one backlog line, and the
 *           division between them was settled on 2026-10-20 -- see the
 *           specification, which carries the account.
 * Negative: The interrupted result and the unparsable answers. Their counterparts
 *           carry the weight here: a guard that called **every** failure an
 *           interruption would swallow `OC-16`, which is a case whose whole point
 *           is that the build fails — and a parser that accepted anything would
 *           hand `startDashboard` a port of 0 and fail later, somewhere else.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { wasInterrupted } from '../lib/shell';
import { parsePublishedPort } from '../lib/dashboardserver';

describe('SP-5 an interrupted child is told apart from a failing one', () => {
  test('SP-5 exit 130 is an interruption', () => {
    // SIGINT: the per-test budget fired and took the child with it.
    expect(wasInterrupted({ code: 130, output: '' })).toBe(true);
  });

  test.each([
    ['docker cancelling a build mid-layer', 2, 'ERROR: failed to solve: context canceled'],
    ['the signal in words', 1, 'exit status 1: signal: interrupt']
  ])('SP-5 %s is an interruption too', (_name, code, output) => {
    // Two wordings because they differ between docker versions, and the exit code
    // is not always 130 when the daemon is the one that gives up.
    expect(wasInterrupted({ code, output })).toBe(true);
  });

  test('SP-5 the counterpart: an ordinary failure is not an interruption', () => {
    // This is the one that matters. OC-16 exists to see a build **fail**, so a
    // guard that called every failure an interruption would swallow the case it
    // was written to protect.
    expect(wasInterrupted({ code: 1, output: 'npm error ... install.cjs ... not run' })).toBe(false);
  });

  test('SP-5 and neither is success', () => {
    expect(wasInterrupted({ code: 0, output: '1.2.3 (Claude Code)' })).toBe(false);
  });
});

describe('SP-5 and a published port is read, not assumed', () => {
  test.each([
    ['one mapping', '127.0.0.1:55047', 55047],
    ['two lines, the first wins', '0.0.0.0:32768\n[::]:32768', 32768]
  ])('SP-5 %s parses', (_name, stdout, expected) => {
    expect(parsePublishedPort(stdout as string)).toBe(expected);
  });

  test.each([
    ['the empty answer that started this', ''],
    ['a zero port, which docker never publishes on', '127.0.0.1:0'],
    ['anything else', 'nonsense']
  ])('SP-5 the negative: %s is no port', (_name, stdout) => {
    // The empty one is the measured case: `docker port` answered with nothing
    // because the mapping was not visible yet, and the caller reported that the
    // container had published nothing.
    expect(parsePublishedPort(stdout as string)).toBeNull();
  });
});

describe('SP-5 and the cases that reach the network say how long they may take', () => {
  test('SP-5 both OC-15 and OC-16 carry a budget of their own', () => {
    // The suite's default is 60 seconds, which is a figure for cases that do not
    // reach the network. Without a budget here the repair is one quiet machine
    // away from coming back.
    const body = readFileSync(join(repoRoot, 'tests/component/m-oc.allow-scripts.test.ts'), 'utf8');
    const budgets = body.match(/^\s*\}, [0-9_]+\);$/gm) ?? [];
    expect(budgets.length, 'a build case without its own budget').toBe(2);
    for (const b of budgets) expect(Number(b.replace(/[^0-9]/g, ''))).toBeGreaterThanOrEqual(600_000);
  });

  test('SP-5 and the interruption guard runs before each verdict', () => {
    // Order is the whole point for OC-16: its first assertion is satisfied by an
    // interrupted build, so the guard has to come first or it guards nothing.
    const body = readFileSync(join(repoRoot, 'tests/component/m-oc.allow-scripts.test.ts'), 'utf8');
    for (const id of ['OC-15', 'OC-16']) {
      const i = body.indexOf(`refuseInterrupted(r, '${id}')`);
      expect(i, `${id} does not guard`).toBeGreaterThan(0);
      const after = body.slice(i);
      expect(after.indexOf('expect(r.code')).toBeGreaterThan(0);
    }
  });

  test('SP-5 and the dashboard waits for the mapping instead of asking once', () => {
    const body = readFileSync(join(repoRoot, 'tests/lib/dashboardserver.ts'), 'utf8');
    expect({
      waits: /awaitPublishedPort\(name\)/.test(body),
      asksOnce: /const mapped = docker\(\['port', name, '3000'\], 60_000\);/.test(body)
    }).toEqual({ waits: true, asksOnce: false });
  });
});
