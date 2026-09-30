/**
 * M-A3c · Unit · One key per declared repository, and never a replacement
 *
 * Purpose:  §2 of the feature document requires a deploy key per repository, and
 *           GitHub enforces it: the same key is refused on a second repository.
 *           Each declared repository therefore gets its own directory and its own
 *           ed25519 pair. The idempotence A3-2 demanded of the single key is
 *           demanded of every one of them, for the same reason — the operator
 *           registers these by hand, and regenerating revokes access silently.
 * Given:    A temporary secrets directory and a declaration of two repositories.
 * When:     Key generation runs over the declaration, then runs a second time.
 * Then:     Each repository has its own keypair, private keys are mode 600, and
 *           the second run leaves every existing key byte-for-byte unchanged.
 * Covers:   A3c-4, A3c-10, FR3, FR11, NFR1
 * Unhappy:  A3c-10 is the collision path: two repositories whose last path
 *           segment is the same, from different hosts, must not share a key
 *           directory or a clone directory.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { tempProject, reposLib, parseDeclaration } from '../lib/gitfixture';

const secrets = tempProject('lu-a3c-keys-');
afterAll(() => rmSync(secrets, { recursive: true, force: true }));

const DECLARATION =
  'git@github.com:nocodenation/agent-skills.git|read|protected,' +
  'git@gitlab.com:group/subgroup/tooling.git|write|direct';

const keys = (dir: string, declaration: string) => sh(['bash', reposLib, 'keys', dir, declaration]);
const mode = (p: string) => (statSync(p).mode & 0o777).toString(8);

const first = keys(secrets, DECLARATION);
const dirs = first.stdout
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => l.split('\t'));

test('A3c-4 each declared repository gets its own key directory', () => {
  expect(first.code).toBe(0);
  expect(dirs.length).toBe(2);
  const slugs = dirs.map(([slug]) => slug);
  expect(new Set(slugs).size).toBe(2);
  for (const [, pub] of dirs) {
    expect(existsSync(pub)).toBe(true);
    expect(readFileSync(pub, 'utf8')).toStartWith('ssh-ed25519 ');
    expect(existsSync(pub.replace(/\.pub$/, ''))).toBe(true);
  }
});

test('A3c-4 the two repositories have different keys', () => {
  const [a, b] = dirs.map(([, pub]) => readFileSync(pub, 'utf8').split(' ')[1]);
  expect(a).not.toBe(b);
});

test('A3c-4 every private key is unreadable by anyone else', () => {
  for (const [, pub] of dirs) {
    expect(mode(pub.replace(/\.pub$/, ''))).toBe('600');
  }
});

test('A3c-4 a second run leaves every existing key untouched', () => {
  const before = dirs.map(([, pub]) => readFileSync(pub.replace(/\.pub$/, '')));
  const again = keys(secrets, DECLARATION);
  expect(again.code).toBe(0);
  dirs.forEach(([, pub], i) => {
    expect(readFileSync(pub.replace(/\.pub$/, '')).equals(before[i])).toBe(true);
  });
});

test('A3c-4 adding a repository generates only the new key', () => {
  const untouched = readFileSync(dirs[0][1].replace(/\.pub$/, ''));
  const r = keys(secrets, `${DECLARATION},git@github.com:nocodenation/liquidupstart.git|write|protected`);
  expect(r.code).toBe(0);
  const lines = r.stdout.split('\n').filter((l) => l.trim() !== '');
  expect(lines.length).toBe(3);
  expect(readFileSync(dirs[0][1].replace(/\.pub$/, '')).equals(untouched)).toBe(true);
});

test('A3c-10 same repository name on two hosts gets distinct key and clone directories', () => {
  const declaration =
    'git@github.com:nocodenation/tooling.git|read|protected,' +
    'git@forgejo.example.org:team/tooling.git|read|protected';
  const parsed = parseDeclaration(declaration);
  expect(parsed.code).toBe(0);
  const parsedRows = parsed.stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t'));
  const slugs = parsedRows.map((c) => c[6]);
  const clones = parsedRows.map((c) => c[7]);
  expect(new Set(slugs).size).toBe(2);
  expect(new Set(clones).size).toBe(2);
  for (const c of clones) expect(c).not.toBe('');

  const collisionSecrets = tempProject('lu-a3c-collide-');
  try {
    const r = keys(collisionSecrets, declaration);
    expect(r.code).toBe(0);
    const paths = r.stdout.split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t')[1]);
    expect(new Set(paths.map((p) => join(p, '..'))).size).toBe(2);
    const material = paths.map((p) => readFileSync(p, 'utf8').split(' ')[1]);
    expect(material[0]).not.toBe(material[1]);
  } finally {
    rmSync(collisionSecrets, { recursive: true, force: true });
  }
});
