/**
 * M-A3d · Contract · The catalogue entry names read-side occasions and the workspace
 *
 * Purpose:  Three manual observations failed the same way: the git skill held
 *           the answer and was never opened, because its trigger enumerated
 *           domain verbs — version, commit, branch — while nobody asks an agent
 *           to *version* something. They ask what is in a repository. This
 *           checks the description now names the read side in the vocabulary a
 *           user actually uses, without dropping the versioning occasions it
 *           already carried, and that it states the workspace path itself so
 *           the catalogue entry locates `/repos` even when the skill is never
 *           opened.
 * Given:    The frontmatter of config/agents/skills/git/SKILL.md.
 * When:     The description line alone is searched — the body is deliberately
 *           excluded, because a description is what the model reads in order to
 *           decide whether to open the skill at all.
 * Then:     It names fetching, cloning and looking inside a repository, still
 *           names versioning, committing and branching, and contains `/repos`.
 * Covers:   A3d-1, A3d-2, FR9
 * Unhappy:  A description that gains the read-side wording but leaves the
 *           workspace path in the body only fails A3d-2 — the half-fix this
 *           milestone was explicitly written to prevent.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/git/SKILL.md'), 'utf8');
const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)![1];
const description = frontmatter.match(/^description:\s*(.+)$/m)![1].trim();

const READ_SIDE = [
  { occasion: 'fetching a repository', pattern: /\bfetch(ing|es|ed)?\b/i },
  { occasion: 'cloning a repository', pattern: /\bclon(e|es|ing|ed)\b/i },
  {
    occasion: 'looking inside a repository / asking what it contains',
    pattern: /look(ing)?\s+(inside|in|at)|what\b[^.]{0,40}\b(contain|in the|is in|are in)|contain(s|ed)?\b/i
  }
];

const VERSIONING = [
  { occasion: 'versioning', pattern: /\bversion(ing|s|ed)?\b|version control/i },
  { occasion: 'committing', pattern: /\bcommit(s|ting|ted)?\b/i },
  { occasion: 'branching', pattern: /\bbranch(es|ing|ed)?\b/i }
];

test('A3d-1 the description names the read-side occasions', () => {
  const missing = READ_SIDE.filter((o) => !o.pattern.test(description)).map((o) => o.occasion);
  expect(missing).toEqual([]);
});

test('A3d-1 the versioning occasions it already carried are still there', () => {
  const missing = VERSIONING.filter((o) => !o.pattern.test(description)).map((o) => o.occasion);
  expect(missing).toEqual([]);
});

test('A3d-1 the description still says when to reach for the skill', () => {
  expect(description).toMatch(/TRIGGER|Use when(ever)?/i);
});

test('A3d-2 the workspace path is in the description itself', () => {
  expect(description).toMatch(/\/repos\b/);
});

test('A3d-2 the path is not only in the body', () => {
  const body = text.slice(text.indexOf('\n---\n', 3) + 5);
  expect(body).toMatch(/\/repos\b/);
  expect(description).toMatch(/\/repos\b/);
});
