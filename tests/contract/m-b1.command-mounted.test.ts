/**
 * M-B1 · Contract · nar-build is where the agent will look for it
 *
 * Purpose:  M-A3b to M-A3e spent four milestones learning that a command not
 *           reachable from where the agent stands does not exist, and A6-12
 *           made that a property of git-publish. nar-build inherits the answer
 *           rather than re-deriving it: it is the third command in the row
 *           git-repo-info and git-publish began. The services are read out of
 *           compose.yml rather than listed here, so a service added later
 *           cannot be forgotten.
 * Given:    compose.yml, and config/agents/bin/nar-build.sh on disk.
 * When:     Every service block that mounts git-repo-info is collected.
 * Then:     Each also mounts nar-build.sh read-only at /usr/local/bin/nar-build,
 *           and the file itself is an executable POSIX shell script.
 * Covers:   B1-2, FR21
 * Unhappy:  A service gaining git-repo-info and not nar-build fails by name
 *           rather than the run passing because the other two are fine.
 */
import { test, expect } from 'bun:test';
import { statSync, readFileSync } from 'node:fs';
import { composeText, serviceBlock, AGENT_SERVICES } from '../lib/compose-file';
import { narCommand, NAR_MOUNT } from '../lib/narfixture';

const MOUNT = `./config/agents/bin/nar-build.sh:${NAR_MOUNT}:ro`;
const text = composeText();

const carriesRepoInfo = AGENT_SERVICES.filter((s) =>
  serviceBlock(s, text).includes('/usr/local/bin/git-repo-info')
);

test('B1-2 the services that carry git-repo-info are the ones expected', () => {
  expect(carriesRepoInfo).toEqual(AGENT_SERVICES);
});

test('B1-2 every one of them mounts nar-build read-only at the same place on PATH', () => {
  const missing = carriesRepoInfo.filter((s) => !serviceBlock(s, text).includes(MOUNT));
  expect(missing).toEqual([]);
});

test('B1-2 the command on disk is an executable POSIX shell script', () => {
  expect(statSync(narCommand).mode & 0o111).not.toBe(0);
  expect(readFileSync(narCommand, 'utf8').split('\n')[0]).toBe('#!/bin/sh');
});
