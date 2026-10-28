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
 *           OPERATOR_NOTE, which exists in .env and not in .env.example; and,
 *           for A8-38, the sources under dashboard/src, read as text.
 * When:     The configuration view's load and save actions are invoked against
 *           it, changing only GIT_REPOSITORIES; and the titles, the prose and
 *           the sources are read for section numbers.
 * Then:     The git section is offered with all three fields and their help; the
 *           declaration reaches .env in the form git-repos.sh parses and comes
 *           back on the next load; and every other key keeps its exact line. The
 *           sections the view shows are numbered 1 to 10 and keep their names;
 *           no prose the view shows and no hint in the sources names a section by
 *           number; and .env.example keeps `# 4. …DO NOT SHOW UI` and
 *           `# 7. PRIVACY PROXY` as written.
 * Covers:   A8-1, A8-2, A8-3, A8-38, FR10, FR11, NFR1, U1
 * Unhappy:  A8-3 is the unhappy case: it is the operator's own act that triggers
 *           the loss, so the assertion is over the whole file rather than over
 *           the field that was changed. A8-38's negative is a numbering with a
 *           gap: `.env.example` numbers its hidden section 4 too, and the view
 *           showed 3 and then 5 (#51). With the view numbering what it shows, a
 *           help text or a hint naming "section 5" would point at the wrong one,
 *           so none names a section by number. Its counterparts: the sections
 *           keep their names, and the file keeps its own numbers, which
 *           privacy-proxy's contract test reads: it finds the line
 *           `# 7. PRIVACY PROXY` by its exact text. The pattern for a reference
 *           by number is itself checked on both sides: it finds `section 5`,
 *           `section #7`, `sec. 7` and `§7`, and passes a section named by title
 *           and a number that is no section.
 */
import { test, expect, beforeEach } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
import { repoRoot } from '../lib/paths';
import { SECTION_BY_NUMBER } from '../lib/sections';

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

test('A8-1 the view offers the git section with all three git fields', () => {
  const git = sectionTitled('GIT INTEGRATION');

  // The tenth section the page shows; `.env.example` calls it 11, counting the
  // hidden section 4. The page numbers what it shows since 2026-10-27, A8-38.
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

test('A8-38 the view numbers the sections it shows 1 to 10, without a gap', () => {
  const numbers = configSections().map((s) => Number(s.title.match(/^(\d+)\./)?.[1]));
  expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('A8-38 and keeps each section\'s name as the file gives it', () => {
  const names = (titles: string[]) => titles.map((t) => t.replace(/^\d+\.\s*/, ''));
  const shown = configSections().map((s) => s.title);
  expect(names(shown)).toContain('GIT INTEGRATION');
  expect(names(shown)).toContain('PRIVACY PROXY');
  // A hidden section's marker is cut from its title like any other, so its name is
  // what would show: the three the file hides are its 4, TEST HOOKS and
  // DEVELOPER OPTIONS, and the first shares its name with sections 2 and 3.
  expect(names(shown).filter((n) => n === 'SERVICE SECRETS & CREDENTIALS')).toHaveLength(2);
  expect(names(shown)).not.toContain('TEST HOOKS');
  expect(names(shown)).not.toContain('DEVELOPER OPTIONS');
});

// The prose the view shows: descriptions, paragraphs, help, subheadings and groups.
function prose(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(prose);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      ['description', 'lines', 'help', 'text', 'title', 'items'].includes(k) ? prose(v) : []
    );
  }
  return [];
}

test('A8-38 the pattern finds a section named by number in each form it is written', () => {
  const forms = ['the keys from section 5', 'Section 10', 'sections 5 and 6', '(section #7)', 'sec. 7', '§7', '§ 7'];
  expect(forms.filter((t) => !SECTION_BY_NUMBER.test(t))).toEqual([]);
});

test('A8-38 the counterpart: a section named by title, or a number that is no section, passes', () => {
  const prose = ['under LLM provider API keys', 'the section below', 'this section', 'every 5 seconds', 'sections of the file', 'v2 of the API'];
  expect(prose.filter((t) => SECTION_BY_NUMBER.test(t))).toEqual([]);
});

test('A8-38 the help the view shows names no section by number', () => {
  // It said "the keys from section 5" and "(section 6)": the file's numbers, which
  // the view's numbering no longer matches from section 5 on.
  const shown = configSections().flatMap((s) => prose([s.description, s.items]));
  expect(shown.length).toBeGreaterThan(50);
  expect(shown.filter((t) => SECTION_BY_NUMBER.test(t))).toEqual([]);
});

test('A8-38 and no hint the dashboard writes names one by number', () => {
  // The repositories card said "section 10" and the privacy tile "section 7".
  const dir = join(repoRoot, 'dashboard', 'src');
  const sources = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|js|svelte|html)$/.test(f) && !/\.test\.[jt]s$/.test(f));
  // Comments are no hint: HTML comments everywhere, and the comment lines of a
  // script, which in markup would be text and are left in.
  const comment = (f: string) => (/\.[jt]s$/.test(f) ? /^\s*(\/\/|\*|\/\*)/ : /^\s*\/\//);
  const named = sources.flatMap((f) =>
    readFileSync(join(dir, f), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .split('\n')
      .filter((l) => !comment(f).test(l) && SECTION_BY_NUMBER.test(l))
      .map((l) => `${f}: ${l.trim()}`)
  );
  expect(sources.length).toBeGreaterThan(20);
  expect(named).toEqual([]);
});

test('A8-38 the counterpart: the file keeps its own numbers, which another repository reads', () => {
  const example = readFileSync(join(projectDir, '.env.example'), 'utf8');
  expect(example).toMatch(/^# 4\. SERVICE SECRETS & CREDENTIALS - SCRIPTS GENERATE IT - DO NOT SHOW UI$/m);
  expect(example).toMatch(/^# 7\. PRIVACY PROXY$/m);
});
