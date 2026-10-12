/**
 * M-A3e · Unit · Name, SSH URL and HTTPS URL give the same answer
 *
 * Purpose:  An agent may hold any of the three forms: a bare name from the
 *           conversation, an SSH URL copied from the skill, an HTTPS URL from a
 *           browser. If the answer depended on which one it happened to have,
 *           the command would reintroduce exactly the URL taxonomy this
 *           milestone exists to remove — and the agent would again be the one
 *           deciding which form is the real repository.
 * Given:    The fixture manifest declaring one repository, expressed three ways.
 * When:     The command is asked with each form in turn.
 * Then:     All three exit 0 and produce byte-identical output.
 * Covers:   A3e-3, U5, NFR2
 * Unhappy:  A form the manifest cannot match falls through to the undeclared
 *           answer of A3e-2; the fourth case here proves an unrelated URL on the
 *           same host is not swept in by a loose match.
 */
import { test, expect } from 'bun:test';
import { askRepoCommand, writeManifest, DECLARED } from '../lib/gitfixture';

const manifest = writeManifest([DECLARED]);

const FORMS = [
  { form: 'bare name', arg: 'agent-skills' },
  { form: 'SSH URL', arg: 'git@github.com:nocodenation/agent-skills.git' },
  { form: 'HTTPS URL', arg: 'https://github.com/nocodenation/agent-skills' }
];

const answers = FORMS.map((f) => ({ ...f, result: askRepoCommand(manifest, [f.arg]) }));

for (const { form, result } of answers) {
  test(`A3e-3 the ${form} is recognised`, () => {
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(DECLARED.containerClone);
  });
}

test('A3e-3 all three forms produce the same answer', () => {
  const [first, ...rest] = answers;
  for (const other of rest) {
    expect(other.result.stdout).toBe(first.result.stdout);
  }
});

test('A3e-3 a different repository on the same host is not matched', () => {
  const other = askRepoCommand(manifest, ['https://github.com/nocodenation/other-skills']);
  expect(other.code).not.toBe(0);
  expect(other.output).toMatch(/not declared/i);
});
