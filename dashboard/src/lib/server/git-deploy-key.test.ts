/**
 * A9-8, A9-9 — the deploy-key instruction names the form and the control.
 *
 * Purpose: an operator is told to add a key "with write access". That describes
 * the intention, not the action. GitHub's form has an **Allow write access**
 * checkbox which is off by default, and a key added without it clones fine and
 * fails on the first push — much later, inside an agent session, where the cause
 * is hard to see. Review points 3 and 4 of #9.
 *
 * The form's address is fixed per repository, so it is computed rather than
 * assembled by the operator from the host and the path they can already see.
 *
 * Given  a declared repository, read and write
 * When   the instruction and the link are built for it
 * Then   the link is that repository's settings/keys/new, and the checkbox is
 *        named for a write declaration and not for a read-only one
 *
 * Test data: host `github.com`, path `nocodenation/liquidupstart`, access
 * `write` and `read` — the shape `GIT_REPOSITORIES` yields.
 *
 * Requirements covered: A9-8, A9-9, review points 3 and 4 of #9.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deployKeyUrl, instructionFor } from './git';

const REPO = { host: 'github.com', path: 'nocodenation/liquidupstart' };

describe('A9-8 the link is computed', () => {
  test('it is the repository own add-key form', () => {
    expect(deployKeyUrl(REPO)).toBe('https://github.com/nocodenation/liquidupstart/settings/keys/new');
  });

  test('and it does not depend on the access kind', () => {
    // The form is the same; what differs is what is ticked on it.
    expect(deployKeyUrl({ ...REPO, access: 'read' } as never)).toBe(deployKeyUrl(REPO));
  });
});

describe('A9-9 the instruction names the control, not the intention', () => {
  test('a write declaration names the checkbox', () => {
    expect(instructionFor({ ...REPO, access: 'write' })).toContain('Allow write access');
  });

  test('and a read-only declaration does not', () => {
    // The negative half: naming a checkbox that must stay unticked would be
    // worse than naming none.
    const text = instructionFor({ ...REPO, access: 'read' });
    expect(text).not.toContain('Allow write access');
    expect(text).toContain('read-only');
  });

  test('and the card renders the link as a link', () => {
    // Read from the component, because a URL an operator has to retype is the
    // thing this replaces.
    const card = readFileSync(
      join(import.meta.dir, '../components/GitRepositories.svelte'),
      'utf8'
    );
    expect(card).toContain('href={repo.deployKeyUrl}');
  });
});
