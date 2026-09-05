/**
 * M-A1 · System · M-A1 adds no confinement to the workspace, and says so
 *
 * Purpose:  This test asserts a *non*-guarantee, deliberately. M-A1 gives the
 *           agents a workspace; it does not restrict them to it, and nothing in
 *           the milestone attempts to. Writing that down as an executable
 *           statement stops a later reader mistaking the absence of a check for
 *           the presence of a boundary — the same mistake §3.1 of the feature
 *           document warns about for the push gate. If confinement is ever
 *           added, this test fails and forces the decision to be recorded
 *           rather than absorbed silently.
 * Given:    A running stack.
 * When:     A file is written outside /repos inside an agent container.
 * Then:     It succeeds. That is the current, intended and unguarded state.
 * Covers:   A1-10
 * Unhappy:  Inverted by design — the "unhappy" outcome here would be success at
 *           confining, which no requirement in M-A1 asks for.
 */
import { test, expect, beforeAll } from 'bun:test';
import { requireStack, inContainer } from '../lib/stack';

beforeAll(() => requireStack());

test('A1-10 writing outside the workspace is not prevented by this milestone', () => {
  const r = inContainer(
    'openclaw-gateway',
    'f=/tmp/m-a1-outside-workspace; echo x > "$f" && cat "$f" && rm -f "$f"'
  );
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('x');
});

test('A1-10 the workspace is not a mount the agent is locked into', () => {
  const r = inContainer('openclaw-gateway', 'cd / && pwd');
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe('/');
});
