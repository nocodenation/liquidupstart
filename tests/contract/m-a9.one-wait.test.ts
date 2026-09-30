/**
 * A9-1, A9-10 — one deadline, and a way out of every wait.
 *
 * Purpose: the start waits on the operator in five places now — four sign-ins
 * and the deploy key. Before 2026-09-17 each sign-in carried its own copy of the
 * deadline (`900`, four times in `config/scripts/start/openclaw.sh`) and none of
 * them could be skipped: waiting the fifteen minutes out or killing the start
 * were the only ways past. Review point 2 of #9.
 *
 * Given  the two start scripts and the dashboard's runner component as text
 * When   they are read for the deadline and for the way out
 * Then   no literal deadline remains, both scripts read the same key, every
 *        credential panel offers Skip, and the skip is cleared once per start
 *
 * Requirements covered: A9-1, A9-10, review point 2 of #9.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const read = (f: string) => readFileSync(join(repoRoot, f), 'utf8');
const OPENCLAW = read('config/scripts/start/openclaw.sh');
const GIT = read('config/scripts/start/git.sh');
const START = read('scripts/linux/start.sh');
const RUNNER = read('dashboard/src/lib/components/TaskRunner.svelte');

describe('A9-1 the deadline is one value', () => {
  test('no start script carries a literal fifteen minutes any more', () => {
    // Four copies lived in openclaw.sh. A second constant to keep in step is
    // exactly what review point 2 asked to avoid.
    const offenders = [
      ['config/scripts/start/openclaw.sh', OPENCLAW],
      ['config/scripts/start/git.sh', GIT]
    ].filter(([, body]) => /\+ 900 \)\)/.test(body as string)).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  test('and both waits read the same key, through the same helper', () => {
    expect(OPENCLAW).toContain('lib/wait-for-operator.sh');
    expect(GIT).toContain('lib/wait-for-operator.sh');
    // The helper reads .env itself rather than calling the caller's get_env:
    // openclaw.sh has one, git.sh does not, and the missing function left the
    // deadline empty instead of failing loudly.
    expect(read('config/scripts/start/lib/wait-for-operator.sh')).toContain(
      "^SYSTEM_SIGNIN_WAIT_SECONDS="
    );
    expect(read('.env.example')).toMatch(/^SYSTEM_SIGNIN_WAIT_SECONDS=\d+$/m);
  });

  test('and the skip directory is cleared once per start, before anything waits', () => {
    // A skip belongs to one run. Cleared after the waits would be worse than not
    // clearing at all: the step would be skipped and then forgotten.
    const clear = START.indexOf('lu_clear_skips');
    const git = START.indexOf('config/scripts/start/git.sh');
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(git);
  });
});

describe('A9-10 every wait offers a way out', () => {
  test('each credential panel has a Skip button', () => {
    const missing = ['claude', 'copilot', 'codex', 'grok'].filter(
      (step) => !RUNNER.includes(`skipStep('${step}')`)
    );
    expect(missing).toEqual([]);
  });

  test('and the deploy key has a panel of its own, not only a line in the log', () => {
    // Review point 1 asks for the key screen "the same way the Claude login
    // screen is shown". A marker in the log that only the log renders is not
    // that: an operator would have to scroll a running build to find it. The
    // panel reads the key and the link from /git-auth, so it cannot drift from
    // what the repositories card shows.
    expect(RUNNER).toContain('::aiw-git-key-required::');
    expect(RUNNER).toContain('gitKeyRepo?.deployKeyUrl');
    expect(RUNNER).toContain('gitKeyRepo?.publicKey');
    expect(RUNNER).toContain('skipStep(`git-key-${needGitKey}`)');
  });

  test('and the key can be copied, and wraps inside the panel', () => {
    // Both reported from the running dashboard on 2026-09-17: the key ran past
    // the frame, and an operator on the way to GitHub had to select a wrapped
    // key by hand. The repositories card had solved both -- .gitkey-value wraps
    // with overflow-wrap:anywhere and .gitkey-copy sits beside it -- so the panel
    // uses the same classes rather than new ones.
    expect(RUNNER).toContain('class="gitkey-value"');
    expect(RUNNER).toContain('gitkey-copy');
    expect(RUNNER).toContain('copyGitKey');
    expect(RUNNER).not.toContain('class="keybox"');
  });

  test('and the banner in the scripts names the command that does the same', () => {
    // The dashboard is not the only way in. An operator at a terminal gets the
    // path to touch, from the same helper that reads it.
    expect(OPENCLAW).toContain('lu_skip_hint');
    expect(GIT).toContain('lu_skip_hint');
  });

  test('and no wait is called bare, because a non-zero status would end the start', () => {
    // The helper returns 1 for a skip and 2 for the deadline. Under
    // `set -euo pipefail` a bare command with a non-zero status ends the script,
    // so a sign-in nobody completed took the whole start down with it -- measured
    // 2026-09-17, git.sh exited 2 instead of continuing. Every call captures the
    // status instead.
    const offenders = [
      ['config/scripts/start/openclaw.sh', OPENCLAW],
      ['config/scripts/start/git.sh', GIT]
    ]
      .flatMap(([name, body]) =>
        (body as string)
          .split('\n')
          .map((line, i) => ({ name, line, n: i + 1 }))
          // The env prefix counts: `LU_SKIP_GROUP=… lu_wait_for_operator …` is
          // the same call, and a guard that only sees the bare name would miss
          // every call that joined a skip group.
          .filter(({ line }) => /^\s*(\w+=\S*\s+)*lu_wait_for_operator /.test(line))
          .filter(({ line }) => !/\|\| _wait_rc=\$\?/.test(line) && !/\\$/.test(line))
      )
      .map(({ name, n, line }) => `${name}:${n}  ${line.trim()}`);
    expect(offenders).toEqual([]);
  });

  test('and a queue of keys is announced as a queue', () => {
    // The operator asked what happens with more than one unregistered key. The
    // answer has to be visible before the first wait: git.sh names the whole set
    // in one marker, and the panel says which of them it is asking for now.
    expect(GIT).toContain('::aiw-git-keys-pending::');
    expect(RUNNER).toContain('::aiw-git-keys-pending::');
    expect(RUNNER).toContain('gitKeysPending.length');
    expect(RUNNER).toContain('gitKeyNumber');
  });

  test('and one click can end the whole queue', () => {
    // "Skip all": every pending step gets its own sentinel, so the wait in
    // progress ends on its own file like any other skip, and the group file
    // covers the ones not reached yet. The shell side opts in by name --
    // LU_SKIP_GROUP -- so no other wait can be swept up by it.
    expect(RUNNER).toContain('skipAllGitKeys');
    expect(RUNNER).toContain("skipStep('git-key-all')");
    expect(RUNNER).toContain('skipStep(`git-key-${slug}`)');
    expect(GIT).toContain('LU_SKIP_GROUP=git-key-all');
    expect(read('config/scripts/start/lib/wait-for-operator.sh')).toContain('LU_SKIP_GROUP');
  });

  test('and the deadline is the start\'s, so keys do not multiply it', () => {
    // Per wait, three missing keys meant three times SYSTEM_SIGNIN_WAIT_SECONDS
    // on an unattended host. The budget is fixed once, where the skips are
    // cleared, and every wait after that shares it.
    const LIB = read('config/scripts/start/lib/wait-for-operator.sh');
    expect(LIB).toContain('lu_budget_deadline');
    const clear = LIB.indexOf('lu_clear_skips()');
    expect(LIB.slice(clear, LIB.indexOf('}', LIB.indexOf('.deadline', clear)))).toContain(
      '.deadline'
    );
  });

  test('and the runner component stays JavaScript, because its script block is', () => {
    // Its <script> has no lang="ts". A type annotation there is a syntax error
    // that the dashboard's own test suite does not catch, because it never
    // compiles the component -- found on 2026-09-17 by writing one.
    const script = RUNNER.slice(RUNNER.indexOf('<script>'), RUNNER.indexOf('</script>'));
    expect(script).not.toMatch(/\)\s*:\s*(string|number|boolean|void)\b/);
    expect(script).not.toMatch(/\$state<[^>]+>\(/);
    expect(script).not.toMatch(/function \w+\([^)]*:\s*(string|number|boolean)\b/);
  });
});
