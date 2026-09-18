/**
 * M-A3b · System · Both harnesses see the added rules, not just the file on disk
 *
 * Purpose:  The rules are only worth anything where the agent reads them. The
 *           two harnesses mount the same directory at different paths, so each
 *           is checked separately — a single check would pass while one agent
 *           kept the old guidance, which is the state that produced A3-11.
 * Given:    A running stack.
 * When:     The skill is read from inside openclaw-gateway and opencode.
 * Then:     Both carry the URL rule and the source rule, and the two copies are
 *           identical.
 * Covers:   A3b-3, FR9
 * Unhappy:  A missing mount is covered by m-a2.skill-guard.
 */
import { test, expect } from 'bun:test';
import { requireSkillFile, SKILL_PATHS } from '../lib/stack';
import { stackGuard } from '../lib/guard';

stackGuard();

const read = (service: string) =>
  requireSkillFile(service, `${SKILL_PATHS[service]}/git/SKILL.md`);

for (const service of ['openclaw-gateway', 'opencode']) {
  test(`A3b-3 ${service} sees the URL rule and the source rule`, () => {
    const body = read(service);
    expect(body).toContain('git@github.com:');
    expect(body).toMatch(/could not read Username/i);
    expect(body).toMatch(/another source|other source|third[- ]party/i);
  });
}

test('A3b-3 both harnesses see identical content', () => {
  expect(read('openclaw-gateway')).toBe(read('opencode'));
});
