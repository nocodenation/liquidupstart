/**
 * M-A5 · Contract · The skill warns about the stack's own build files
 *
 * Purpose:  An agent editing compose.yml or a Dockerfile in this repository is
 *           editing what builds the container it is running in. A bad commit
 *           that reaches main and is pulled breaks the stack for everyone, and
 *           the agent will not be there to see it. The skill has to say so
 *           where the agent reads it — in the body, not the description — and
 *           name the files rather than gesture at "configuration".
 * Given:    config/agents/skills/git/SKILL.md with its frontmatter stripped.
 * When:     The body section that names compose.yml is located and read.
 * Then:     That one section names compose.yml, the Dockerfiles and .env, says
 *           they build the container the agent runs in, and says a bad commit
 *           on the default branch breaks it for everyone who pulls.
 * Covers:   A5-7, U3, FR9
 * Unhappy:  Dropping any one file name, or the consequence, from that section
 *           fails the test by name. Moving the warning into the description
 *           alone also fails, because only the body is read.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/git/SKILL.md'), 'utf8');
const body = text.slice(text.indexOf('\n---\n', 3) + 5);
const sections = body.split(/\n(?=## )/);
const warning = (sections.find((s) => s.includes('compose.yml')) ?? '').replace(/\s+/g, ' ');

const REQUIRED = [
  { term: 'compose.yml', pattern: /compose\.yml/ },
  { term: 'the Dockerfiles', pattern: /Dockerfile/ },
  { term: '.env', pattern: /\.env\b/ },
  { term: 'the container the agent is running in', pattern: /container (you are|it is|the agent is) running in|the container you run in/i },
  { term: 'a bad commit on the default branch breaks it for everyone who pulls', pattern: /everyone who pulls/i },
  { term: "the stack's own repository", pattern: /stack'?s own repository|repository that builds this stack|liquidupstart/i }
];

test('A5-7 the body has a section about working on the stack\'s own repository', () => {
  expect(warning.length).toBeGreaterThan(200);
});

test('A5-7 that section names the build files and says what breaking them costs', () => {
  const missing = REQUIRED.filter((r) => !r.pattern.test(warning)).map((r) => r.term);
  expect(missing).toEqual([]);
});
