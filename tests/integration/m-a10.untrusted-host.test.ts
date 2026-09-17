/**
 * A10-18, A10-19 — a host whose keys are not trusted says so, instead of blaming the key.
 *
 * Purpose: finding 5 of Timur's code review of #9. `lu_git_parse` accepts any SSH
 * host — `tests/unit/m-a3c.declaration-parse.test.ts` deliberately covers
 * GitLab- and Forgejo-shaped entries — but `known_hosts` is seeded once with
 * github.com's keys and never extended. Any other host therefore fails the clone
 * with `Host key verification failed`, and everything downstream then tells the
 * operator to register the deploy key: the start banner, the manifest error and
 * the dashboard card all say so. Registering a key cannot fix it, and no amount
 * of trying will say why.
 *
 * `docs/FEATURE-git-integration.md` §2 says "GitHub first; plumbing stays
 * host-agnostic (Forgejo later)", so supporting another host is not promised
 * today. What is wrong is the acceptance and the message, not the absence of the
 * feature — so this is a refusal that names the reason, not a new host.
 *
 * Given  a declaration naming a host other than github.com
 * When   `git.sh` runs
 * Then   no clone is attempted, the manifest error names the host and the limit,
 *        and the operator is not asked for a deploy key
 * And    the declaration still parses, because the parser is not what is wrong
 *
 * Test data: `git@gitlab.com:acme/flows.git|read|protected` — the same shape
 * A3c-2 already accepts — beside
 * `git@github.com:nocodenation/agent-skills.git|read|protected`, which is
 * routed to a seeded bare repository so the case shows the two treated
 * differently in one run rather than in two.
 *
 * Requirements covered: A10-18, A10-19, finding 5 of the #9 code review.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  tempProject,
  seedRepo,
  seedKnownHosts,
  fakeSsh,
  runStart,
  manifest,
  parseDeclaration
} from '../lib/gitfixture';

const work = tempProject('lu-a10-host-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const GITLAB = 'git@gitlab.com:acme/flows.git|read|protected';
const GITHUB = 'git@github.com:nocodenation/agent-skills.git|read|protected';

const bare = seedRepo(work, 'agent-skills');
const routed = fakeSsh(join(work, 'route'), [{ match: 'agent-skills', bare }]);

const project = join(work, 'project');
mkdirSync(project, { recursive: true });
seedKnownHosts(project);

const run = runStart(project, `${GITHUB},${GITLAB}`, { pathPrefix: routed });
const entries = manifest(project).repositories as Array<{
  name: string;
  host: string;
  cloned: boolean;
  error: string | null;
}>;
const gitlab = entries.find((e) => e.host === 'gitlab.com')!;
const github = entries.find((e) => e.host === 'github.com')!;

describe('A10-18 a host outside the trusted set is refused by name', () => {
  test('nothing is cloned, and the reason is the host rather than the key', () => {
    expect(gitlab.cloned).toBe(false);
    expect(gitlab.error).toContain('gitlab.com');
    expect(gitlab.error).toContain('only github.com host keys are trusted so far');
    // Read from known_hosts rather than compared against a literal host name, so
    // seeding a second host is all it takes to support one and this message
    // cannot outlive its own truth.
    expect(gitlab.error).toContain('no host key for it is in known_hosts');
    expect(existsSync(join(project, 'volumes', 'repos', 'flows'))).toBe(false);
  });

  test('and no clone was attempted, so no host key verification error is shown', () => {
    // The old path produced "Host key verification failed", which reads like a
    // key problem and sends the operator to a settings page that cannot help.
    expect(run.output).not.toContain('Host key verification failed');
  });

  test('and the operator is not asked for a deploy key for it', () => {
    // A deploy key registered at GitLab would change nothing while this stack
    // trusts no GitLab host key.
    expect(run.output).not.toContain('::aiw-git-key-required::github.com_acme_flows');
    expect(run.output).not.toContain('gitlab.com/acme/flows/settings/keys/new');
  });
});

describe('A10-19 the parser is unchanged, and github.com is unaffected', () => {
  test('the GitLab declaration still parses, with its host and path', () => {
    // The refusal belongs at clone time. A parser that rejected the entry would
    // break A3c-2 and would make the eventual Forgejo support a parser change
    // rather than a host-keys change.
    const parsed = parseDeclaration(GITLAB);
    expect(parsed.code).toBe(0);
    expect(parsed.stdout).toContain('gitlab.com');
    expect(parsed.stdout).toContain('acme/flows');
  });

  test('and the github.com repository in the same run is cloned', () => {
    expect({ cloned: github.cloned, error: github.error }).toEqual({ cloned: true, error: null });
    expect(existsSync(join(project, 'volumes', 'repos', 'agent-skills', '.git'))).toBe(true);
  });
});
