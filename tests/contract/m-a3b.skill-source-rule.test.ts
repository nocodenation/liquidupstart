/**
 * M-A3b · Contract · The skill forbids answering from a substitute source
 *
 * Purpose:  The worse half of the A3-11 failure was not the failed clone. It was
 *           that the agent, unable to read a private repository, answered about
 *           it anyway from third-party web pages, without saying it had changed
 *           sources — and the answer was incomplete. A rule that only said "use
 *           SSH URLs" would leave that behaviour intact the next time a
 *           repository is genuinely unreachable.
 * Given:    config/agents/skills/git/SKILL.md.
 * When:     It is searched for the source rule.
 * Then:     It requires saying a repository could not be reached, and forbids
 *           describing it from elsewhere without declaring the substitution.
 * Covers:   A3b-2, FR9
 * Unhappy:  A skill carrying only the URL rule fails this test, which is exactly
 *           the half-fix worth guarding against.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/git/SKILL.md'), 'utf8');

test('A3b-2 an unreachable repository must be reported as unreachable', () => {
  expect(text).toMatch(/cannot reach|could not reach|unreachable/i);
  expect(text).toMatch(/say so|report/i);
});

test('A3b-2 describing a repository from another source is forbidden without saying so', () => {
  expect(text).toMatch(/another source|other source|elsewhere|third[- ]party/i);
  expect(text).toMatch(/never|do not|don't/i);
});

test('A3b-2 the rule names the shapes the substitution actually took', () => {
  const shapes = [/web page|website/i, /catalogue|catalog/i, /mirror/i];
  const named = shapes.filter((s) => s.test(text)).length;
  expect(named).toBeGreaterThanOrEqual(2);
});
