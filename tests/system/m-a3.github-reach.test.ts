/**
 * M-A3 · System · Reaching GitHub gives a definite answer, never a hang
 *
 * Purpose:  The characteristic failure of misconfigured SSH is not an error but
 *           a wait: a host key prompt or a password prompt blocking on a
 *           terminal that does not exist. An agent that hangs looks like an
 *           agent that is thinking. Every assertion here is therefore bounded in
 *           time, and a definite refusal counts as success — what is being
 *           proven is that the configuration reaches GitHub and gets an answer.
 * Given:    A running stack with the key and known_hosts mounted.
 * When:     git contacts github.com inside each harness under a timeout. git is
 *           driven rather than ssh directly, because only git reads
 *           GIT_SSH_COMMAND — a bare ssh call would test the container's default
 *           configuration instead of the one this milestone installs.
 * Then:     GitHub answers within the bound, either authenticating the key or
 *           denying it, and never asks about a host key.
 * Covers:   A3-7, A3-8, FR4, FR6
 * Unhappy:  A3-8 is the denial path. It generates its own throwaway key rather
 *           than relying on the configured one being unregistered: whether the
 *           operator has registered a deploy key is external state, and a test
 *           that depends on it passes or fails for reasons that have nothing to
 *           do with the code.
 */
import { test, expect } from 'bun:test';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';

stackGuard();

const probe = (service: string) =>
  inContainer(
    service,
    'cd /tmp && timeout 25 git ls-remote git@github.com:nocodenation/agent-skills.git 2>&1; echo "RC=$?"'
  );

for (const service of ['openclaw-gateway', 'opencode']) {
  test(`A3-7 ${service} gets a definite answer from GitHub inside the time bound`, () => {
    const r = probe(service);
    expect(r.output).toMatch(/Permission denied \(publickey\)|^[0-9a-f]{40}\s/m);
    expect(r.output).not.toContain('RC=124');
  });

  test(`A3-7 ${service} is never asked to accept a host key`, () => {
    const r = probe(service);
    expect(r.output).not.toMatch(/Are you sure you want to continue connecting/);
    expect(r.output).not.toMatch(/Host key verification failed/);
  });
}

test('A3-8 a key GitHub does not know is denied rather than hanging', () => {
  const r = inContainer(
    'openclaw-gateway',
    'd=$(mktemp -d) && ssh-keygen -t ed25519 -N "" -C throwaway -f "$d/k" >/dev/null 2>&1 && ' +
      'cd /tmp && GIT_SSH_COMMAND="ssh -i $d/k -o IdentitiesOnly=yes ' +
      '-o UserKnownHostsFile=/git-secrets/known_hosts -o StrictHostKeyChecking=yes ' +
      '-o ConnectTimeout=10 -o BatchMode=yes" ' +
      'timeout 25 git ls-remote git@github.com:nocodenation/agent-skills.git 2>&1; ' +
      'rc=$?; rm -rf "$d"; echo "RC=$rc"'
  );
  expect(r.output).toContain('Permission denied (publickey)');
  expect(r.output).not.toContain('RC=124');
});
