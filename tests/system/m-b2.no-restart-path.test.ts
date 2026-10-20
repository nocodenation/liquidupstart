/**
 * M-B2 · System · The rule and the reality agree: an agent cannot restart Liquid
 *
 * Purpose:  B2-8 asserts what the skill says; this asserts that the stack means
 *           it. A rule only conduct enforces decays; one the system also enforces
 *           is a fact. NFR4 keeps the Docker socket out of the agent containers,
 *           so an agent cannot restart Liquid even if it decides the rule does
 *           not apply to it — and the day someone mounts the socket for
 *           convenience, this case is what notices.
 * Given:    The running openclaw-gateway container, the harness an agent works
 *           in, and compose.yml as declared.
 * When:     From inside the container: /var/run/docker.sock is looked for, the
 *           docker binary is looked for on the PATH, and if it exists `docker
 *           info` is invoked against whatever daemon it would reach. compose.yml
 *           is read for any docker.sock mount in any service.
 * Then:     No socket, no reachable daemon, and no service in compose.yml mounts
 *           one. The agent's only way to make a NAR live is to ask the operator,
 *           which is what §6.4 tells it to do.
 * Covers:   B2-9, FR29, NFR4
 * Unhappy:  The negative half is the assertion: a socket present, a daemon
 *           answering, or a docker.sock line in compose.yml fails the case and is
 *           a finding about the stack rather than about the agent.
 */
import { test, expect } from 'bun:test';
import { stackGuard } from '../lib/guard';
import { inContainer } from '../lib/stack';
import { composeText } from '../lib/compose-file';

stackGuard(['openclaw-gateway']);

const SERVICE = 'openclaw-gateway';
const probe = inContainer(
  SERVICE,
  'echo "SOCKET:"; ls /var/run/docker.sock 2>/dev/null; ' +
    'echo "BINARY:"; command -v docker 2>/dev/null; ' +
    'echo "DAEMON:"; command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && echo reachable; ' +
    'echo "END"'
);

function block(name: string): string {
  const m = probe.stdout.match(new RegExp(`^${name}:$\\n([\\s\\S]*?)^(?:SOCKET|BINARY|DAEMON|END):?$`, 'm'));
  return (m ? m[1] : '').trim();
}

test('B2-9 the probe ran to completion inside the container', () => {
  expect(probe.stdout).toContain('END');
});

test('B2-9 there is no Docker socket in the agent container', () => {
  expect(block('SOCKET')).toBe('');
});

test('B2-9 no Docker daemon is reachable from it', () => {
  expect(block('DAEMON')).toBe('');
});

test('B2-9 no service in compose.yml mounts the socket', () => {
  const lines = composeText()
    .split(/\r?\n/)
    .filter((l) => l.includes('docker.sock') && !l.trim().startsWith('#'));
  expect(lines).toEqual([]);
});
