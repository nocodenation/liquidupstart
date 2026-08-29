/**
 * M-A3 · Contract · The secrets and the ssh configuration reach every harness
 *
 * Purpose:  A key that exists on the host but is not mounted, or an ssh command
 *           that does not name it, leaves the harness silently unable to reach a
 *           remote — and the symptom is a permission error far from the cause.
 *           Each of the three agent services is checked separately, because a
 *           single check would pass while one harness stayed unwired.
 * Given:    compose.yml.
 * When:     Each agent service block is inspected.
 * Then:     The secrets directory is mounted, and the ssh command names both the
 *           key and the pre-seeded known_hosts, with checking left on.
 * Covers:   A3-5, FR3, FR4, NFR2
 * Unhappy:  A service missing either is named in the failure.
 */
import { test, expect } from 'bun:test';
import { AGENT_SERVICES, serviceBlock, composeText } from '../lib/compose-file';

test('A3-5 the secrets directory is mounted into every agent service', () => {
  const text = composeText();
  const missing = AGENT_SERVICES.filter(
    (s) => !serviceBlock(s, text).includes('./volumes/_git-secrets:/git-secrets')
  );
  expect(missing).toEqual([]);
});

test('A3-5 every agent service gets an ssh command naming the key and known_hosts', () => {
  const text = composeText();
  const problems: string[] = [];
  for (const s of AGENT_SERVICES) {
    const block = serviceBlock(s, text);
    const line = block.split('\n').find((l) => l.includes('GIT_SSH_COMMAND'));
    if (!line) {
      problems.push(`${s} has no GIT_SSH_COMMAND`);
      continue;
    }
    if (!line.includes('/git-secrets/id_ed25519')) problems.push(`${s} does not name the key`);
    if (!line.includes('/git-secrets/known_hosts')) problems.push(`${s} does not name known_hosts`);
    if (line.includes('StrictHostKeyChecking=no')) problems.push(`${s} disables host key checking`);
  }
  expect(problems).toEqual([]);
});
