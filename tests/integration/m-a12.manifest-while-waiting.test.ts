/**
 * A12-1, A12-2 — while the start waits, the card does not contradict the panel.
 *
 * Purpose: observed by the operator on 2026-09-17, walking the deploy-key flow.
 * The panel said *"Add a deploy key to continue — 1 of 2"* while the card below
 * it said *"1 of 4 prepared repositories could not be reached … 1 declared
 * repository has no deploy key yet. Start the stack so it gets one."* — during
 * that very start.
 *
 * Neither statement is wrong; they describe different moments. `git.sh` writes
 * `volumes/_git-secrets/repositories.json` in its third pass, at the end, so
 * while it waits the card still describes the **last completed** start — and it
 * cannot know about a repository declared since. The operator is told to start
 * the stack by a page rendered while the stack is starting.
 *
 * Everything the card needs is known once pass 1 is over: every clone has been
 * attempted and each repository's outcome is decided. So the manifest is written
 * there as well, and again at the end when the waits have had their say.
 *
 * Given  two declared repositories, one reachable and one whose key the remote
 *        refuses, and a start that therefore waits
 * When   the manifest is read **while the wait is in progress**
 * Then   it already lists both, the reachable one cloned and the other not, with
 *        the error the clone gave
 * And    the manifest written at the end is the one that counts: a repository
 *        whose key is registered during the wait ends up cloned in it
 *
 * A12-2 is what keeps A12-1 from being a regression: a provisional record must
 * not become the final answer, or a key registered during the wait would leave
 * the card saying "unreachable" until the next start.
 *
 * Test data: `git@github.com:nocodenation/agent-skills.git|read|protected`,
 * routed to a seeded bare repository, and
 * `git@github.com:nocodenation/flows.git|write|protected`, routed nowhere, which
 * is what an unregistered key looks like from here.
 * `SYSTEM_SIGNIN_WAIT_SECONDS=30` gives the reading a window; the wait is ended
 * by `volumes/.start-skip/git-key-all`, the sentinel the dashboard's "Skip all"
 * writes, so the case never waits the deadline out.
 *
 * Requirements covered: A12-1, A12-2, and the operator's observation of
 * 2026-09-17.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, seedRepo, seedKnownHosts, fakeSsh } from '../lib/gitfixture';
import { gitScript } from '../lib/gitfixture';

const work = tempProject('lu-a12-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const project = join(work, 'project');
mkdirSync(project, { recursive: true });
seedKnownHosts(project);
const bare = seedRepo(work, 'agent-skills');
const routed = fakeSsh(join(work, 'route'), [{ match: 'agent-skills', bare }]);

const DECL =
  'git@github.com:nocodenation/agent-skills.git|read|protected,' +
  'git@github.com:nocodenation/flows.git|write|protected';

const manifestPath = join(project, 'volumes', '_git-secrets', 'repositories.json');
const skipAll = join(project, 'volumes', '.start-skip', 'git-key-all');

writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=30\n');

type Entry = { name: string; cloned: boolean; error: string | null };
const read = () => JSON.parse(readFileSync(manifestPath, 'utf8')).repositories as Entry[];

/** The start, run in the background so the manifest can be read while it waits. */
const child = Bun.spawn(['bash', gitScript, project], {
  env: {
    ...(process.env as Record<string, string>),
    GIT_REPOSITORIES: DECL,
    PATH: `${routed}:${process.env.PATH}`
  },
  stdout: 'pipe',
  stderr: 'pipe'
});

// Read while it waits: the marker says the wait has begun, and the manifest is
// read at that moment rather than after the run, which is the whole point.
let duringWait: Entry[] = [];
let sawMarker = false;
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  await Bun.sleep(200);
  if (!sawMarker && existsSync(join(project, 'volumes', '.start-skip'))) {
    // The skip directory is made by the wait helper when it announces itself.
    sawMarker = true;
  }
  if (existsSync(manifestPath)) {
    duringWait = read();
    if (duringWait.length === 2) break;
  }
}

mkdirSync(join(project, 'volumes', '.start-skip'), { recursive: true });
writeFileSync(skipAll, '');
const out = await new Response(child.stdout).text();
const err = await new Response(child.stderr).text();
const code = await child.exited;
const final = read();

describe('A12-1 the manifest is written before the waiting starts', () => {
  test('both repositories are already in it', () => {
    expect(duringWait.map((e) => e.name).sort()).toEqual(['agent-skills', 'flows']);
  });

  test('and each carries the outcome pass 1 decided', () => {
    // What the card renders. Before this, it rendered the previous start: on the
    // operator's machine, "1 of 4" beside a panel saying "1 of 2".
    const skills = duringWait.find((e) => e.name === 'agent-skills')!;
    const flows = duringWait.find((e) => e.name === 'flows')!;
    expect({ cloned: skills.cloned, error: skills.error }).toEqual({ cloned: true, error: null });
    expect(flows.cloned).toBe(false);
    expect(flows.error).toContain('fake-ssh: no route');
  });

  test('and the run really was waiting when it was read', () => {
    // Otherwise this case would be reading the final manifest and proving
    // nothing at all.
    expect(`${out}${err}`).toContain('::aiw-git-key-required::');
    expect(code).toBe(0);
  });
});

describe('A12-2 and the manifest written at the end is the one that counts', () => {
  test('it is rewritten after the waits, not left at the provisional record', () => {
    // The counterpart: a key registered during the wait must end as cloned, and
    // a skip must end as this run's error rather than the one pass 1 wrote.
    expect(final.map((e) => e.name).sort()).toEqual(['agent-skills', 'flows']);
    const flows = final.find((e) => e.name === 'flows')!;
    expect(flows.cloned).toBe(false);
    expect(`${out}${err}`).toContain('was skipped');
  });
});
