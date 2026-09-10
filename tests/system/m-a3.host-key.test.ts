/**
 * M-A3 · System · An unknown host is refused, not silently trusted
 *
 * Purpose:  Pre-seeding known_hosts protects the one host we seeded. This proves
 *           the protection is real by aiming at a host we deliberately did not
 *           seed: the connection must be refused on host key grounds rather than
 *           accepted, and it must be refused rather than waiting on a prompt.
 *           Without this, StrictHostKeyChecking could be quietly relaxed and
 *           nothing else in the suite would notice.
 * Given:    A running stack whose known_hosts contains github.com only.
 * When:     git is pointed at a host that is not seeded, through the same
 *           GIT_SSH_COMMAND the feature installs.
 * Then:     It fails on host key verification inside the time bound.
 * Covers:   A3-9, FR4
 * Unhappy:  Inverted by design — success at connecting would be the defect.
 */
import { test, expect } from 'bun:test';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';

stackGuard();

test('A3-9 a host absent from known_hosts is rejected on host key grounds', () => {
  const r = inContainer(
    'openclaw-gateway',
    'cd /tmp && timeout 25 git ls-remote git@gitlab.com:gitlab-org/gitlab.git 2>&1; echo "RC=$?"'
  );
  expect(r.output).toContain('Host key verification failed');
  expect(r.output).not.toContain('RC=124');
});

test('A3-9 the refusal is not a prompt waiting for an answer', () => {
  const r = inContainer(
    'openclaw-gateway',
    'cd /tmp && timeout 25 git ls-remote git@gitlab.com:gitlab-org/gitlab.git 2>&1; echo "RC=$?"'
  );
  expect(r.output).not.toMatch(/Are you sure you want to continue connecting/);
});
