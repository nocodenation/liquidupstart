/**
 * M-B2 · Contract · The restart is named as the operator's, with the reason
 *
 * Purpose:  FR29. A rule without its reason is a rule an agent may reasonably
 *           decide does not apply. "Ask before restarting" invites improvisation;
 *           "it interrupts every running flow" does not — the same lesson the git
 *           skill learned when "a refusal is an answer" had to say why. The
 *           agent's half of U10 is to say what it placed and stop, so the section
 *           has to make stopping the obvious move rather than a restriction.
 * Given:    config/agents/skills/liquid/SKILL.md, frontmatter stripped, §6.4 —
 *           the same section B2-7 reads — and within it the restart step.
 * When:     The text of that step is read.
 * Then:     It says the restart is the operator's to take, that it interrupts
 *           every running flow, and that the agent reports what it placed and
 *           where instead of performing it — and it does not tell the agent to
 *           run the restart itself.
 * Note:     REQUIRED lists phrasings of four properties, not the properties
 *           themselves, which is as close as a test on prose can get. It cost a
 *           false red on 2026-09-05: §6.4 was rewritten to say "ask, and never
 *           take it yourself" and the pattern only knew "ask the operator". The
 *           alternative was added rather than the assertion loosened -- a
 *           pattern that matches anything proves nothing -- but a reader
 *           changing this section should expect to extend the list.
 * Covers:   B2-8, FR29
 * Unhappy:  A section that names the restart without saying whose it is, or
 *           whose it is without saying why, fails by name. B2-9 is the other
 *           side of the same requirement: the stack makes the rule true whether
 *           or not the agent reads it.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/liquid/SKILL.md'), 'utf8');
const body = text.slice(text.indexOf('\n---\n', 3) + 5);
const sections = body.split(/\n(?=### )/);
const section = (sections.find((s) => /^### 6\.4/.test(s)) ?? '').replace(/\s+/g, ' ');

const REQUIRED = [
  { term: "the restart belongs to the operator", pattern: /operator'?s?\b/i },
  { term: 'the agent does not take it', pattern: /do not restart|never restart|not yours to take|ask the operator|never take it yourself/i },
  { term: 'the reason: it interrupts every running flow', pattern: /interrupts every running flow|interrupts all running flows/i },
  { term: 'the agent reports what it placed and where', pattern: /report|say what you placed|name the artifact/i }
];

test('B2-8 the restart step states whose it is and why', () => {
  const missing = REQUIRED.filter((r) => !r.pattern.test(section)).map((r) => r.term);
  expect(missing).toEqual([]);
});

test('B2-8 the section does not instruct the agent to restart Liquid itself', () => {
  expect(section).not.toMatch(/\b(you|then) (should |must )?run `?docker compose restart liquid/i);
  expect(section).not.toMatch(/restart the container:/i);
});
