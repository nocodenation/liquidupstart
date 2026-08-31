/**
 * M-A3c · Component · The repository list is declared where the dashboard reads it
 *
 * Purpose:  GIT_REPOSITORIES is the whole configuration surface of this
 *           milestone. .env.example is not documentation but the schema the
 *           dashboard renders its form from, so a key that reads well and does
 *           not parse never appears in the UI and nobody can declare a
 *           repository without editing a file by hand. This runs the real parser
 *           over the real file, as A1-1 does for the identity keys.
 * Given:    .env.example with section 10.
 * When:     parseExample and listFields are applied to it.
 * Then:     GIT_REPOSITORIES is listed in that section, carries help text, and
 *           the section is still shown in the dashboard.
 * Covers:   A3c-1, FR10, FR11
 * Unhappy:  A key added outside the section, or without help text, fails here.
 */
import { test, expect } from 'bun:test';
import { parseExample, listFields } from '../../dashboard/src/lib/env-file';
import { sectionModeFromTitle } from '../../dashboard/src/lib/env-meta';
import { envExampleText } from '../lib/compose-file';

const sections = parseExample(envExampleText());
const git = sections.find((s) => /GIT INTEGRATION/i.test(s.title));
const fields = listFields(sections).filter((f) => /GIT INTEGRATION/i.test(f.section.title));

test('A3c-1 GIT_REPOSITORIES is a field of the git section', () => {
  expect(git).toBeDefined();
  expect(fields.map((f) => f.field.key)).toContain('GIT_REPOSITORIES');
});

test('A3c-1 the field carries help text explaining the entry format', () => {
  const field = fields.find((f) => f.field.key === 'GIT_REPOSITORIES')!.field;
  const help = field.help.join(' ');
  expect(help.trim().length).toBeGreaterThan(0);
  expect(help).toMatch(/read/);
  expect(help).toMatch(/write/);
  expect(help).toMatch(/protected/);
  expect(help).toMatch(/direct/);
  expect(help).toMatch(/git@/);
});

test('A3c-1 the section stays visible in the dashboard', () => {
  expect(sectionModeFromTitle(git!.title).mode).toBe('normal');
  expect(git!.mode).toBe('normal');
});
