/**
 * M-A3c · Component · The dashboard hands out one public key per repository
 *
 * Purpose:  Every declared repository needs its own deploy key registered by
 *           hand, so the operator has to be able to tell the keys apart — an
 *           unlabelled list of three ed25519 lines is worse than useless when
 *           pasting one into the wrong repository grants access nobody intended.
 *           The route reads the manifest the start script wrote rather than
 *           parsing the declaration a second time, because two parsers for one
 *           format drift apart, and it must still never expose private material.
 * Given:    A fixture project holding a manifest and the generated keypairs.
 * When:     The git-auth GET handler is invoked against it.
 * Then:     Every declared repository appears once, labelled with the repository
 *           it belongs to and carrying its own public key, and no private key
 *           material appears anywhere in the response.
 * Covers:   A3c-12, FR3, FR11, NFR1
 * Unhappy:  A repository whose clone failed is still listed with its key — that
 *           is precisely when the operator needs it — and a missing manifest is
 *           reported as an empty list rather than throwing.
 */
import { test, expect, afterAll, beforeEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PRIV = '-----BEGIN OPENSSH PRIVATE KEY-----\nA3CFIXTUREPRIVATEMATERIAL\n-----END OPENSSH PRIVATE KEY-----\n';
const KEYS: Record<string, string> = {
  'github.com_nocodenation_agent-skills': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAASKILLSFIXTUREKEY liquidupstart-agent-skills',
  'gitlab.com_group_subgroup_tooling': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAATOOLINGFIXTUREKEY liquidupstart-tooling'
};

const dir = mkdtempSync(join(tmpdir(), 'lu-a3c-dash-'));
const secrets = join(dir, 'volumes', '_git-secrets');
mkdirSync(secrets, { recursive: true });
writeFileSync(join(secrets, 'id_ed25519.pub'), 'ssh-ed25519 AAAALEGACYFIXTUREKEY liquidupstart-agent\n');
writeFileSync(join(secrets, 'id_ed25519'), PRIV, { mode: 0o600 });

const repositories = [
  {
    name: 'agent-skills',
    url: 'git@github.com:nocodenation/agent-skills.git',
    host: 'github.com',
    path: 'nocodenation/agent-skills',
    access: 'read',
    policy: 'protected',
    slug: 'github.com_nocodenation_agent-skills',
    publicKeyFile: 'volumes/_git-secrets/repos/github.com_nocodenation_agent-skills/id_ed25519.pub',
    clonePath: 'volumes/repos/agent-skills',
    cloned: true,
    error: null
  },
  {
    name: 'tooling',
    url: 'git@gitlab.com:group/subgroup/tooling.git',
    host: 'gitlab.com',
    path: 'group/subgroup/tooling',
    access: 'write',
    policy: 'direct',
    slug: 'gitlab.com_group_subgroup_tooling',
    publicKeyFile: 'volumes/_git-secrets/repos/gitlab.com_group_subgroup_tooling/id_ed25519.pub',
    clonePath: 'volumes/repos/tooling',
    cloned: false,
    error: 'Permission denied (publickey)'
  }
];

for (const slug of Object.keys(KEYS)) {
  const keyDir = join(secrets, 'repos', slug);
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(join(keyDir, 'id_ed25519.pub'), KEYS[slug] + '\n');
  writeFileSync(join(keyDir, 'id_ed25519'), PRIV, { mode: 0o600 });
}
writeFileSync(
  join(secrets, 'repositories.json'),
  JSON.stringify({ generated: '2026-08-31T00:00:00Z', repositories }, null, 2)
);

afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  process.env.ENV_DIR = dir;
});

const { GET } = await import('../../dashboard/src/routes/git-auth/+server?a3c');

test('A3c-12 every declared repository appears exactly once', async () => {
  const body = await (await GET()).json();
  expect(body.repositories.map((r: any) => r.name)).toEqual(['agent-skills', 'tooling']);
});

test('A3c-12 each repository carries its own public key, labelled', async () => {
  const body = await (await GET()).json();
  for (const repo of body.repositories) {
    expect(repo.label).toContain(repo.host);
    expect(repo.label).toContain(repo.path);
    expect(repo.publicKey.trim()).toBe(KEYS[repo.slug]);
  }
  const [a, b] = body.repositories.map((r: any) => r.publicKey);
  expect(a).not.toBe(b);
});

test('A3c-12 the access and branch policy are carried through to the operator', async () => {
  const body = await (await GET()).json();
  expect(body.repositories.map((r: any) => [r.access, r.policy])).toEqual([
    ['read', 'protected'],
    ['write', 'direct']
  ]);
});

test('A3c-12 a repository whose clone failed still shows its key and the reason', async () => {
  const body = await (await GET()).json();
  const tooling = body.repositories.find((r: any) => r.name === 'tooling');
  expect(tooling.cloned).toBe(false);
  expect(tooling.error).toContain('Permission denied');
  expect(tooling.publicKey).toStartWith('ssh-ed25519 ');
});

test('A3c-12 no private key material appears in the response', async () => {
  const text = JSON.stringify(await (await GET()).json());
  expect(text).not.toContain('BEGIN OPENSSH PRIVATE KEY');
  expect(text).not.toContain('A3CFIXTUREPRIVATEMATERIAL');
});

test('A3c-12 a project with no manifest reports no repositories rather than throwing', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'lu-a3c-dash-empty-'));
  process.env.ENV_DIR = empty;
  try {
    const body = await (await GET()).json();
    expect(body.repositories).toEqual([]);
  } finally {
    process.env.ENV_DIR = dir;
    rmSync(empty, { recursive: true, force: true });
  }
});
