/**
 * M-A2 · Contract · The skill still contains its load-bearing terms
 *
 * Purpose:  This is a presence check and nothing more. It asserts that the terms
 *           the milestone exists to teach are still literally in the file, so
 *           that thinning the skill out — dropping the push etiquette, losing
 *           the workspace path in a rewrite — fails visibly. It makes no
 *           judgement about whether the rules are good, complete or well
 *           expressed, and it cannot: only a reader can decide that. Reading it
 *           as "the rules are verified" would be a mistake.
 * Given:    config/agents/skills/git/SKILL.md.
 * When:     The file is searched for each load-bearing term.
 * Then:     The workspace path, each forbidden operation and the push etiquette
 *           are present, and the failure names the term that went missing.
 * Covers:   A2-2, FR9, FR7
 * Unhappy:  Removing any one term fails this test with that term named.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/git/SKILL.md'), 'utf8');

const REQUIRED = [
  { term: 'the workspace path', pattern: /\/repos\b/ },
  { term: 'the force-push prohibition', pattern: /force[- ]push|--force/i },
  { term: 'the protected branch rule', pattern: /\bmain\b/ },
  { term: 'the secret rule', pattern: /secret|\.env\b/i },
  { term: 'the push etiquette', pattern: /ask .{0,40}before .{0,20}push|never push unasked/i }
];

test('A2-2 every load-bearing term is still present in the skill', () => {
  const missing = REQUIRED.filter((r) => !r.pattern.test(text)).map((r) => r.term);
  expect(missing).toEqual([]);
});

test('A2-2 the skill is substantial enough to carry those rules', () => {
  expect(text.length).toBeGreaterThan(800);
});
