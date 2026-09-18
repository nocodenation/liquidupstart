/**
 * M-A8 · Component · The card's retry is a real clone, and only of what was declared
 *
 * Purpose:  U2 says the operator "asks the launchpad to test the repository.
 *           The test is a real clone, not a claim: there is no code to paste
 *           back, so the only honest confirmation is the operation itself
 *           succeeding." A button that sets a flag would satisfy a careless
 *           test and lie to every operator. The same action takes a repository
 *           identifier over HTTP and ends in git clone, so the declaration —
 *           the only list of what this stack may talk to — has to be consulted
 *           rather than trusted.
 * Given:    A fixture project declaring
 *           git@github.com:example/probe.git|write|protected and
 *           git@github.com:example/absent.git|read|protected, neither cloned, an
 *           ssh stand-in on PATH that routes probe to a local bare repository
 *           holding README.md with the line "# probe" and refuses everything
 *           else, and a manifest recording both as failed.
 * When:     The git-auth POST action is invoked with a name.
 * Then:     "probe" is cloned onto disk and its manifest entry turns cloned
 *           with no error while the other entry's manifest text does not
 *           change by a byte; and "not-declared", "../../etc/passwd" and
 *           git@github.com:someone/elsewhere.git are each refused with the
 *           declaration named, no clone directory created and the manifest
 *           untouched.
 * Covers:   A8-11, A8-12, FR3, FR11, NFR5, U2, U11
 * Unhappy:  A8-12 is the unhappy case and the reason the action exists in this
 *           shape: a name arriving over HTTP must not reach git clone, whatever
 *           it says.
 */
import { test, expect, afterAll, beforeAll, beforeEach } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, retry } from '../lib/dashboardfixture';
import {
  type Declared,
  declaredEnv,
  entryText,
  generateKeyPair,
  manifestEntry,
  manifestPath,
  readManifestFile,
  resetProject,
  writeManifest
} from '../lib/gitproject';
import { fakeSsh, seedKnownHosts, seedRepo, tempProject } from '../lib/gitfixture';

const PROBE: Declared = {
  name: 'probe',
  url: 'git@github.com:example/probe.git',
  host: 'github.com',
  path: 'example/probe',
  access: 'write',
  policy: 'protected',
  slug: 'github.com_example_probe',
  cloned: false,
  error: 'git@github.com: Permission denied (publickey).'
};

const ABSENT: Declared = {
  ...PROBE,
  name: 'absent',
  url: 'git@github.com:example/absent.git',
  path: 'example/absent',
  access: 'read',
  slug: 'github.com_example_absent'
};

const REFUSED = ['not-declared', '../../etc/passwd', 'git@github.com:someone/elsewhere.git'];

const work = tempProject('lu-a8-retry-');
const reposDir = join(projectDir, 'volumes', 'repos');
let originalPath: string;

function clones(): string[] {
  return existsSync(reposDir) ? readdirSync(reposDir).sort() : [];
}

beforeAll(() => {
  const bare = seedRepo(work, 'probe');
  originalPath = process.env.PATH ?? '';
  process.env.PATH = `${fakeSsh(work, [{ match: 'probe', bare }])}:${originalPath}`;
});

afterAll(() => {
  process.env.PATH = originalPath;
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  declaredEnv(projectDir, `${PROBE.url}|write|protected,${ABSENT.url}|read|protected`);
  generateKeyPair(projectDir, PROBE.slug);
  generateKeyPair(projectDir, ABSENT.slug);
  seedKnownHosts(projectDir);
  writeManifest(projectDir, [manifestEntry(PROBE), manifestEntry(ABSENT)]);
  mkdirSync(reposDir, { recursive: true });
});

for (const name of REFUSED) {
  test(`A8-12 the retry refuses "${name}" before anything runs`, async () => {
    const before = readFileSync(manifestPath(projectDir), 'utf8');

    const { status, body } = await retry(name);

    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.message).toContain('GIT_REPOSITORIES');
    expect(clones()).toEqual([]);
    expect(readFileSync(manifestPath(projectDir), 'utf8')).toBe(before);
  });
}

test('A8-12 an empty name is refused the same way', async () => {
  const { status, body } = await retry('');

  expect(status).toBe(404);
  expect(body.message).toContain('GIT_REPOSITORIES');
  expect(clones()).toEqual([]);
});

test('A8-11 the retry clones exactly the repository it was told to', async () => {
  const otherBefore = entryText(projectDir, ABSENT.name);

  const { status, body } = await retry(PROBE.name);

  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(existsSync(join(reposDir, 'probe', '.git', 'HEAD'))).toBe(true);
  expect(readFileSync(join(reposDir, 'probe', 'README.md'), 'utf8')).toContain('# probe');
  expect(clones()).toEqual(['probe']);

  const entries = readManifestFile(projectDir).repositories;
  expect(entries.map((e) => e.name)).toEqual([PROBE.name, ABSENT.name]);
  expect(entries[0].cloned).toBe(true);
  expect(entries[0].error).toBeNull();
  expect(entryText(projectDir, ABSENT.name)).toBe(otherBefore);
});

test('A8-11 the response hands the operator the repository it just tested', async () => {
  const { body } = await retry(PROBE.name);

  expect(body.repository.name).toBe(PROBE.name);
  expect(body.repository.cloned).toBe(true);
  expect(body.repository.unreachable).toBe(false);
  expect(body.repository.publicKey).toStartWith('ssh-ed25519 ');
});
