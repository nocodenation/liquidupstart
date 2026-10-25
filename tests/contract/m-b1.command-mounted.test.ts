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
 *           on a line compose acts on, and the file itself is an executable POSIX
 *           shell script.
 * Covers:   B1-2, FR21
 * Unhappy:  A service gaining git-repo-info and not nar-build fails by name
 *           rather than the run passing because the other two are fine. And a
 *           mount turned into a YAML comment is a missing mount: the check read
 *           the block as text until 2026-10-22, and with `openclaw-cli`'s mount
 *           commented out it stayed 3 pass / 0 fail while compose mounted nothing.
 *
 * Test data: compose.yml as it stands; and the same text with `openclaw-cli`'s
 * line `- ./config/agents/bin/nar-build.sh:/usr/local/bin/nar-build:ro` turned
 * into `# - …`, into `- /dev/null:/tmp/x:ro  # …` and into `NAR_HINT: …` -- a
 * whole-line comment, a trailing one, and a value that names the mount.
 */
import { test, expect } from 'bun:test';
import { statSync, readFileSync } from 'node:fs';
import { composeText, serviceBlock, mountsLive, AGENT_SERVICES } from '../lib/compose-file';
import { narCommand, NAR_MOUNT } from '../lib/narfixture';

const MOUNT = `./config/agents/bin/nar-build.sh:${NAR_MOUNT}:ro`;
const text = composeText();

const carriers = (t: string) => AGENT_SERVICES.filter((s) => mountsLive(serviceBlock(s, t), '/usr/local/bin/git-repo-info'));
const missing = (t: string) => carriers(t).filter((s) => !mountsLive(serviceBlock(s, t), MOUNT));

test('B1-2 the services that carry git-repo-info are the ones expected', () => {
  expect(carriers(text)).toEqual(AGENT_SERVICES);
});

test('B1-2 every one of them mounts nar-build read-only at the same place on PATH', () => {
  expect(missing(text)).toEqual([]);
});

// A function as the replacement, so the block's own `$$` is not read as a pattern.
const withBlock = (service: string, edit: (b: string) => string) => {
  const block = serviceBlock(service, text);
  return text.replace(block, () => edit(block));
};

test('B1-2 the negative: a mount that is only a comment is missing', () => {
  const commented = withBlock('openclaw-cli', (b) => b.replace(`- ${MOUNT}`, `# - ${MOUNT}`));
  expect(commented.length).toBe(text.length + 2);
  expect(missing(commented)).toEqual(['openclaw-cli']);
});

test('B1-2 and so is one that is a trailing comment, or a value under environment', () => {
  const trailing = withBlock('openclaw-cli', (b) => b.replace(`- ${MOUNT}`, `- /dev/null:/tmp/x:ro  # ${MOUNT}`));
  const value = withBlock('openclaw-cli', (b) => b.replace(`- ${MOUNT}`, `NAR_HINT: ${MOUNT}`));
  expect({ trailing: missing(trailing), value: missing(value) }).toEqual({ trailing: ['openclaw-cli'], value: ['openclaw-cli'] });
});

test('B1-2 the command on disk is an executable POSIX shell script', () => {
  expect(statSync(narCommand).mode & 0o111).not.toBe(0);
  expect(readFileSync(narCommand, 'utf8').split('\n')[0]).toBe('#!/bin/sh');
});
