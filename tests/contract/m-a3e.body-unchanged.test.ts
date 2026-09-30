/**
 * M-A3e · Contract · The rest of the body still carries every earlier rule
 *
 * Purpose:  This milestone rewrites one section of a document that now carries
 *           rules from three milestones. A rewrite that fixed the remote section
 *           while thinning the rest — losing the substitute-source rule, the
 *           push etiquette, the identity rule — would satisfy every A3e case
 *           that looks at the new wording and be invisible otherwise. As in
 *           A3d-3, the frontmatter is stripped first: a term that survived only
 *           in the description would still pass the whole-file checks of M-A2
 *           and M-A3b while doing no work where the agent reads it.
 * Given:    config/agents/skills/git/SKILL.md with its frontmatter stripped.
 * When:     The body is searched for each rule M-A2, M-A3b and M-A3d put there.
 * Then:     All of them are present, and the failure names what went missing.
 * Covers:   A3e-6, FR9
 * Unhappy:  Deleting any one rule from the body fails this test by name.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/git/SKILL.md'), 'utf8');
const body = text.slice(text.indexOf('\n---\n', 3) + 5);

const RULES = [
  { rule: 'M-A2: the workspace path', pattern: /\/repos\b/ },
  { rule: 'M-A2: work nowhere else', pattern: /nowhere else|outside `?\/repos/i },
  { rule: 'M-A2: identity is not to be configured', pattern: /git config --global|user\.name/i },
  { rule: 'M-A2: what may be done without asking', pattern: /without asking/i },
  { rule: 'M-A2: the push etiquette', pattern: /ask .{0,40}before .{0,20}push|never push unasked/i },
  { rule: 'M-A2: the force-push prohibition', pattern: /force[- ]push|--force/i },
  { rule: 'M-A2: the protected branch rule', pattern: /\bmain\b/ },
  { rule: 'M-A2: no deleting a remote branch', pattern: /push --delete|delete a remote branch/i },
  { rule: 'M-A2: the secret rule', pattern: /secret|\.env\b/i },
  { rule: 'M-A2: commit messages in English, imperative', pattern: /imperative/i },
  { rule: 'M-A2: report rather than recover destructively', pattern: /reset --hard|clean -fdx/i },
  { rule: 'M-A3b: the SSH URL form', pattern: /git@github\.com:/ },
  { rule: 'M-A3b: the HTTPS failure is quoted literally', pattern: /could not read Username/i },
  { rule: 'M-A3b: an unreachable repository is reported as such', pattern: /cannot reach|could not reach|unreachable/i },
  { rule: 'M-A3b: no answering from a substitute source', pattern: /another source|other source|elsewhere|third[- ]party/i },
  { rule: 'M-A3b: the shapes the substitution took', pattern: /catalogue|catalog|mirror|web page/i },
  { rule: 'M-A3d: the workspace path is in the body as well as the description', pattern: /\/repos\b/ }
];

test('A3e-6 every rule from M-A2, M-A3b and M-A3d is still in the body', () => {
  const missing = RULES.filter((r) => !r.pattern.test(body)).map((r) => r.rule);
  expect(missing).toEqual([]);
});

test('A3e-6 the body is still substantial', () => {
  expect(body.length).toBeGreaterThan(800);
});
