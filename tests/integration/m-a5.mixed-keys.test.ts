/**
 * M-A5 · Integration · A mixed declaration still gives every repository its own key
 *
 * Purpose:  A write key is the one credential where reuse would matter most.
 *           A3c-4 proved keys are distinct for two read entries; this proves it
 *           still holds when access levels differ, which is the case a shortcut
 *           — one key for the write repositories, say — would collapse.
 * Given:    The declaration from A5-1, one `read` and one `write`, against two
 *           local bare repositories through the ssh stand-in.
 * When:     The start script runs, generating keys and cloning.
 * Then:     The two private keys differ, each lives under its own slug
 *           directory with mode 600, and neither file is a copy of the other,
 *           compared byte for byte. No key material is ever printed.
 * Covers:   A5-2, U2, FR3
 * Unhappy:  The byte comparison is the negative half: a start that copied one
 *           key into the other directory would satisfy the directory check and
 *           fail here.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh, runStart, manifest } from '../lib/gitfixture';

const work = tempProject('lu-a5-keys-');
const project = join(work, 'project');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const alpha = seedRepo(work, 'alpha');
const beta = seedRepo(work, 'beta');
const bin = fakeSsh(work, [
  { match: 'alpha', bare: alpha },
  { match: 'beta', bare: beta }
]);
seedKnownHosts(project);

const DECLARATION = 'git@localhost:alpha.git|read|protected, git@localhost:beta.git|write|protected';
const started = runStart(project, DECLARATION, { pathPrefix: bin });

const entries = started.code === 0 ? manifest(project).repositories : [];
const privateKey = (e: any) => join(project, e.keyDir, 'id_ed25519');
const mode = (p: string) => (statSync(p).mode & 0o777).toString(8);

test('A5-2 the start generated a key for each repository of the mixed declaration', () => {
  expect(started.code).toBe(0);
  expect(entries.map((e: any) => e.name).sort()).toEqual(['alpha', 'beta']);
  for (const e of entries) {
    expect(existsSync(privateKey(e))).toBe(true);
    expect(existsSync(`${privateKey(e)}.pub`)).toBe(true);
  }
});

test('A5-2 each key lives under its own slug directory, mode 600', () => {
  const dirs = entries.map((e: any) => dirname(privateKey(e)));
  expect(new Set(dirs).size).toBe(2);
  for (const e of entries) {
    expect(dirname(privateKey(e))).toEndWith(`/${e.slug}`);
    expect(mode(privateKey(e))).toBe('600');
  }
});

test('A5-2 the write-capable repository has a key distinct from the read-only one', () => {
  const material = entries.map((e: any) => readFileSync(`${privateKey(e)}.pub`, 'utf8').split(' ')[1]);
  expect(material[0]).not.toBe(material[1]);
});

test('A5-2 neither private key file is a copy of the other', () => {
  const [a, b] = entries.map((e: any) => readFileSync(privateKey(e)));
  expect(a.equals(b)).toBe(false);
});
