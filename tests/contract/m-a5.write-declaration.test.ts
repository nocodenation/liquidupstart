/**
 * M-A5 · Contract · The declaration carries a write-capable repository
 *
 * Purpose:  Every repository declared so far is `read`, so the write path of
 *           the declaration has never been exercised where it matters — in the
 *           clone the hook reads. This proves that a mixed declaration writes
 *           each clone's `liquidupstart.access` from its own entry rather than
 *           from one template, without touching the real declaration in .env.
 * Given:    A temporary project, two local bare repositories `alpha.git` and
 *           `beta.git` each seeded with `README.md`, an ssh stand-in on PATH
 *           routing `git@localhost:alpha.git` and `git@localhost:beta.git` to
 *           them, and the declaration
 *           `git@localhost:alpha.git|read|protected, git@localhost:beta.git|write|protected`.
 * When:     The start script runs against that project.
 * Then:     `beta`'s clone carries `liquidupstart.access=write`, `alpha`'s still
 *           carries `read`, both carry `policy=protected`, and the manifest
 *           agrees with the clones.
 * Covers:   A5-1, U1, FR11
 * Unhappy:  None here by design. Refusing a malformed access word is A3c-3; what
 *           a write-capable clone may push is A5-4 and A5-5.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh, runStart, manifest, git } from '../lib/gitfixture';

const work = tempProject('lu-a5-decl-');
const project = join(work, 'project');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const alpha = seedRepo(work, 'alpha');
const beta = seedRepo(work, 'beta');
const bin = fakeSsh(work, [
  { match: 'alpha', bare: alpha },
  { match: 'beta', bare: beta }
]);
seedKnownHosts(project);

const MIXED_DECLARATION =
  'git@localhost:alpha.git|read|protected, git@localhost:beta.git|write|protected';

const started = runStart(project, MIXED_DECLARATION, { pathPrefix: bin });
const clone = (name: string) => join(project, 'volumes', 'repos', name);
const setting = (name: string, key: string) =>
  git(clone(name), ['config', '--get', `liquidupstart.${key}`]).stdout.trim();

test('A5-1 the start clones both repositories of the mixed declaration', () => {
  expect(started.code).toBe(0);
  expect(existsSync(join(clone('alpha'), '.git', 'HEAD'))).toBe(true);
  expect(existsSync(join(clone('beta'), '.git', 'HEAD'))).toBe(true);
});

test('A5-1 the write-capable clone carries access write where the hook reads it', () => {
  expect(setting('beta', 'access')).toBe('write');
  expect(setting('beta', 'policy')).toBe('protected');
});

test('A5-1 the read-only clone still carries access read, so the two are not written from one template', () => {
  expect(setting('alpha', 'access')).toBe('read');
  expect(setting('alpha', 'policy')).toBe('protected');
});

test('A5-1 the manifest reports the same access per repository as the clones carry', () => {
  const entries = manifest(project).repositories;
  const byName = Object.fromEntries(entries.map((e: any) => [e.name, e]));
  expect(byName.beta.access).toBe('write');
  expect(byName.alpha.access).toBe('read');
  expect(byName.beta.cloned).toBe(true);
  expect(byName.alpha.cloned).toBe(true);
});
