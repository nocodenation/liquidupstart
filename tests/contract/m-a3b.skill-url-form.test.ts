/**
 * M-A3b · Contract · The skill teaches which URL form actually works here
 *
 * Purpose:  A3-11 failed because an agent reached for an https:// URL, got
 *           "could not read Username", and concluded the repository was private
 *           or restricted. The credentials in this stack are SSH-only, and until
 *           M-A3b nothing said so anywhere the agent would look. This asserts
 *           the words are present. It cannot assert they are followed — that is
 *           A3b-4, and it is manual for the reasons §2 gives.
 * Given:    config/agents/skills/git/SKILL.md.
 * When:     It is searched for the URL rule.
 * Then:     It names the SSH form, names https as the form that fails here, and
 *           explains what the credential prompt actually means.
 * Covers:   A3b-1, FR9, FR6
 * Unhappy:  Removing any of the three fails with that part named.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/git/SKILL.md'), 'utf8');

const REQUIRED = [
  { part: 'the SSH URL form', pattern: /git@github\.com:/ },
  { part: 'https named as the form that fails here', pattern: /https:\/\/github\.com/ },
  { part: 'the meaning of the credential prompt', pattern: /could not read Username/i }
];

test('A3b-1 the skill names the URL form that works and the one that does not', () => {
  const missing = REQUIRED.filter((r) => !r.pattern.test(text)).map((r) => r.part);
  expect(missing).toEqual([]);
});

test('A3b-1 the rules the skill already carried are still there', () => {
  for (const p of [/\/repos\b/, /force[- ]push|--force/i, /\bmain\b/, /secret|\.env\b/i]) {
    expect(text).toMatch(p);
  }
});
