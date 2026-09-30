/**
 * M-A3c · Unit · The repository declaration is parsed, and bad entries refused
 *
 * Purpose:  GIT_REPOSITORIES is the only place the stack learns which remotes it
 *           works with, and it is written by hand. A parser that silently drops
 *           an entry, or quietly repairs an https:// URL the stack has no
 *           credentials for, recreates exactly the confusion A3-11 ended in. The
 *           parser is therefore exercised directly, including the shapes that
 *           carry the host-agnostic claim: a nested GitLab-style path and a host
 *           that is not GitHub.
 * Given:    The declaration parser in config/scripts/start/lib/git-repos.sh.
 * When:     It is handed an empty list, one entry, several, stray whitespace,
 *           and then each malformed shape in turn.
 * Then:     Every good entry yields its URL, access and policy; every bad one is
 *           refused with a message naming the entry and what is wrong.
 * Covers:   A3c-2, A3c-3, FR11, NFR2
 * Unhappy:  A3c-3 is the unhappy half — a missing field, an unknown access or
 *           policy word, and an https:// URL, which is rejected rather than
 *           rewritten.
 */
import { test, expect } from 'bun:test';
import { parseDeclaration } from '../lib/gitfixture';

type Row = { name: string; url: string; host: string; path: string; access: string; policy: string; slug: string; dir: string };

function rows(declaration: string): Row[] {
  const r = parseDeclaration(declaration);
  expect(r.stderr).toBe('');
  expect(r.code).toBe(0);
  return r.stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const [name, url, host, path, access, policy, slug, dir] = l.split('\t');
      return { name, url, host, path, access, policy, slug, dir };
    });
}

test('A3c-2 an empty declaration yields no repositories and is not an error', () => {
  expect(rows('')).toEqual([]);
  expect(rows('   ')).toEqual([]);
});

test('A3c-2 a single entry yields its URL, access and policy', () => {
  const [r] = rows('git@github.com:nocodenation/agent-skills.git|read|protected');
  expect(r.name).toBe('agent-skills');
  expect(r.url).toBe('git@github.com:nocodenation/agent-skills.git');
  expect(r.host).toBe('github.com');
  expect(r.path).toBe('nocodenation/agent-skills');
  expect(r.access).toBe('read');
  expect(r.policy).toBe('protected');
});

test('A3c-2 several entries with stray whitespace are all understood', () => {
  const parsed = rows(
    ' git@github.com:nocodenation/agent-skills.git|read|protected ,  ' +
      'git@github.com:nocodenation/liquidupstart.git | write | direct '
  );
  expect(parsed.map((r) => r.name)).toEqual(['agent-skills', 'liquidupstart']);
  expect(parsed.map((r) => r.access)).toEqual(['read', 'write']);
  expect(parsed.map((r) => r.policy)).toEqual(['protected', 'direct']);
});

test('A3c-2 a nested GitLab-style path keeps every segment', () => {
  const [r] = rows('git@gitlab.com:group/subgroup/tooling.git|write|protected');
  expect(r.host).toBe('gitlab.com');
  expect(r.path).toBe('group/subgroup/tooling');
  expect(r.name).toBe('tooling');
});

test('A3c-2 a non-GitHub host is accepted, in both SSH URL forms', () => {
  const [scp] = rows('git@forgejo.example.org:team/flows.git|read|direct');
  expect(scp.host).toBe('forgejo.example.org');
  expect(scp.path).toBe('team/flows');
  const [url] = rows('ssh://git@forgejo.example.org:2222/team/flows.git|read|direct');
  expect(url.host).toBe('forgejo.example.org');
  expect(url.path).toBe('team/flows');
});

const bad = (declaration: string) => parseDeclaration(declaration);

test('A3c-3 an entry with a missing field is refused and named', () => {
  const r = bad('git@github.com:nocodenation/agent-skills.git|read');
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain('git@github.com:nocodenation/agent-skills.git|read');
  expect(r.stderr).toMatch(/<ssh-url>\|<access>\|<policy>/);
});

test('A3c-3 an unknown access word is refused and named', () => {
  const r = bad('git@github.com:nocodenation/agent-skills.git|readonly|protected');
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain('readonly');
  expect(r.stderr).toMatch(/access must be read or write/i);
});

test('A3c-3 an unknown policy word is refused and named', () => {
  const r = bad('git@github.com:nocodenation/agent-skills.git|read|locked');
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain('locked');
  expect(r.stderr).toMatch(/policy must be protected or direct/i);
});

test('A3c-3 an https URL is refused as SSH-only, not rewritten', () => {
  const entry = 'https://github.com/nocodenation/agent-skills.git|read|protected';
  const r = bad(entry);
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain('https://github.com/nocodenation/agent-skills.git');
  expect(r.stderr).toMatch(/SSH-only/i);
  expect(r.stdout).toBe('');
});

test('A3c-3 a URL that is neither form is refused and named', () => {
  const r = bad('nocodenation/agent-skills|read|protected');
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain('nocodenation/agent-skills');
  expect(r.stderr).toMatch(/not an SSH URL/i);
});
