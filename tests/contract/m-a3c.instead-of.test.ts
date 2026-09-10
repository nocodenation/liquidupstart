/**
 * M-A3c · Contract · The URL rewrites are scoped to one repository each
 *
 * Purpose:  Forcing the SSH URL form through git configuration is only safe
 *           while it is scoped. A global rewrite of https://github.com/ would
 *           reach every public repository as well, and every one of those would
 *           then need a key the stack has no reason to hold — turning "clone a
 *           public repository" from something that works into a permission
 *           error. So each declared repository gets its own rewrite, written
 *           into its own clone, and nothing writes a global one.
 * Given:    A fixture project declaring two repositories, cloned through the
 *           start script against local seed repositories.
 * When:     Each clone's own .git/config is read, and the repository is searched
 *           for a global rewrite.
 * Then:     Each clone carries exactly one insteadOf, naming its own remote, and
 *           no global rewrite exists anywhere in the tree.
 * Covers:   A3c-11, FR11, FR12, NFR2
 * Unhappy:  A rewrite written to the user's global git configuration, or a
 *           second unrelated rewrite in a clone, fails here.
 */
import { test, expect, afterAll } from 'bun:test';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh, runStart, manifest } from '../lib/gitfixture';
import { repoRoot } from '../lib/paths';

const work = tempProject('lu-a3c-insteadof-');
const project = join(work, 'project');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const skills = seedRepo(work, 'agent-skills');
const tooling = seedRepo(work, 'tooling');
const bin = fakeSsh(work, [
  { match: 'agent-skills', bare: skills },
  { match: 'tooling', bare: tooling }
]);
seedKnownHosts(project);

const DECLARATION =
  'git@github.com:nocodenation/agent-skills.git|read|protected,' +
  'git@gitlab.com:group/subgroup/tooling.git|write|direct';

const started = runStart(project, DECLARATION, { pathPrefix: bin });
const entries = () => manifest(project).repositories as Array<Record<string, string>>;

test('A3c-11 the start produced both clones', () => {
  expect(started.code).toBe(0);
  expect(entries().map((e) => e.cloned)).toEqual([true as any, true as any]);
});

test('A3c-11 each clone carries exactly one rewrite, naming its own remote', () => {
  for (const entry of entries()) {
    const config = readFileSync(join(project, entry.clonePath, '.git', 'config'), 'utf8');
    const rewrites = config.split('\n').filter((l) => l.includes('insteadOf'));
    expect(rewrites.length).toBe(1);
    expect(config).toContain(`[url "${entry.url}"]`);
    expect(rewrites[0]).toContain(entry.path);
  }
});

test('A3c-11 the rewrite maps this repository https URL onto its SSH URL', () => {
  for (const entry of entries()) {
    const config = readFileSync(join(project, entry.clonePath, '.git', 'config'), 'utf8');
    expect(config).toContain(`insteadOf = https://${entry.host}/${entry.path}`);
  }
});

test('A3c-11 no global rewrite of a whole host exists anywhere in the tree', () => {
  const r = sh(
    ['grep', '-rn', '--exclude-dir=.git', '--exclude-dir=node_modules', '--exclude-dir=volumes',
     'insteadOf', 'compose.yml', 'config', 'scripts', 'dashboard/src'],
    repoRoot
  );
  const global = r.stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .filter((l) => /url\s*\.?\s*"?https:\/\/[a-z.]+\/?"?\s*\.insteadOf|--global/.test(l));
  expect(global).toEqual([]);
  expect(r.stdout).not.toMatch(/https:\/\/github\.com\/"\.insteadOf/);
});
