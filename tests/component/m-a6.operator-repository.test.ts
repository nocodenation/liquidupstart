/**
 * M-A6 · Component · The operator's own repository is not governed by the rule
 *
 * Purpose:  The narrowing exists for the clones the stack makes for agents. The
 *           operator's own checkout at the project root is a different
 *           repository with its own configuration, and a rule that reached it
 *           would mean the person maintaining the stack could no longer push
 *           without minting a token first. This is asserted by reading
 *           configuration, never by pushing: a case that proved the point by
 *           pushing from the working copy would put a commit on a real remote
 *           to make an argument about a hook.
 * Given:    The repository this suite lives in, at the project root.
 * When:     Its core.hooksPath and its liquidupstart.* configuration are read.
 * Then:     It is a git repository, it does not point at the stack's shared
 *           hook or at the hook sources, and it carries no declaration — so
 *           nothing in M-A6 applies to it.
 * Covers:   A6-10, NFR1
 * Unhappy:  Pointing the project root at the shared hook fails this by name.
 *           The positive counterpart is A6-6, where the same push in a governed
 *           clone is refused: together they show the rule is bounded rather
 *           than absent.
 */
import { test, expect } from 'bun:test';
import { repoRoot } from '../lib/paths';
import { git, hooksSource, HOOKS_MOUNT } from '../lib/gitfixture';

const config = (key: string) => git(repoRoot, ['config', '--get', key]).stdout.trim();

test('A6-10 the project root is a git repository', () => {
  expect(git(repoRoot, ['rev-parse', '--is-inside-work-tree']).stdout.trim()).toBe('true');
});

test('A6-10 the project root does not point at the stack\'s shared hook', () => {
  const hooksPath = config('core.hooksPath');
  expect(hooksPath).not.toBe(HOOKS_MOUNT);
  expect(hooksPath).not.toBe(hooksSource);
});

test('A6-10 the project root carries no declaration, so no rule of this feature reads it', () => {
  expect(config('liquidupstart.access')).toBe('');
  expect(config('liquidupstart.policy')).toBe('');
});
