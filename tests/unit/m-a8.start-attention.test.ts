/**
 * M-A8 · Unit · The start says at the end what did not come up
 *
 * Purpose:  U11 names the shape it exists to prevent — "a start that ends in a
 *           list of URLs and passwords while two repositories are unreachable".
 *           A8-17 met exactly that on 2026-09-08: the warning was printed, and
 *           then roughly 250 lines went by — certificate generation, a hundred
 *           container lines — before a banner of URLs and credentials and the
 *           word succeeded. `.install-result` recorded start_ok=1. The operator
 *           could have walked away without noticing, which is the finding, and
 *           the answer is not a louder warning in the middle but a section at
 *           the end.
 * Given:    A manifest of the shape git.sh writes, in three states.
 * When:     start.sh's extractor is asked what needs attention.
 * Then:     One line per unreachable repository carrying its label, the public
 *           key to register and the error the clone gave; nothing at all when
 *           every repository is cloned; and nothing when there is no manifest,
 *           since a stack without the feature must not grow a warning.
 * Covers:   A8-26, FR20, U11
 * Unhappy:  The silent cases are the unhappy ones. A section that appears when
 *           nothing is wrong is noise, and after two starts nobody reads it —
 *           which is how the buried warning became invisible in the first place.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { repoRoot } from '../lib/paths';

const FLOWS = { host: 'github.com', path: 'nocodenation/liquid-flows', slug: 'github.com_nocodenation_liquid-flows' };
const SKILLS = { host: 'github.com', path: 'nocodenation/agent-skills', slug: 'github.com_nocodenation_agent-skills' };
const DENIED = 'git@github.com: Permission denied (publickey).';

const project = mkdtempSync(join(tmpdir(), 'lu-a8-attention-'));
let extractor = '';

function entry(r: typeof FLOWS, cloned: boolean, error: string | null) {
  return {
    name: r.path.split('/')[1],
    url: `git@${r.host}:${r.path}.git`,
    host: r.host,
    path: r.path,
    access: 'read',
    policy: 'protected',
    slug: r.slug,
    keyDir: `volumes/_git-secrets/repos/${r.slug}`,
    publicKeyFile: `volumes/_git-secrets/repos/${r.slug}/id_ed25519.pub`,
    clonePath: `volumes/repos/${r.path.split('/')[1]}`,
    cloned,
    error
  };
}

function writeManifest(repositories: unknown[]) {
  const dir = join(project, 'volumes', '_git-secrets');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'repositories.json'),
    JSON.stringify({ generated: '2026-09-08T06:31:10Z', repositories }, null, 2) + '\n'
  );
}

function attention(dir: string = project): string {
  const script = `PROJECT_DIR=${JSON.stringify(dir)}\n${extractor}\nunreachable_repositories\n`;
  const p = spawnSync('bash', ['-c', script], { encoding: 'utf8', timeout: 60_000 });
  // The exit code is asserted because the first version of this helper joined
  // the lines with a semicolon, which put one at the start of a line: bash
  // refused the whole script, stdout was empty, and an empty expectation would
  // have read as "nothing needs attention".
  expect(`${p.status} ${p.stderr ?? ''}`.trim()).toBe('0');
  return (p.stdout ?? '').trim();
}

beforeAll(() => {
  const start = readFileSync(join(repoRoot, 'scripts', 'linux', 'start.sh'), 'utf8');
  const from = start.indexOf('unreachable_repositories() {');
  expect(from).toBeGreaterThan(-1);
  extractor = start.slice(from, start.indexOf('\n}\n', from) + 3);
});

afterAll(() => rmSync(project, { recursive: true, force: true }));

test('A8-26 an unreachable repository is reported with its key and its error', () => {
  writeManifest([entry(FLOWS, true, null), entry(SKILLS, false, DENIED)]);

  const [label, key, err] = attention().split('\t');
  expect(label).toBe('github.com/nocodenation/agent-skills');
  expect(key).toBe(`volumes/_git-secrets/repos/${SKILLS.slug}/id_ed25519.pub`);
  expect(err).toBe(DENIED);
});

test('A8-26 and only that one — the reachable repository is not mentioned', () => {
  writeManifest([entry(FLOWS, true, null), entry(SKILLS, false, DENIED)]);

  const lines = attention().split('\n');
  expect(lines).toHaveLength(1);
  expect(attention()).not.toContain('liquid-flows');
});

test('A8-26 nothing is said when every repository is cloned', () => {
  writeManifest([entry(FLOWS, true, null), entry(SKILLS, true, null)]);

  expect(attention()).toBe('');
});

test('A8-26 and nothing when there is no manifest at all', () => {
  // A stack that declares no repositories must not grow a section about them.
  const bare = mkdtempSync(join(tmpdir(), 'lu-a8-bare-'));
  try {
    expect(attention(bare)).toBe('');
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

test('A8-26 two unreachable repositories are both named', () => {
  // U11 speaks of "two repositories are unreachable"; a report that stops at
  // the first would satisfy every assertion above it.
  writeManifest([entry(FLOWS, false, DENIED), entry(SKILLS, false, DENIED)]);

  const lines = attention().split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain('liquid-flows');
  expect(lines[1]).toContain('agent-skills');
});
