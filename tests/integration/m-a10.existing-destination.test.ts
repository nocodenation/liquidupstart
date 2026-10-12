/**
 * A10-1 to A10-6 — what is already in the clone directory decides, and a wrong one is not adopted.
 *
 * Purpose: two findings from Timur's code review of #9 (2026-09-16), both in the
 * same three lines of `config/scripts/start/git.sh`:
 *
 *   if [[ -d "${dest}/.git" ]]; then cloned=true
 *   else  … git clone …  else rm -rf "$dest"
 *
 * **Finding 2 — a failed clone deletes a directory that existed before the
 * start.** The only check is `-d "$dest/.git"`. A directory holding an agent's
 * scratch work, or a git worktree (whose `.git` is a *file*), makes `git clone`
 * fail with "destination path already exists and is not an empty directory", and
 * the script then removes it. The operator declares a repository and loses the
 * work that was in that folder.
 *
 * **Finding 3 — any `.git` counts as the declared repository.** The declared
 * key, access, policy and `insteadOf` are written into whatever clone is there.
 * Change `acme/skills` to `neworg/skills` in the declaration and the old `acme`
 * clone is adopted: the manifest, `git-repo-info` and the dashboard all say
 * "cloned", while every fetch and every publish goes to the old remote with a
 * key that is not registered there.
 *
 * Given  a declared repository whose clone directory is already occupied
 * When   `git.sh` runs
 * Then   what is there is inspected rather than assumed: a directory that is not
 *        a clone is left alone, a clone of something else is refused by name,
 *        and only a clone of the declared URL is adopted
 * And    none of these three asks the operator for a deploy key, because
 *        registering one cannot fix any of them
 *
 * The positive counterparts are A10-2 and A10-5: a destination this run created
 * is still cleaned up when its clone fails, and a clone of the declared URL is
 * still accepted without a network call. Without them a script that refuses
 * everything would pass.
 *
 * Test data: `git@github.com:nocodenation/agent-skills.git|read|protected`
 * throughout. The occupied directory is `volumes/repos/agent-skills` holding
 * `notes.md` with the single line `probe`. The foreign clone is a real clone of
 * a seeded bare repository whose `remote.origin.url` is
 * `git@github.com:other/agent-skills.git`. For A10-6 that same clone also
 * carries `url.git@github.com:nocodenation/agent-skills.git.insteadOf =
 * git@github.com:other/agent-skills.git`, which is what makes `git remote
 * get-url origin` answer with the declared URL while the raw setting still says
 * `other` — a rewrite this stack itself writes into every clone it adopts.
 *
 * Requirements covered: A10-1 to A10-6, findings 2 and 3 of the #9 code review.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh, runStart, manifest, git } from '../lib/gitfixture';

const work = tempProject('lu-a10-dest-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const DECL = 'git@github.com:nocodenation/agent-skills.git|read|protected';
const OTHER_URL = 'git@github.com:other/agent-skills.git';

const bare = seedRepo(work, 'agent-skills');
// Routes the declared URL, so any refusal in these cases is a decision the
// script made and not a remote that would have refused anyway.
const accepting = fakeSsh(join(work, 'accept'), [{ match: 'agent-skills', bare }]);
const refusing = fakeSsh(join(work, 'refuse'), []);

/** A fresh project directory per case: these cases are about what is on disk. */
function project(name: string): string {
  const p = join(work, name, 'project');
  mkdirSync(p, { recursive: true });
  seedKnownHosts(p);
  return p;
}

function entry(p: string) {
  return manifest(p).repositories[0] as { cloned: boolean; error: string | null };
}

describe('A10-1 a directory that is not a clone is left alone', () => {
  const p = project('occupied');
  const dest = join(p, 'volumes', 'repos', 'agent-skills');
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'notes.md'), 'probe\n');
  const run = runStart(p, DECL, { pathPrefix: accepting });

  test('the work that was there survives the start', () => {
    // The finding in one assertion: an agent's scratch directory, or anything
    // else under that name, is not this script's to delete.
    expect(existsSync(join(dest, 'notes.md'))).toBe(true);
    expect(readFileSync(join(dest, 'notes.md'), 'utf8')).toBe('probe\n');
  });

  test('and the manifest says why, in words that name the way out', () => {
    const e = entry(p);
    expect(e.cloned).toBe(false);
    expect(e.error).toContain('volumes/repos/agent-skills already exists and is not a clone');
    expect(e.error).toContain('move it away');
  });

  test('and the operator is not asked for a deploy key, which could not fix it', () => {
    // The wait exists for a key the remote does not have. This is a directory in
    // the way, and no key registered anywhere changes that.
    expect(run.output).not.toContain('::aiw-git-key-required::');
    expect(run.code).toBe(0);
  });
});

describe('A10-2 a destination this run created is still cleaned up', () => {
  const p = project('clean-after-failure');
  const run = runStart(p, DECL, { pathPrefix: refusing });

  test('a failed clone leaves no half-written directory behind', () => {
    // The positive counterpart to A10-1, and the behaviour the `rm -rf` is
    // there for: git leaves the partial checkout in place when it fails.
    expect(existsSync(join(p, 'volumes', 'repos', 'agent-skills'))).toBe(false);
  });

  test('and this one does ask for the deploy key, because that is what failed', () => {
    expect(run.output).toContain('::aiw-git-key-required::');
  });
});

describe('A10-3 a worktree counts as a clone, because its .git is a file', () => {
  const p = project('worktree');
  const dest = join(p, 'volumes', 'repos', 'agent-skills');
  // A real worktree of the seeded repository: `.git` here is a file holding
  // "gitdir: …", which `-d` does not see and `-e` does.
  const main = join(work, 'worktree-main');
  git(work, ['clone', '-q', bare, main]);
  git(main, ['worktree', 'add', '-q', dest, '-b', 'probe']);

  const run = runStart(p, DECL, { pathPrefix: accepting });

  test('it is not deleted, and not cloned over', () => {
    expect(existsSync(join(dest, '.git'))).toBe(true);
    expect(readFileSync(join(dest, '.git'), 'utf8')).toContain('gitdir:');
  });

  test('and it is judged by its origin like any other clone', () => {
    // Its origin is the seeded bare repository, not the declared URL, so the
    // decision is finding 3's: refused by name rather than adopted.
    const e = entry(p);
    expect(e.cloned).toBe(false);
    expect(e.error).toContain('not git@github.com:nocodenation/agent-skills.git');
    expect(run.code).toBe(0);
  });
});

describe('A10-4 a clone of something else is refused, not adopted', () => {
  const p = project('foreign');
  const dest = join(p, 'volumes', 'repos', 'agent-skills');
  mkdirSync(join(p, 'volumes', 'repos'), { recursive: true });
  git(work, ['clone', '-q', bare, dest]);
  git(dest, ['remote', 'set-url', 'origin', OTHER_URL]);

  const run = runStart(p, DECL, { pathPrefix: accepting });

  test('the manifest names both URLs, so the operator can see the mix-up', () => {
    const e = entry(p);
    expect(e.cloned).toBe(false);
    expect(e.error).toContain(OTHER_URL);
    expect(e.error).toContain('not git@github.com:nocodenation/agent-skills.git');
  });

  test('and nothing of the declaration is written into it', () => {
    // The damage in finding 3 is not the wrong label -- it is that the declared
    // key, access and policy are written into a clone of another repository, so
    // the first push goes to the wrong remote with a key nobody registered.
    const access = git(dest, ['config', '--get', 'liquidupstart.access']);
    const identity = git(dest, ['config', '--get', 'liquidupstart.identity']);
    expect({ access: access.code, identity: identity.code }).toEqual({ access: 1, identity: 1 });
  });

  test('and no deploy key is asked for', () => {
    expect(run.output).not.toContain('::aiw-git-key-required::');
  });
});

describe('A10-5 a clone of the declared URL is adopted, as before', () => {
  const p = project('matching');
  const dest = join(p, 'volumes', 'repos', 'agent-skills');
  mkdirSync(join(p, 'volumes', 'repos'), { recursive: true });
  git(work, ['clone', '-q', bare, dest]);
  git(dest, ['remote', 'set-url', 'origin', 'git@github.com:nocodenation/agent-skills.git']);

  runStart(p, DECL, { pathPrefix: refusing });

  test('it counts as cloned without a network call', () => {
    // The refusing remote is deliberate: an implementation that re-cloned to be
    // sure would fail here, and an existing clone must not need the network.
    const e = entry(p);
    expect({ cloned: e.cloned, error: e.error }).toEqual({ cloned: true, error: null });
  });

  test('and the declaration is written into it', () => {
    expect(git(dest, ['config', '--get', 'liquidupstart.access']).stdout.trim()).toBe('read');
    expect(git(dest, ['config', '--get', 'core.hooksPath']).stdout.trim()).toContain('hooks');
  });
});

describe('A10-6 the origin is read raw, not through insteadOf', () => {
  const p = project('insteadof');
  const dest = join(p, 'volumes', 'repos', 'agent-skills');
  mkdirSync(join(p, 'volumes', 'repos'), { recursive: true });
  git(work, ['clone', '-q', bare, dest]);
  git(dest, ['remote', 'set-url', 'origin', OTHER_URL]);
  // The rewrite this stack writes into every clone it adopts. With it,
  // `git remote get-url origin` answers with the declared URL although the
  // remote really is `other`.
  git(dest, ['config', `url.git@github.com:nocodenation/agent-skills.git.insteadOf`, OTHER_URL]);

  test('the rewrite really does make get-url answer with the declared URL', () => {
    // Asserted rather than assumed: without this the case below would pass for
    // the wrong reason on any git that stopped applying the rewrite.
    expect(git(dest, ['remote', 'get-url', 'origin']).stdout.trim()).toBe(
      'git@github.com:nocodenation/agent-skills.git'
    );
    expect(git(dest, ['config', '--get', 'remote.origin.url']).stdout.trim()).toBe(OTHER_URL);
  });

  test('and the script still refuses it', () => {
    runStart(p, DECL, { pathPrefix: accepting });
    const e = entry(p);
    expect(e.cloned).toBe(false);
    expect(e.error).toContain(OTHER_URL);
  });
});
