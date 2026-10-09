/**
 * A13-7, A13-8 — the Claude panel opens for Claude, not for any banner.
 *
 * Purpose: finding 4 of Timur's follow-up review of #9 (2026-09-18), observed on
 * a running start. With `ENABLE_ANTHROPIC_CLAUDE_CODE=0` the dashboard showed the
 * Claude Code sign-in panel anyway.
 *
 * `openclaw.sh` prints its Claude banner only when `ENABLE_CLAUDE_CLI` is 1, and
 * `/claude-auth` answers `needed: false` when the key is not 1. The panel is tied
 * to neither. It opens on a substring:
 *
 *   if (!authOk && authProbe === 'unknown' && task.log.includes('ACTION REQUIRED'))
 *     needClaudeAuth = true;
 *
 * `authProbe` is `unknown` for as long as the stack is down, and since M-A9
 * `git.sh` prints the same `=== ACTION REQUIRED ===` banner when a deploy key is
 * missing. So a missing deploy key opened the Claude sign-in panel, and set
 * `authPending`, which holds the page in "waiting for sign-in" for a provider
 * that is switched off. A regression of M-A9's own making: the banner text was
 * borrowed, and the borrowing was invisible because the two never appeared in one
 * log before.
 *
 * Copilot, Codex and Grok already do this correctly — each prints a marker of its
 * own (`::aiw-copilot-auth-required::` and so on) and the panel matches that.
 * Claude is brought into line rather than the other three loosened.
 *
 * Given  the start scripts and the runner component, read as text, and a git.sh
 *        run whose deploy key is missing
 * When   the Claude panel's condition is examined, and the git banner is produced
 * Then   the panel keys on `::aiw-claude-auth-required::`, that marker is printed
 *        beside the Claude banner and nowhere else, and a run that only wants a
 *        deploy key never prints it
 *
 * A13-8 is the counterpart that keeps the fix from being "the panel never opens":
 * the marker has to sit inside the branch that actually waits for a Claude
 * sign-in, which is the branch guarded by `ENABLE_CLAUDE_CLI`.
 *
 * Test data: `config/scripts/start/openclaw.sh` and
 * `dashboard/src/lib/components/TaskRunner.svelte` as text; and a `git.sh` run
 * declaring `git@github.com:nocodenation/agent-skills.git|read|protected`
 * against a refusing ssh stand-in, with `SYSTEM_SIGNIN_WAIT_SECONDS=0` so it
 * prints its banner and returns.
 *
 * Requirements covered: A13-7, A13-8, finding 4 of the #9 follow-up.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { tempProject, seedKnownHosts, fakeSsh, runStart } from '../lib/gitfixture';

const OPENCLAW = readFileSync(join(repoRoot, 'config/scripts/start/openclaw.sh'), 'utf8');
const RUNNER = readFileSync(
  join(repoRoot, 'dashboard/src/lib/components/TaskRunner.svelte'),
  'utf8'
);

const MARKER = '::aiw-claude-auth-required::';

describe('A13-7 the panel keys on a marker of its own', () => {
  test('the bare banner no longer opens the Claude panel', () => {
    // The whole finding: `ACTION REQUIRED` is a banner anyone may print, and
    // since M-A9 the git step does.
    const opens = RUNNER.split('\n').filter(
      (l) => /needClaudeAuth = true/.test(l) || /includes\('ACTION REQUIRED'\)/.test(l)
    );
    expect(opens.join('\n')).not.toContain("includes('ACTION REQUIRED')");
    expect(RUNNER).toContain(MARKER);
  });

  test('and the other three providers are unchanged, because they were right', () => {
    for (const marker of [
      '::aiw-copilot-auth-required::',
      '::aiw-codex-auth-required::',
      '::aiw-grok-auth-required::'
    ]) {
      expect(RUNNER).toContain(marker);
      expect(OPENCLAW).toContain(marker);
    }
  });
});

describe('A13-8 and the marker is printed where a Claude sign-in is actually waited for', () => {
  test('it sits beside the banner, inside the branch ENABLE_CLAUDE_CLI guards', () => {
    // The counterpart. A marker printed nowhere would satisfy A13-7 and leave the
    // panel unreachable; a marker printed unconditionally would reintroduce the
    // finding with a longer string.
    const at = OPENCLAW.indexOf(MARKER);
    expect(at).toBeGreaterThan(-1);
    const banner = OPENCLAW.indexOf(
      '=============================== ACTION REQUIRED ===============================',
      at
    );
    // Within a few lines of the banner it belongs to.
    expect(banner - at).toBeLessThan(400);
    expect(banner).toBeGreaterThan(at);

    // **And inside the branch, which this case claimed in its own title and never
    // asserted.** Strengthened 2026-10-09: the three assertions above are a
    // presence check and a distance, both of which a marker printed outside the
    // guard would satisfy -- which is the finding this case exists against. The
    // reviewer named it in B3 of the 2026-10-01 re-review: the registered mutation
    // renames the marker, so the presence check carries the entry and the title's
    // claim is carried by nothing.
    //
    // The guard sits at column 0, so "inside it" is: it opens before the marker,
    // and no top-level `fi` closes in between. Written against the script's shape
    // rather than a line number, which would go stale on the next edit.
    const guard = OPENCLAW.indexOf('if [[ "$ENABLE_CLAUDE_CLI" == "1" ]]; then');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(at);
    expect(OPENCLAW.slice(guard, at)).not.toContain('\nfi\n');
  });

  test('and it appears only in the Claude branch, not once per banner', () => {
    expect(OPENCLAW.split(MARKER).length - 1).toBe(1);
  });
});

describe('A13-7 a start that only wants a deploy key does not print it', () => {
  const work = tempProject('lu-a13-claude-');
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const project = join(work, 'project');
  mkdirSync(project, { recursive: true });
  seedKnownHosts(project);
  writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=0\n');
  const run = runStart(project, 'git@github.com:nocodenation/agent-skills.git|read|protected', {
    pathPrefix: fakeSsh(join(work, 'refuse'), [])
  });

  test('the git banner is there, and the Claude marker is not', () => {
    // Both halves in one run: the banner the operator needs, without the panel
    // that has nothing to do with it.
    expect(run.output).toContain('ACTION REQUIRED');
    expect(run.output).not.toContain(MARKER);
  });
});

/**
 * A13-9 — the repository card keeps its state per repository, not per name.
 *
 * Purpose: finding 5 of Timur's follow-up review of #9. `testing`, `copied`,
 * `copyFailed` and `result` all held `repo.name`. Since two declared
 * repositories may share a repository name — `acme/skills` and `other/skills`
 * are both "skills", which is the collision the Test button was moved to slugs
 * for — "Testing…", "Copied" and the result line appear on both cards at once,
 * or on the wrong one. The server side was corrected when the collision was
 * found; the component was not, so the two halves of one fix disagreed.
 *
 * Given  `GitRepositories.svelte` as text
 * When   its per-repository state is examined
 * Then   every piece of it is keyed by slug, which is unique by construction
 *
 * A text assertion rather than a rendered one: the dashboard's own suite does not
 * mount components, and what is being asserted is which field identifies a
 * repository — a property of the source, visible in it.
 *
 * Test data: the identifiers `repo.name` and `repo.slug` in that file.
 *
 * Requirements covered: A13-9, finding 5 of the #9 follow-up.
 */
describe('A13-9 the card is keyed by slug', () => {
  const CARD = readFileSync(
    join(repoRoot, 'dashboard/src/lib/components/GitRepositories.svelte'),
    'utf8'
  );

  test('no per-repository state is held by name', () => {
    const offenders = CARD.split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\brepo\.name\b/.test(line))
      .filter(({ line }) => !/^(\/\/|\*|<!--)/.test(line))
      .map(({ n, line }) => `GitRepositories.svelte:${n}  ${line}`);
    expect(offenders).toEqual([]);
  });

  test('and the slug is what it uses instead', () => {
    // The counterpart: a file that simply stopped naming repositories would pass
    // the assertion above.
    // `[repo.slug]:` since A14-8 gave every repository its own result slot --
    // the same rule one level further in, so the assertion follows it rather
    // than pinning the spelling it had on the day it was written.
    for (const use of ['testing = repo.slug', 'copied = repo.slug', '[repo.slug]']) {
      expect(CARD).toContain(use);
    }
  });
});
