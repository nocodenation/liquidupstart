/**
 * M-A4 · Unit · A repository declared read refuses every push, first
 *
 * Purpose:  The declaration already distinguishes read from write, and a
 *           read-only repository must not depend on its branch policy to stay
 *           safe. The rule is therefore consulted before any other, and the
 *           refusal says so: it is about access, not about branches. If the
 *           order were the other way round, a `read` repository with a `direct`
 *           policy would be told its branch is fine and let through.
 * Given:    hookFixture() with two settings changed — liquidupstart.access=read
 *           and liquidupstart.policy=direct, the most permissive branch setting
 *           there is, so a refusal cannot be attributed to the branch.
 * When:     The ordinary commit on feature/probe is pushed.
 * Then:     Non-zero exit, the message says `read`, and it mentions neither the
 *           branch nor the branch policy.
 * Covers:   A4-10, U1, U4, §1.3
 * Unhappy:  The whole case. Its counterweight is A4-1, the same push in the same
 *           fixture with access=write, which is allowed.
 */
import { test, expect, afterAll } from 'bun:test';
import { rmSync } from 'node:fs';
import { hookFixture, git, remoteHas } from '../lib/gitfixture';

const fx = hookFixture('lu-a4-access-');
afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

test('A4-10 access read refuses the push before any branch rule is consulted', () => {
  git(fx.clone, ['config', 'liquidupstart.access', 'read']);
  git(fx.clone, ['config', 'liquidupstart.policy', 'direct']);

  const r = git(fx.clone, ['push', 'origin', 'feature/probe']);
  expect(r.code).not.toBe(0);
  expect(remoteHas(fx, 'refs/heads/feature/probe')).toBe(false);
  expect(r.output).toContain('read');
  expect(r.output).not.toMatch(/feature branch|protected|default branch/i);
});
