/**
 * M-A3d · Contract · The skill body still carries every earlier rule
 *
 * Purpose:  This milestone touches the description and nothing else. A rewrite
 *           that improved the catalogue entry while thinning the body — losing
 *           the SSH URL form, the substitute-source rule, the push etiquette —
 *           would pass A3d-1 and A3d-2 and be invisible. The M-A2 and M-A3b
 *           suites read the whole file, so a term that moved into the
 *           description would still satisfy them; this case reads the body
 *           alone, which is the only place those rules do any work.
 * Given:    config/agents/skills/git/SKILL.md with its frontmatter stripped.
 * When:     The body is searched for each rule M-A2 and M-A3b put there.
 * Then:     All of them are present, and the failure names what went missing.
 * Covers:   A3d-3, FR9, FR7
 * Unhappy:  Deleting any one rule from the body fails this test by name, even
 *           if the same word survives in the description.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/git/SKILL.md'), 'utf8');
const body = text.slice(text.indexOf('\n---\n', 3) + 5);

const RULES = [
  { rule: 'M-A2: the workspace path', pattern: /\/repos\b/ },
  { rule: 'M-A2: the force-push prohibition', pattern: /force[- ]push|--force/i },
  { rule: 'M-A2: the protected branch rule', pattern: /\bmain\b/ },
  { rule: 'M-A2: the secret rule', pattern: /secret|\.env\b/i },
  { rule: 'M-A2: the push etiquette', pattern: /ask .{0,40}before .{0,20}push|never push unasked/i },
  { rule: 'M-A2: identity is not to be configured', pattern: /git config --global|user\.name/i },
  { rule: 'M-A3b: the SSH URL form', pattern: /git@github\.com:/ },
  { rule: 'M-A3b: the HTTPS failure is quoted literally', pattern: /could not read Username/i },
  { rule: 'M-A3b: an unreachable repository is reported as such', pattern: /cannot reach|could not reach|unreachable/i },
  { rule: 'M-A3b: no answering from a substitute source', pattern: /another source|other source|elsewhere|third[- ]party/i },
  { rule: 'M-A3b: the shapes the substitution took', pattern: /catalogue|catalog|mirror|web page/i }
];

test('A3d-3 every rule from M-A2 and M-A3b is still in the body', () => {
  const missing = RULES.filter((r) => !r.pattern.test(body)).map((r) => r.rule);
  expect(missing).toEqual([]);
});

test('A3d-3 the body is still substantial', () => {
  expect(body.length).toBeGreaterThan(800);
});
