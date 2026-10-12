/**
 * M-A3e · Contract · The skill points at the command instead of teaching a rule
 *
 * Purpose:  A command nobody knows about answers nothing. The skill has to carry
 *           one instruction — ask — and it has to carry it where a model reads
 *           before deciding to open the file, which A3d-5 showed is the
 *           description. It also has to repurpose the one message the agent does
 *           meet: after M-A3c's scoped insteadOf, "could not read Username" no
 *           longer means the repository is private or gone, it means the stack
 *           was never told about it. And it must stop short of the plan that was
 *           rejected at review — teaching the agent which URL form belongs to
 *           which class of repository, a judgement three failed observations say
 *           it will not make reliably.
 * Given:    config/agents/skills/git/SKILL.md.
 * When:     The description, the body and the paragraph around the credential
 *           message are searched.
 * Then:     The command is named as the way to find out about a repository, the
 *           message is described as the signal that it is undeclared with the
 *           command as the next step, and no repository taxonomy is taught.
 * Covers:   A3e-5, U5, FR9
 * Unhappy:  The negative half is the third test: reinstating "public
 *           repositories are different" fails it by name.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const COMMAND = 'git-repo-info';

const text = readFileSync(join(repoRoot, 'config/agents/skills/git/SKILL.md'), 'utf8');
const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)![1];
const description = frontmatter.match(/^description:\s*(.+)$/m)![1].trim();
const body = text.slice(text.indexOf('\n---\n', 3) + 5);

const around = (needle: string, radius = 500): string => {
  const at = body.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) throw new Error(`the skill body does not contain "${needle}"`);
  return body.slice(Math.max(0, at - radius), at + needle.length + radius);
};

test('A3e-5 the skill names the command as the way to find out about a repository', () => {
  expect(body).toContain(COMMAND);
  expect(around(COMMAND)).toMatch(/declared|find out|ask|whether/i);
});

test('A3e-5 the command is named in the description, where it is read before the file is opened', () => {
  expect(description).toContain(COMMAND);
});

test('A3e-5 the credential message is described as meaning the repository is undeclared', () => {
  const window = around('could not read Username');
  expect(window).toMatch(/not declared|undeclared/i);
  expect(window).toContain(COMMAND);
});

test('A3e-5 the message is no longer explained as the repository being private or missing', () => {
  const window = around('could not read Username');
  expect(window).not.toMatch(/means the repository is (private|missing|gone)/i);
});

test('A3e-5 the skill does not teach a URL taxonomy for the agent to apply', () => {
  const FORBIDDEN = [
    { taxonomy: 'a public/private class of repository the agent must judge', pattern: /\b(public|private) repositor/i },
    { taxonomy: 'HTTPS taught as working for some repositories', pattern: /https[^\n.]{0,40}\bworks?\b/i },
    { taxonomy: 'the agent asked to decide which URL form applies', pattern: /decide[^\n.]{0,60}\burl\b/i }
  ];
  const taught = FORBIDDEN.filter((f) => f.pattern.test(body)).map((f) => f.taxonomy);
  expect(taught).toEqual([]);
});
