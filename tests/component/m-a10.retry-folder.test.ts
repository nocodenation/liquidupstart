/**
 * A10-11 to A10-13 — the dashboard's Test uses the folder a full start uses.
 *
 * Purpose: finding 1 of Timur's code review of #9. `runStartGitStep` reruns
 * `git.sh` with a declaration of one entry:
 *
 *   GIT_REPOSITORIES: `${entry.url}|${entry.access}|${entry.policy}`
 *
 * `lu_git_parse` names the clone folder after the plain repository name, and
 * falls back to the slug `host_owner_repo` only when that name occurs more than
 * once **in the declaration it is given**. With one entry there is never a
 * collision, so the Test clones into a folder a full start never uses.
 *
 * With `acme/skills` and `other/skills` both declared, a start uses
 * `volumes/repos/github.com_acme_skills` and `…_other_skills`. Test `acme/skills`
 * and it clones into `volumes/repos/skills`; the manifest records that path;
 * testing `other/skills` afterwards finds `skills/.git`, calls it cloned, and
 * writes the *other* repository's key, `access` and `insteadOf` into it. The
 * next full start clones both again under the long names and leaves `skills/`
 * behind.
 *
 * Given  two declared repositories that share a repository name
 * When   one of them is tested from the dashboard
 * Then   it is cloned into the folder a full start would use, the other
 *        repository's clone and manifest entry are untouched, and the manifest
 *        records the long path
 * And    a declaration with no collision still uses the plain name, so the rule
 *        is unchanged where it was already right
 *
 * A10-13 is the mechanism underneath: `git.sh` given `GIT_ONLY_SLUG` sees the
 * whole declaration — which is what makes the folder rule agree — but touches
 * only the one repository.
 *
 * Test data: `git@github.com:acme/skills.git|read|protected` and
 * `git@github.com:other/skills.git|write|protected`, slugs
 * `github.com_acme_skills` and `github.com_other_skills`. The ssh stand-in
 * routes `acme/skills` to a seeded bare repository holding `README.md` with the
 * line `# skills` and refuses everything else, so `other/skills` stays
 * unreachable throughout and any change to it would be this bug rather than a
 * clone. The no-collision counterpart declares
 * `git@github.com:acme/flows.git|read|protected` alone.
 *
 * Requirements covered: A10-11 to A10-13, finding 1 of the #9 code review.
 */
import { test, expect, afterAll, beforeAll, beforeEach } from 'bun:test';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, retry } from '../lib/dashboardfixture';
import {
  type Declared,
  declaredEnv,
  generateKeyPair,
  manifestEntry,
  readManifestFile,
  resetProject
} from '../lib/gitproject';
import { fakeSsh, seedKnownHosts, seedRepo, tempProject } from '../lib/gitfixture';
import { writeManifest } from '../lib/gitproject';

const ACME: Declared = {
  name: 'skills',
  url: 'git@github.com:acme/skills.git',
  host: 'github.com',
  path: 'acme/skills',
  access: 'read',
  policy: 'protected',
  slug: 'github.com_acme_skills',
  cloned: false,
  error: 'git@github.com: Permission denied (publickey).'
};

const OTHER: Declared = {
  ...ACME,
  url: 'git@github.com:other/skills.git',
  path: 'other/skills',
  access: 'write',
  slug: 'github.com_other_skills'
};

const work = tempProject('lu-a10-folder-');
const reposDir = join(projectDir, 'volumes', 'repos');
let originalPath: string;

/** The manifest a full start writes when two declared repositories share a name. */
function collidingEntry(repo: Declared): Record<string, unknown> {
  return {
    ...manifestEntry(repo),
    clonePath: `volumes/repos/${repo.slug}`,
    containerClone: `/repos/${repo.slug}`
  };
}

const clones = () => (existsSync(reposDir) ? readdirSync(reposDir).sort() : []);

// By slug, not by name: both declared repositories are called "skills", which is
// the collision under test -- the fixture helper that looks an entry up by name
// reads the wrong one here, exactly as the dashboard did before the fix.
const entryBySlug = (slug: string) =>
  JSON.stringify(readManifestFile(projectDir).repositories.find((e) => e.slug === slug));

beforeAll(() => {
  const bare = seedRepo(work, 'skills');
  originalPath = process.env.PATH ?? '';
  // Routes acme/skills only: `other` must stay unreachable, so that any change
  // to its clone or its entry is the defect under test and not a clone.
  process.env.PATH = `${fakeSsh(work, [{ match: 'acme/skills', bare }])}:${originalPath}`;
});

afterAll(() => {
  process.env.PATH = originalPath;
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  declaredEnv(projectDir, `${ACME.url}|read|protected,${OTHER.url}|write|protected`);
  generateKeyPair(projectDir, ACME.slug);
  generateKeyPair(projectDir, OTHER.slug);
  seedKnownHosts(projectDir);
  writeManifest(projectDir, [collidingEntry(ACME), collidingEntry(OTHER)]);
});

test('A10-11 the tested repository lands in the folder a full start uses', async () => {
  const otherBefore = entryBySlug(OTHER.slug);

  const { status, body } = await retry(ACME.path);

  expect({ status, ok: body.ok }).toEqual({ status: 200, ok: true });
  // The whole finding in one assertion: `skills` is the folder a single-entry
  // declaration produces, and no full start ever uses it here.
  expect(clones()).toEqual([ACME.slug]);
  expect(existsSync(join(reposDir, ACME.slug, '.git', 'HEAD'))).toBe(true);
  expect(existsSync(join(reposDir, 'skills'))).toBe(false);

  const entries = readManifestFile(projectDir).repositories;
  const fresh = entries.find((e) => e.slug === ACME.slug);
  expect({ cloned: fresh?.cloned, path: fresh?.clonePath }).toEqual({
    cloned: true,
    path: `volumes/repos/${ACME.slug}`
  });
  // And the other repository is untouched, to the byte.
  expect(entryBySlug(OTHER.slug)).toBe(otherBefore);
});

test('A10-11 the second repository is not adopted by the first one’s clone', async () => {
  await retry(ACME.path);
  const { body } = await retry(OTHER.path);

  // Before the fix this answered "reachable": `other` found `skills/.git`, which
  // `acme` had just created, and called it its own.
  expect(body.ok).toBe(false);
  const fresh = readManifestFile(projectDir).repositories.find((e) => e.slug === OTHER.slug);
  expect(fresh?.cloned).toBe(false);
});

test('A10-12 with no collision the plain name is still used', async () => {
  // The counterpart: the rule is only wrong where two names collide, and a fix
  // that renamed every folder to a slug would break every existing installation.
  const flows: Declared = {
    ...ACME,
    name: 'flows',
    url: 'git@github.com:acme/flows.git',
    path: 'acme/flows',
    slug: 'github.com_acme_flows'
  };
  resetProject(projectDir);
  declaredEnv(projectDir, `${flows.url}|read|protected`);
  generateKeyPair(projectDir, flows.slug);
  seedKnownHosts(projectDir);
  writeManifest(projectDir, [manifestEntry(flows)]);
  const bare = seedRepo(work, 'flows');
  process.env.PATH = `${fakeSsh(join(work, 'flows-route'), [{ match: 'acme/flows', bare }])}:${originalPath}`;

  const { body } = await retry(flows.path);

  expect(body.ok).toBe(true);
  expect(clones()).toEqual(['flows']);
});
