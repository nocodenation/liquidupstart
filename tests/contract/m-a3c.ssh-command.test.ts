/**
 * M-A3c · Contract · No stack-wide key any more, and the policy still stands
 *
 * Purpose:  M-A3 named one key in GIT_SSH_COMMAND for every remote in the stack,
 *           which is why the stack could reach exactly one private repository.
 *           The identity moves into each clone; what must not move is the rest
 *           of that command. The pre-seeded known_hosts, StrictHostKeyChecking
 *           and the timeouts are stack-wide policy and M-A3's system cases rest
 *           on them, so a change that dropped them would pass this milestone and
 *           silently undo the previous one.
 * Given:    compose.yml.
 * When:     The GIT_SSH_COMMAND of each agent service is inspected.
 * Then:     No single key is named for all remotes, the command defers to the
 *           identity the clone declares, and the host-key policy and the
 *           timeouts are unchanged.
 * Covers:   A3c-5, FR3, FR4, NFR2
 * Unhappy:  A command that relaxed host key checking, or dropped a timeout while
 *           removing the key, fails here and names the service.
 */
import { test, expect } from 'bun:test';
import { AGENT_SERVICES, serviceBlock, composeText } from '../lib/compose-file';

const sshLines = () => {
  const text = composeText();
  return AGENT_SERVICES.map((service) => {
    const line = serviceBlock(service, text)
      .split('\n')
      .find((l) => l.includes('GIT_SSH_COMMAND'));
    return { service, line };
  });
};

test('A3c-5 every agent service still declares a GIT_SSH_COMMAND', () => {
  const missing = sshLines().filter((s) => !s.line).map((s) => s.service);
  expect(missing).toEqual([]);
});

test('A3c-5 no GIT_SSH_COMMAND names one key for every remote', () => {
  const problems = sshLines()
    .filter((s) => /-i\s+\/git-secrets\/id_ed25519/.test(s.line!))
    .map((s) => `${s.service} still names the stack-wide key`);
  expect(problems).toEqual([]);
});

test('A3c-5 the identity is taken from the clone that is being worked on', () => {
  const problems = sshLines()
    .filter((s) => !s.line!.includes('liquidupstart.identity'))
    .map((s) => `${s.service} does not defer to the clone's declared identity`);
  expect(problems).toEqual([]);
});

test('A3c-5 the host-key policy and the timeouts survive the change', () => {
  const problems: string[] = [];
  for (const { service, line } of sshLines()) {
    if (!line!.includes('/git-secrets/known_hosts')) problems.push(`${service} lost known_hosts`);
    if (!line!.includes('StrictHostKeyChecking=yes')) problems.push(`${service} lost strict host key checking`);
    if (!line!.includes('ConnectTimeout=')) problems.push(`${service} lost its connect timeout`);
    if (!line!.includes('BatchMode=yes')) problems.push(`${service} lost BatchMode`);
  }
  expect(problems).toEqual([]);
});
