/**
 * M-A6 · Contract · The command is mounted wherever git-repo-info is
 *
 * Purpose:  A3e-7 established the shape of this: a command that is not reachable
 *           from where the agent stands does not exist. git-publish is now the
 *           only way work leaves the stack, so a service that carries
 *           git-repo-info and not git-publish would tell an agent what it may
 *           push and then leave it no way to push it — the refusal in the hook
 *           would be the first it heard of the command. The mount is read-only
 *           and single-file, as git-repo-info's is; §9's check 7 depends on
 *           that, because a single-file mount follows the inode.
 * Given:    compose.yml, and the command on disk.
 * When:     Every service block that mounts git-repo-info is read.
 * Then:     Each also mounts config/agents/bin/git-publish.sh read-only at
 *           /usr/local/bin/git-publish, and the file itself is an executable
 *           POSIX shell script.
 * Covers:   A6-12 (its structural precondition), FR17, U8
 * Unhappy:  A service gaining the one mount and not the other fails by name,
 *           rather than the run passing because the other two are fine.
 */
import { test, expect } from 'bun:test';
import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeText, serviceBlock, AGENT_SERVICES } from '../lib/compose-file';
import { repoRoot } from '../lib/paths';
import { PUBLISH_MOUNT } from '../lib/gitfixture';

const MOUNT = `./config/agents/bin/git-publish.sh:${PUBLISH_MOUNT}:ro`;
const text = composeText();

const carriesRepoInfo = AGENT_SERVICES.filter((s) =>
  serviceBlock(s, text).includes('/usr/local/bin/git-repo-info')
);

test('A6-12 the services that carry git-repo-info are the ones expected', () => {
  expect(carriesRepoInfo).toEqual(AGENT_SERVICES);
});

test('A6-12 every one of them mounts git-publish read-only at the same place on PATH', () => {
  const missing = carriesRepoInfo.filter((s) => !serviceBlock(s, text).includes(MOUNT));
  expect(missing).toEqual([]);
});

test('A6-12 the command on disk is an executable POSIX shell script', () => {
  const path = join(repoRoot, 'config/agents/bin/git-publish.sh');
  expect(statSync(path).mode & 0o111).not.toBe(0);
  expect(readFileSync(path, 'utf8').split('\n')[0]).toBe('#!/bin/sh');
});
