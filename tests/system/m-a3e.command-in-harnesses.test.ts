/**
 * M-A3e · System · The command answers inside both harnesses
 *
 * Purpose:  Same reasoning as every skill-visibility case: what is not reachable
 *           from where the agent stands does not exist. Here the artifact is a
 *           command rather than a document, so two things can go wrong instead
 *           of one — the mount can be missing, or the file can be mounted
 *           somewhere that is not on PATH. Each harness is checked separately,
 *           because a single check would pass while one agent had no command at
 *           all, and the two answers are compared, because an agent's answer must not
 *           depend on which harness it happens to be running in.
 * Given:    A running stack with at least one declared repository in
 *           volumes/_git-secrets/repositories.json.
 * When:     The command is looked up on PATH and run inside openclaw-gateway and
 *           inside opencode, for the declared repository and for one that is not
 *           declared.
 * Then:     It is on PATH in both, answers 0 for the declared repository naming
 *           its clone, exits non-zero for the undeclared one, and both harnesses
 *           give the same answer.
 * Covers:   A3e-7, U5, U8
 * Unhappy:  The undeclared half runs in the containers too — a mount that
 *           reaches only one harness fails by name.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inContainer, AGENT_CONTAINERS } from '../lib/stack';
import { repoRoot } from '../lib/paths';
import { stackGuard } from '../lib/guard';

stackGuard();

const COMMAND = 'git-repo-info';

const manifest = JSON.parse(
  readFileSync(join(repoRoot, 'volumes/_git-secrets/repositories.json'), 'utf8')
);
const declared = manifest.repositories?.[0];
if (!declared) {
  throw new Error(
    'no declared repository in volumes/_git-secrets/repositories.json; ' +
      'declare one in GIT_REPOSITORIES and start the stack before running this case.'
  );
}

for (const service of AGENT_CONTAINERS) {
  test(`A3e-7 ${COMMAND} is on PATH in ${service}`, () => {
    const r = inContainer(service, `command -v ${COMMAND}`);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(`/usr/local/bin/${COMMAND}`);
  });

  test(`A3e-7 ${service} gets the declared repository answered`, () => {
    const r = inContainer(service, `${COMMAND} ${declared.name}`);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(declared.containerClone);
    expect(r.stdout).toContain(declared.access);
    expect(r.stdout).toContain(declared.policy);
  });

  test(`A3e-7 ${service} reports an undeclared repository as undeclared`, () => {
    const r = inContainer(service, `${COMMAND} not-a-declared-repository || echo "EXIT=$?"`);
    expect(r.output).toMatch(/not declared/i);
    expect(r.output).toMatch(/EXIT=[1-9]/);
  });
}

test('A3e-7 both harnesses give the same answer for the same repository', () => {
  const [first, ...rest] = AGENT_CONTAINERS.map(
    (s) => inContainer(s, `${COMMAND} ${declared.name}`).stdout
  );
  for (const other of rest) expect(other).toBe(first);
});

test('A3e-7 the answer names no key material', () => {
  for (const service of AGENT_CONTAINERS) {
    const out = inContainer(service, `${COMMAND} ${declared.name}`).stdout;
    expect(out).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(out).not.toMatch(/ssh-ed25519 AAAA/);
  }
});
