/**
 * M-A3d · System · Both harnesses see the new description
 *
 * Purpose:  The description only does its work where the agent reads it. The
 *           two harnesses mount the same directory at different paths, so each
 *           is read separately — a single check would pass while one agent kept
 *           the old catalogue entry, which is the state the three failed manual
 *           observations happened under.
 * Given:    A running stack.
 * When:     The git skill is read from inside openclaw-gateway and opencode and
 *           its description line taken from each.
 * Then:     Both carry the read-side occasions and the workspace path, and the
 *           two descriptions are identical.
 * Covers:   A3d-4, FR9
 * Unhappy:  A missing mount is covered by m-a2.skill-guard; stopping either
 *           container fails this file at the guard.
 */
import { test, expect } from 'bun:test';
import { requireSkillFile, SKILL_PATHS } from '../lib/stack';
import { stackGuard } from '../lib/guard';

stackGuard();

const descriptionIn = (service: string): string => {
  const file = requireSkillFile(service, `${SKILL_PATHS[service]}/git/SKILL.md`);
  const frontmatter = file.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) throw new Error(`no frontmatter in the git skill as seen by ${service}`);
  const description = frontmatter[1].match(/^description:\s*(.+)$/m);
  if (!description) throw new Error(`no description in the git skill as seen by ${service}`);
  return description[1].trim();
};

for (const service of ['openclaw-gateway', 'opencode']) {
  test(`A3d-4 ${service} sees the read-side occasions and the workspace path`, () => {
    const description = descriptionIn(service);
    expect(description).toMatch(/\bclon(e|es|ing)\b/i);
    expect(description).toMatch(/\bfetch(ing)?\b/i);
    expect(description).toMatch(/contain|look(ing)?\s+(inside|in|at)/i);
    expect(description).toMatch(/\/repos\b/);
  });
}

test('A3d-4 both harnesses see an identical description', () => {
  expect(descriptionIn('openclaw-gateway')).toBe(descriptionIn('opencode'));
});
