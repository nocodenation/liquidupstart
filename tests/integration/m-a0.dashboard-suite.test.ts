/**
 * M-A0 · Integration · The runner also covers the existing dashboard suite
 *
 * Purpose:  The repository already had tests before this harness existed. One
 *           command must cover the whole repository, otherwise the dashboard
 *           suite quietly rots while everyone watches the new one.
 * Given:    The dashboard package with its bun test suite.
 * When:     run.sh --dashboard is invoked.
 * Then:     The suite executes, reports at least one passing test and no
 *           failures, and the runner exits 0.
 * Covers:   A0-6
 * Unhappy:  A broken dashboard suite propagates as a non-zero exit — the same
 *           mechanism proven by A0-2, not duplicated here.
 */
import { test, expect } from 'bun:test';
import { runner } from '../lib/shell';

test('A0-6 the dashboard suite runs through the harness', () => {
  const r = runner(['--dashboard']);
  expect(r.code).toBe(0);
  expect(r.output).toContain('dashboard suite');
  expect(r.output).toMatch(/(\d+) pass/);
  expect(r.output).toContain('0 fail');
  const passed = Number(r.output.match(/(\d+) pass/)?.[1] ?? '0');
  expect(passed).toBeGreaterThan(0);
});
