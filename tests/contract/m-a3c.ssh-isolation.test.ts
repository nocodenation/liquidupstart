/**
 * M-A3c · Contract · The clone cannot borrow the operator's own SSH identity
 *
 * Purpose:  The start script clones on the host, where an ssh-agent and a
 *           ~/.ssh/config usually exist. Without isolation ssh offers the
 *           operator's personal key and GitHub accepts it, so a repository whose
 *           deploy key was never registered still clones — and the whole
 *           per-repository key mechanism is bypassed without anyone noticing.
 *           Observed on 2026-08-31: agent-skills cloned successfully while its
 *           deploy key was unregistered, authenticated as the operator, and
 *           `IdentitiesOnly=yes` alone did not prevent it because the agent's key
 *           counts as a configured identity.
 *
 *           This also hides a dependency: the clone works on the operator's
 *           machine and fails on any other, for reasons nobody can see.
 * Given:    config/scripts/start/git.sh and the clones it configures.
 * When:     Both ssh invocations are inspected.
 * Then:     Each ignores the ssh configuration file and the agent, so only the
 *           repository's own key can authenticate, while still pointing at a
 *           pre-seeded known_hosts — isolation must not cost host verification.
 *           The known_hosts path is asserted by its option rather than its
 *           filename, because the two invocations reach it through different
 *           variables.
 * Covers:   A3c-8, FR3, NFR1
 * Unhappy:  Cannot be asserted behaviourally — whether a personal key exists is
 *           a property of the machine running the suite, not of the code. The
 *           flags are the observable part.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const script = readFileSync(join(repoRoot, 'config/scripts/start/git.sh'), 'utf8');
const sshLines = script
  .split('\n')
  .filter((l) => l.includes('ssh -') && l.includes('IdentitiesOnly'));

test('A3c-8 both ssh invocations are present', () => {
  expect(sshLines.length).toBe(2);
});

test('A3c-8 neither can fall back to the operator ssh config or agent', () => {
  const missing: string[] = [];
  for (const line of sshLines) {
    if (!line.includes('-F /dev/null')) missing.push(`no -F /dev/null in: ${line.trim().slice(0, 60)}`);
    if (!line.includes('IdentityAgent=none')) missing.push(`no IdentityAgent=none in: ${line.trim().slice(0, 60)}`);
  }
  expect(missing).toEqual([]);
});

test('A3c-8 host key checking survives the isolation', () => {
  for (const line of sshLines) {
    expect(line).toContain('StrictHostKeyChecking=yes');
    expect(line).toContain('UserKnownHostsFile=');
  }
});
