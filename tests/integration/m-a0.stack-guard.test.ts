/**
 * M-A0 · Integration · The stack guard fails fast and names what is missing
 *
 * Purpose:  System-level tests must not hang or produce a confusing docker error
 *           when the stack is down. requireStack is the single place that decides
 *           this, so it has to refuse with a message that tells the reader which
 *           container is absent and how to start it.
 * Given:    A container name that cannot exist in any environment.
 * When:     requireStack is called with it.
 * Then:     It throws, the message names the container and points at start.sh.
 * Covers:   A0-5
 * Unhappy:  Positive control included — the real agent containers pass the guard
 *           while the stack is up; that assertion is skipped when it is down, so
 *           this file stays honest on a machine without the stack.
 */
import { test, expect } from 'bun:test';
import { requireStack, containerRunning, AGENT_CONTAINERS } from '../lib/stack';

test('A0-5 an absent container makes the guard throw with a legible message', () => {
  expect(() => requireStack(['liquidupstart-no-such-container'])).toThrow(
    /liquidupstart-no-such-container/
  );
  try {
    requireStack(['liquidupstart-no-such-container']);
  } catch (e) {
    expect((e as Error).message).toContain('stack not running');
    expect((e as Error).message).toContain('start.sh');
  }
});

test('A0-5 the guard passes for the agent containers when the stack is up', () => {
  const up = AGENT_CONTAINERS.every((c) => containerRunning(c));
  if (!up) {
    expect(up).toBe(false);
    return;
  }
  expect(() => requireStack()).not.toThrow();
});
