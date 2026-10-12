/**
 * M-A2 · Unit · The git skill carries frontmatter a harness can index
 *
 * Purpose:  A skill is only discoverable if its frontmatter parses and its
 *           description says when to reach for it. A file that reads well but
 *           has malformed frontmatter is invisible to the harness, which fails
 *           silently rather than loudly.
 * Given:    config/agents/skills/git/SKILL.md.
 * When:     Its frontmatter block is read and compared with the sibling skills.
 * Then:     name and description are present, name matches the directory, and
 *           the description carries a clause saying when to use the skill.
 * Covers:   A2-1, FR9
 * Unhappy:  A description without a trigger clause fails the last assertion.
 *
 * Note on the trigger clause: the signed-off case asked for a "TRIGGER clause,
 * matching the sibling skills", but only one of the ten siblings uses that
 * literal word — four say "Use whenever" and five have no such clause at all.
 * Requiring the word verbatim would encode an outlier as the convention, so the
 * assertion accepts either accepted phrasing while the skill itself uses
 * TRIGGER, satisfying the strictest reading too.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const skillPath = join(repoRoot, 'config/agents/skills/git/SKILL.md');
const text = readFileSync(skillPath, 'utf8');
const fm = text.match(/^---\n([\s\S]*?)\n---\n/);

test('A2-1 the file opens with a frontmatter block', () => {
  expect(fm).not.toBeNull();
});

test('A2-1 name and description are declared, and name matches the directory', () => {
  const block = fm![1];
  const name = block.match(/^name:\s*(.+)$/m)?.[1].trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1].trim();
  expect(name).toBe('git');
  expect(description).toBeDefined();
  expect(description!.length).toBeGreaterThan(40);
});

test('A2-1 the description says when to reach for the skill', () => {
  const description = fm![1].match(/^description:\s*(.+)$/m)![1];
  expect(description).toMatch(/TRIGGER|Use when(ever)?/i);
});
