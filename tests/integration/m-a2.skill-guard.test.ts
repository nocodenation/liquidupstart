/**
 * M-A2 · Integration · The skill guard names a missing mount instead of passing
 *
 * Purpose:  If the skills directory ever stops being mounted, the system tests
 *           must say so in a way that points at the cause, rather than failing
 *           with a bare non-zero exit from cat. The case originally asked for
 *           the mount to be removed and the failure observed; a mount cannot be
 *           taken off a running container without recreating it mid-suite, so
 *           this exercises the guard against a path that cannot exist — the same
 *           shape A0-5 uses for the stack guard.
 * Given:    A running stack.
 * When:     requireSkillFile is asked for a path that does not exist.
 * Then:     It throws, naming the path and pointing at the compose mount.
 * Covers:   A2-4
 * Unhappy:  This test is the unhappy path; A2-3 is its positive counterpart.
 */
import { test, expect, beforeAll } from 'bun:test';
import { requireStack, requireSkillFile } from '../lib/stack';

const IMPOSSIBLE = '/home/node/.claude/skills/no-such-skill/SKILL.md';

beforeAll(() => requireStack());

test('A2-4 a missing skill file throws rather than returning empty content', () => {
  expect(() => requireSkillFile('openclaw-gateway', IMPOSSIBLE)).toThrow();
});

test('A2-4 the failure names the path and points at the mount', () => {
  try {
    requireSkillFile('openclaw-gateway', IMPOSSIBLE);
    throw new Error('guard did not throw');
  } catch (e) {
    const msg = (e as Error).message;
    expect(msg).toContain(IMPOSSIBLE);
    expect(msg).toContain('config/agents/skills');
    expect(msg).toContain('openclaw-gateway');
  }
});
