/**
 * M-A7 · Integration · One clone, two publications, one permission each
 *
 * Purpose:  The case A6-8 could not construct. A6-8 shows that a *spent* token
 *           does not admit a second push; this asks what happens when the second
 *           publication begins before the first has returned, which is the only
 *           way one push can ride on a permission it did not create. The proof
 *           of passage is one file per clone (FR18), `git-publish` writes it
 *           immediately before pushing and removes it afterwards, and nothing in
 *           between stops a second invocation writing it again or finding one
 *           already there. FR33 requires that this be safe or refuse, and the
 *           case asserts tokens rather than successes: both branches landing and
 *           one being refused are equally acceptable outcomes, so counting
 *           successes would assert the timing of the run rather than the rule.
 * Given:    A throwaway declaration `git@localhost:e2e.git|write|protected` in a
 *           temporary project under `volumes/repos/.a7-race-<pid>`, its remote a
 *           local bare repository seeded from `README.md` holding `seed` on
 *           `main`, and the clone the start script made from it — the same
 *           arrangement as A7-1, viewed from the host rather than the container,
 *           because the token lives in the clone and the race is between two
 *           processes, not between two machines. In that clone, from `main`:
 *           `agent/probe-1` carrying `one.md` with `one` committed as `one`, and
 *           `agent/probe-2` carrying `two.md` with `two` committed as `two`.
 *           `agent/probe-3` carrying `three.md` with `three` exists too, for the
 *           precondition below. `.env` is not read or written.
 * When:     First, with no token present, `git push origin agent/probe-3` is run
 *           raw — the precondition, which establishes that consuming a token is
 *           a real event in this clone rather than an assumption the accounting
 *           rests on. Then `git-publish` is started on `agent/probe-1` and, 50 ms
 *           later and before it has returned, a second `git-publish` on
 *           `agent/probe-2`; both are waited for. The `ssh` stand-in holds the
 *           connection for half a second before the remote answers, so that the
 *           two invocations certainly overlap instead of merely being started
 *           close together; the case asserts the overlap rather than assuming
 *           it, by comparing when the second began with when the first
 *           returned.
 * Then:     The raw push is refused by the hook, naming `git-publish`. Both
 *           invocations minted a permission — neither was turned away by a rule
 *           before reaching the push — so the overlap was real. Every branch that
 *           reached the remote belongs to an invocation whose own token was
 *           consumed, and every invocation whose token was consumed put its
 *           branch on the remote: a push admitted by a permission another
 *           invocation minted would break that equality in one direction, and a
 *           permission consumed by nothing would break it in the other. No token
 *           remains once both have returned, and any invocation that was refused
 *           said so in words. Which of the two acceptable outcomes occurs
 *           depends on the interleaving and is deliberately not asserted.
 * Covers:   A7-4, FR33, FR18
 * Unhappy:  This file is the unhappy half of the milestone's concurrency pair;
 *           A7-3 is the positive counterpart, where two clones publish at once
 *           and both must land.
 * Note:     Counting is done from what the two invocations printed, because the
 *           token is one path and two writes to it collapse into one file: an
 *           invocation that prints `git-publish refused:` never minted, and one
 *           that prints the hook's `did not come through git-publish` minted a
 *           permission that something else consumed. `ssh` is stood in for on
 *           PATH and routes to the local bare repository; the declaration parser
 *           accepts SSH URLs only and no sshd runs here.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  chainFixture,
  dropChainFixture,
  gitOnHost,
  publishOnHost,
  commit,
  git,
  PUBLISH_TOKEN,
  publishCommand,
  START_SCRIPT_BUDGET
} from '../lib/gitfixture';

const fx = chainFixture('race', ['e2e'], 'host');
afterAll(() => dropChainFixture(fx));

const clone = fx.clone('e2e');
const bare = fx.bare('e2e');
const token = join(clone, '.git', PUBLISH_TOKEN);

const branches = ['agent/probe-1', 'agent/probe-2', 'agent/probe-3'];
const files: Record<string, Record<string, string>> = {
  'agent/probe-1': { 'one.md': 'one\n' },
  'agent/probe-2': { 'two.md': 'two\n' },
  'agent/probe-3': { 'three.md': 'three\n' }
};
const local: Record<string, string> = {};

if (fx.start.code === 0) {
  for (const branch of branches) {
    git(clone, ['checkout', '-q', '-b', branch, 'main']);
    commit(clone, files[branch], branch.slice('agent/probe-'.length));
    local[branch] = git(clone, ['rev-parse', 'HEAD']).stdout.trim();
  }
}

const rawPush = gitOnHost(clone, ['push', 'origin', 'agent/probe-3'], fx.hostBin);

const RACE_DELAY = { A7_SSH_DELAY: '0.5' };

git(clone, ['checkout', '-q', 'agent/probe-1']);
const first = publishOnHost(clone, fx.hostBin, RACE_DELAY).then((r) => ({ ...r, at: Date.now() }));
await Bun.sleep(50);
const secondStartedAt = Date.now();
const second = (async () => {
  const p = Bun.spawn(['sh', '-c', `git checkout -q agent/probe-2 && exec ${publishCommand}`], {
    cwd: clone,
    env: {
      ...(process.env as Record<string, string>),
      LC_ALL: 'C',
      PATH: `${fx.hostBin}:${process.env.PATH}`,
      ...RACE_DELAY
    },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const stdout = await new Response(p.stdout).text();
  const stderr = await new Response(p.stderr).text();
  const code = await p.exited;
  return { code, stdout, stderr, output: stdout + stderr, at: Date.now() };
})();

const overlapping = await Promise.all([first, second]);

const invocations = [
  { branch: 'agent/probe-1', result: overlapping[0] },
  { branch: 'agent/probe-2', result: overlapping[1] }
].map(({ branch, result }) => {
  const minted = !result.output.includes('git-publish refused:');
  const consumed = minted && !result.output.includes('did not come through git-publish');
  const onRemote = git(bare, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).stdout.trim();
  return { branch, result, minted, consumed, accepted: onRemote === local[branch], onRemote };
});

test('A7-4 the arrangement is the one the start script made', () => {
  expect(fx.start.code).toBe(0);
  expect(existsSync(join(clone, '.git', 'HEAD'))).toBe(true);
  expect(git(clone, ['config', '--get', 'liquidupstart.policy']).stdout.trim()).toBe('protected');
}, START_SCRIPT_BUDGET);

test('A7-4 consuming a permission is a real event here: a push without one is refused', () => {
  expect(rawPush.code).not.toBe(0);
  expect(rawPush.output).toContain('pre-push refused');
  expect(rawPush.output).toContain('did not come through git-publish');
  expect(git(bare, ['rev-parse', '--verify', '--quiet', 'refs/heads/agent/probe-3']).stdout.trim()).toBe('');
});

test('A7-4 the second publication began before the first had returned', () => {
  expect(secondStartedAt).toBeLessThan(overlapping[0].at);
  expect(secondStartedAt).toBeLessThan(overlapping[1].at);
});

test('A7-4 both invocations minted a permission, so the overlap was real', () => {
  for (const inv of invocations) {
    expect({ branch: inv.branch, minted: inv.minted, said: inv.result.output.trim() }).toEqual({
      branch: inv.branch,
      minted: true,
      said: inv.result.output.trim()
    });
  }
});

test('A7-4 every push that landed consumed a permission of its own', () => {
  for (const inv of invocations) {
    expect({ branch: inv.branch, accepted: inv.accepted, consumed: inv.consumed }).toEqual({
      branch: inv.branch,
      accepted: inv.consumed,
      consumed: inv.consumed
    });
  }
  expect(invocations.filter((i) => i.accepted)).toHaveLength(
    invocations.filter((i) => i.consumed).length
  );
});

test('A7-4 an invocation that was refused says what happened', () => {
  for (const inv of invocations.filter((i) => !i.accepted)) {
    expect(inv.result.code).not.toBe(0);
    expect(inv.result.output).toMatch(/refused/);
    expect(inv.result.output).toContain('git-publish');
  }
  const landed = git(bare, ['branch', '--list', 'agent/*']).stdout;
  for (const inv of invocations) {
    if (inv.accepted) expect(landed).toContain(inv.branch);
    else expect(landed).not.toContain(inv.branch);
  }
});

test('A7-4 no permission is left behind once both have returned', () => {
  expect(existsSync(token)).toBe(false);
});
