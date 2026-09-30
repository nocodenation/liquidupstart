/**
 * M-A2 · System · The skill is readable inside both harnesses
 *
 * Purpose:  A skill that exists on the host but is not mounted into a harness
 *           teaches that harness nothing. The two harnesses mount the same
 *           directory at different paths, so each has to be checked separately —
 *           a single check would pass while one agent stayed uninstructed.
 * Given:    A running stack with config/agents/skills mounted into both.
 * When:     The skill file is read from inside openclaw-gateway and opencode.
 * Then:     Both return the same content, and it is the git skill.
 * Covers:   A2-3, FR9
 * Unhappy:  A missing mount is covered by m-a2.skill-guard, which exercises the
 *           failure message without disturbing the running stack.
 */
import { test, expect, beforeAll } from 'bun:test';
import { requireStack, requireSkillFile, SKILL_PATHS } from '../lib/stack';

beforeAll(() => requireStack());

test('A2-3 openclaw-gateway can read the git skill', () => {
  const body = requireSkillFile('openclaw-gateway', `${SKILL_PATHS['openclaw-gateway']}/git/SKILL.md`);
  expect(body).toContain('name: git');
  expect(body).toContain('/repos');
});

test('A2-3 opencode can read the same skill at its own path', () => {
  const body = requireSkillFile('opencode', `${SKILL_PATHS['opencode']}/git/SKILL.md`);
  expect(body).toContain('name: git');
  expect(body).toContain('/repos');
});

test('A2-3 both harnesses see identical content', () => {
  const a = requireSkillFile('openclaw-gateway', `${SKILL_PATHS['openclaw-gateway']}/git/SKILL.md`);
  const b = requireSkillFile('opencode', `${SKILL_PATHS['opencode']}/git/SKILL.md`);
  expect(a).toBe(b);
});
