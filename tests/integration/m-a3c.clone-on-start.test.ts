/**
 * M-A3c · Integration · Declared repositories are cloned, once, and a failure is survivable
 *
 * Purpose:  FR12 says a declared repository is present in the workspace without
 *           an agent having to fetch it, which is what turns U5 into opening a
 *           directory. Two properties decide whether that holds in practice: a
 *           second start must not touch a clone the operator has been working
 *           in, and a repository whose key has not been registered yet must not
 *           take the whole stack down with it — adding a repository and
 *           registering its key are two separate human acts and the gap between
 *           them is normal.
 * Given:    A temporary project, local seed repositories, and an ssh stand-in on
 *           PATH so the clone path runs without crossing the network.
 * When:     The start script runs, runs again, and then runs with a repository
 *           the stand-in refuses — the shape of an unregistered deploy key.
 * Then:     The clone appears, the second run leaves the working tree alone, and
 *           the refused repository is reported by name while the start succeeds.
 * Covers:   A3c-6, A3c-7, FR11, FR12
 * Unhappy:  A3c-7 is the unhappy path and is the one that decides usability: a
 *           start that failed there would make the stack unusable for as long as
 *           the operator took to register the key.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh, runStart, manifest } from '../lib/gitfixture';

const work = tempProject('lu-a3c-clone-');
const project = join(work, 'project');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const skills = seedRepo(work, 'agent-skills');
const bin = fakeSsh(work, [{ match: 'agent-skills', bare: skills }]);
seedKnownHosts(project);

const REGISTERED = 'git@github.com:nocodenation/agent-skills.git|read|protected';
const clone = join(project, 'volumes', 'repos', 'agent-skills');

const first = runStart(project, REGISTERED, { pathPrefix: bin });

test('A3c-6 the declared repository is in the workspace after the start', () => {
  expect(first.code).toBe(0);
  expect(existsSync(join(clone, '.git', 'HEAD'))).toBe(true);
  expect(readFileSync(join(clone, 'README.md'), 'utf8')).toContain('agent-skills');
  const entry = manifest(project).repositories[0];
  expect(entry.cloned).toBe(true);
  expect(entry.url).toBe('git@github.com:nocodenation/agent-skills.git');
  expect(entry.access).toBe('read');
  expect(entry.policy).toBe('protected');
});

test('A3c-6 a second start neither re-clones it nor disturbs the working tree', () => {
  writeFileSync(join(clone, 'WORK-IN-PROGRESS'), 'uncommitted\n');
  const headBefore = statSync(join(clone, '.git', 'HEAD')).mtimeMs;
  const second = runStart(project, REGISTERED, { pathPrefix: bin });
  expect(second.code).toBe(0);
  expect(existsSync(join(clone, 'WORK-IN-PROGRESS'))).toBe(true);
  expect(statSync(join(clone, '.git', 'HEAD')).mtimeMs).toBe(headBefore);
  expect(manifest(project).repositories[0].cloned).toBe(true);
});

test('A3c-7 a repository whose key is not registered is reported, and the start still succeeds', () => {
  const unregistered = 'git@github.com:nocodenation/not-registered.git|read|protected';
  const r = runStart(project, `${REGISTERED},${unregistered}`, { pathPrefix: bin });
  expect(r.code).toBe(0);
  expect(r.output).toContain('git@github.com:nocodenation/not-registered.git');
  expect(r.output).toMatch(/could not clone|clone failed/i);
});

test('A3c-7 the workspace simply does not contain the repository that failed', () => {
  expect(existsSync(join(project, 'volumes', 'repos', 'not-registered'))).toBe(false);
  const entries = manifest(project).repositories;
  const failed = entries.find((e: any) => e.name === 'not-registered');
  expect(failed.cloned).toBe(false);
  expect(String(failed.error).length).toBeGreaterThan(0);
  expect(entries.find((e: any) => e.name === 'agent-skills').cloned).toBe(true);
});

test('A3c-7 the repository that failed still has a key waiting to be registered', () => {
  const failed = manifest(project).repositories.find((e: any) => e.name === 'not-registered');
  expect(existsSync(join(project, failed.publicKeyFile))).toBe(true);
  expect(readFileSync(join(project, failed.publicKeyFile), 'utf8')).toStartWith('ssh-ed25519 ');
});
