/**
 * M-A8 · Component · The operator declares a repository in the configuration view
 *
 * Purpose:  Twenty case blocks name U1 and every one of them exercises a parser
 *           or the start script; the operator's own step — type a repository
 *           into the view, save, see it take effect — has never been run in
 *           either direction. A1-2 is titled "the section is shown in the
 *           dashboard" and asserts a function applied to a title string, which
 *           cannot see whether the view renders the fields at all. And the save
 *           does not edit .env: it re-renders the whole file from .env.example
 *           plus what it decided to keep, so every key of an installation passes
 *           through it and one dropped key destroys a working installation.
 * Given:    A fixture project holding the repository's own .env.example and a
 *           fully populated .env — every key filled, one of them quoted, plus
 *           OPERATOR_NOTE, which exists in .env and not in .env.example.
 * When:     The configuration view's load and save actions are invoked against
 *           it, changing only GIT_REPOSITORIES.
 * Then:     Section 10 is offered with all three fields and their help; the
 *           declaration reaches .env in the form git-repos.sh parses and comes
 *           back on the next load; and every other key keeps its exact line.
 * Covers:   A8-1, A8-2, A8-3, FR10, FR11, NFR1, U1
 * Unhappy:  A8-3 is the unhappy case: it is the operator's own act that triggers
 *           the loss, so the assertion is over the whole file rather than over
 *           the field that was changed.
 */
import { test, expect, beforeEach } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  configSections,
  fieldsOf,
  projectDir,
  saveConfig,
  sectionTitled,
  submittedForm
} from '../lib/dashboardfixture';
import { envFrom, fixtureValue, rawLines, resetProject, writeEnv } from '../lib/gitproject';
import { parseDeclaration } from '../lib/gitfixture';

const QUOTED_KEY = 'LIQUID_PASSWORD';
const QUOTED_VALUE = 'a quoted fixture value';
const CUSTOM_LINE = 'OPERATOR_NOTE=kept-by-hand';
const DECLARATION = 'git@github.com:example/one.git|read|protected';
const ENV_FILE = join(projectDir, '.env');

function installedEnv(): string {
  return envFrom((key) => (key === QUOTED_KEY ? QUOTED_VALUE : fixtureValue(key)), [CUSTOM_LINE]);
}

beforeEach(() => {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  writeEnv(projectDir, installedEnv());
});

test('A8-1 the view offers section 10 with all three git fields', () => {
  const git = sectionTitled('GIT INTEGRATION');

  expect(git.title).toBe('10. GIT INTEGRATION');
  expect(git.autogen).toBe(false);
  expect(git.collapsed).toBe(false);
  expect(git.description).toContain('./volumes/repos');

  const fields = fieldsOf(git);
  expect(fields.map((f) => f.key)).toEqual([
    'GIT_USER_NAME',
    'GIT_USER_EMAIL',
    'GIT_REPOSITORIES'
  ]);
  for (const field of fields) {
    expect(field.type).toBe('text');
    expect(field.help.join(' ').trim().length).toBeGreaterThan(0);
  }
});

test('A8-1 each field carries the help text .env.example gives it', () => {
  const help = Object.fromEntries(
    fieldsOf(sectionTitled('GIT INTEGRATION')).map((f) => [f.key, f.help.join(' ')])
  );

  expect(help.GIT_USER_NAME).toContain('Name shown as the author of commits the agents create');
  expect(help.GIT_USER_EMAIL).toContain('Email address recorded alongside the name above');
  expect(help.GIT_REPOSITORIES).toContain('the dashboard shows you each key');
  expect(help.GIT_REPOSITORIES).toContain('https:// are refused');
});

test('A8-1 the section survives the whole view, not just the parser', () => {
  const titles = configSections().map((s) => s.title);
  expect(titles).toContain('10. GIT INTEGRATION');
});

test('A8-2 a declaration typed into the view reaches .env in the form git-repos.sh parses', async () => {
  const redirect = await saveConfig(submittedForm({ GIT_REPOSITORIES: DECLARATION }));
  expect(redirect.status).toBe(303);

  const line = rawLines(readFileSync(ENV_FILE, 'utf8')).get('GIT_REPOSITORIES');
  expect(line).toBe(`GIT_REPOSITORIES="${DECLARATION}"`);

  const parsed = parseDeclaration(DECLARATION);
  expect(parsed.code).toBe(0);
  expect(parsed.stdout.trim().split('\t').slice(0, 6)).toEqual([
    'one',
    'git@github.com:example/one.git',
    'github.com',
    'example/one',
    'read',
    'protected'
  ]);
});

test('A8-2 and the next visit shows it back', async () => {
  await saveConfig(submittedForm({ GIT_REPOSITORIES: DECLARATION }));

  const field = fieldsOf(sectionTitled('GIT INTEGRATION')).find(
    (f) => f.key === 'GIT_REPOSITORIES'
  );
  expect(field?.value).toBe(DECLARATION);
});

test('A8-3 the save loses no other key, and keeps its quoting', async () => {
  const before = readFileSync(ENV_FILE, 'utf8');
  const beforeLines = rawLines(before);
  expect(beforeLines.get(QUOTED_KEY)).toBe(`${QUOTED_KEY}="${QUOTED_VALUE}"`);
  expect(beforeLines.has('DATABASE_PASSWORD')).toBe(true);

  await saveConfig(submittedForm({ GIT_REPOSITORIES: DECLARATION }));

  const afterLines = rawLines(readFileSync(ENV_FILE, 'utf8'));
  for (const [key, line] of beforeLines) {
    if (key === 'GIT_REPOSITORIES') continue;
    expect(`${key}: ${afterLines.get(key)}`).toBe(`${key}: ${line}`);
  }
  expect([...afterLines.keys()].sort()).toEqual([...beforeLines.keys()].sort());
  expect(afterLines.get('GIT_REPOSITORIES')).toBe(`GIT_REPOSITORIES="${DECLARATION}"`);
});

test('A8-3 the .env-only key is still there verbatim', async () => {
  await saveConfig(submittedForm({ GIT_REPOSITORIES: DECLARATION }));

  const after = readFileSync(ENV_FILE, 'utf8');
  expect(after.split(/\r?\n/)).toContain(CUSTOM_LINE);
});

test('A8-3 the write replaces the file rather than rewriting it in place', async () => {
  const before = statSync(ENV_FILE).ino;

  await saveConfig(submittedForm({ GIT_REPOSITORIES: DECLARATION }));

  expect(statSync(ENV_FILE).ino).not.toBe(before);
  expect(existsSync(`${ENV_FILE}.tmp`)).toBe(false);
});
