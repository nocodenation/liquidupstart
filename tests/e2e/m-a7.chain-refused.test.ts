/**
 * M-A7 · End-to-end · The same chain, aimed at the protected default branch
 *
 * Purpose:  A chain test that only ever succeeds proves the happy path and
 *           hides the guard. This is A7-1's chain with one thing changed — the
 *           branch the work sits on — so that a refusal here is attributable to
 *           the branch rule and not to the arrangement, and so that the chain is
 *           shown to stop where it should rather than only to reach its end.
 * Given:    A second instance of the A7-1 fixture, in its own temporary project
 *           under `volumes/repos/.a7-stop-<pid>`: the declaration
 *           `git@localhost:e2e.git|write|protected`, a local bare remote seeded
 *           from `README.md` holding `seed` on `main`, and the clone the start
 *           script made from it. Its own instance rather than A7-1's, so that
 *           "agent/probe never appears" is a claim about this run and not a
 *           leftover from that one.
 * When:     Inside openclaw-gateway, `direct.md` holding `direct` is committed
 *           as `add direct note` on `main`, and `git-publish` is run there.
 * Then:     The publish exits non-zero and refuses in its own words, naming
 *           `main` and `protected` and offering `git switch -c agent/<name>`;
 *           `e2e.git` still holds `seed` on `main`, `agent/probe` does not exist
 *           on it at all, and no token was left in the clone.
 * Covers:   A7-2, FR32, §1.3, U4
 * Unhappy:  This file is the unhappy half of the milestone's chain, and it runs
 *           the same start script, the same clone and the same command as A7-1
 *           so neither half can pass because of the environment rather than the
 *           rule.
 * Note:     The refusal is `git-publish`'s, not the hook's: the command reads
 *           the declaration before it mints a permission, so the push is never
 *           attempted. That the hook would refuse the same push is A5-5's; that
 *           nothing is minted when the command refuses is asserted here.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';
import { chainFixture, dropChainFixture, PUBLISH_TOKEN, START_SCRIPT_BUDGET } from '../lib/gitfixture';

const SERVICE = 'openclaw-gateway';

stackGuard([SERVICE]);

const fx = chainFixture('stop', ['e2e']);
afterAll(() => {
  inContainer(SERVICE, `rm -rf ${fx.containerRoot}`);
  dropChainFixture(fx);
});

const chain = inContainer(
  SERVICE,
  `export PATH=${fx.containerBin}:$PATH
cd ${fx.containerClone('e2e')} || exit 1
printf 'BRANCH=%s\\n' "$(git symbolic-ref --short HEAD)"
printf 'direct\\n' > direct.md
git add direct.md
git -c core.pager=cat commit -qm 'add direct note'
set +e
out="$(git-publish 2>&1)"; code=$?
set -e
printf 'PUBLISHEXIT=%s\\n' "$code"
printf '%s\\n' "$out" | sed 's/^/PUBLISH: /'
printf 'REMOTEMAIN=%s\\n' "$(git -C ${fx.containerBare('e2e')} log -1 --format=%s main)"
printf 'REMOTEREADME=%s\\n' "$(git -C ${fx.containerBare('e2e')} show main:README.md)"
printf 'REMOTEDIRECT=%s\\n' "$(git -C ${fx.containerBare('e2e')} rev-parse --verify --quiet main:direct.md >/dev/null && echo present || echo absent)"
printf 'REMOTEPROBE=%s\\n' "$(git -C ${fx.containerBare('e2e')} rev-parse --verify --quiet refs/heads/agent/probe >/dev/null && echo present || echo absent)"
printf 'TOKEN=%s\\n' "$(test -e .git/${PUBLISH_TOKEN} && echo present || echo none)"`
);

const line = (label: string) =>
  (chain.output.split('\n').find((l) => l.startsWith(`${label}=`)) ?? '').slice(label.length + 1);

test('A7-2 the chain is arranged on the protected default branch', () => {
  expect(fx.start.code).toBe(0);
  expect(line('BRANCH')).toBe('main');
}, START_SCRIPT_BUDGET);

test('A7-2 the publish is refused, naming the branch and the policy', () => {
  expect(line('PUBLISHEXIT')).not.toBe('0');
  expect(chain.output).toContain('PUBLISH: git-publish refused:');
  expect(chain.output).toContain('main is the default branch here');
  expect(chain.output).toContain('protected');
  expect(chain.output).toContain('git switch -c agent/');
}, 60000);

test('A7-2 the remote is exactly as the seed left it', () => {
  expect(line('REMOTEMAIN')).toBe('seed');
  expect(line('REMOTEREADME')).toBe('seed');
  expect(line('REMOTEDIRECT')).toBe('absent');
  expect(line('REMOTEPROBE')).toBe('absent');
}, 60000);

test('A7-2 a refused publish mints no permission', () => {
  expect(line('TOKEN')).toBe('none');
  expect(existsSync(join(fx.clone('e2e'), '.git', PUBLISH_TOKEN))).toBe(false);
});
