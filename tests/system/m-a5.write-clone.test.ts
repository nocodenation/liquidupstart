/**
 * M-A5 · System · The first write-capable clone: commit, and be refused by the hook
 *
 * Purpose:  Everything before this milestone was read-only, so the guardrail
 *           itself never answered: with a read-only key the host refuses while
 *           git is still connecting, and pre-push never runs. A write-capable
 *           clone changes that. This proves, inside the container an agent
 *           works in, that an ordinary commit on a feature branch lands under
 *           the configured identity, that a push to the protected default
 *           branch is refused by the hook in its own words, and that a `.env`
 *           in the pushed commits is refused by the scan — all against a local
 *           bare repository, so nothing reaches any real remote. The operator's
 *           own working copy at the project root is bracketed: its status and
 *           HEAD are captured before the cases and compared after.
 * Given:    The running stack. Inside openclaw-gateway, under a directory named
 *           /repos/.a5-probe-<pid> — unique per run, so no run depends on a
 *           previous run's teardown having propagated across the bind mount:
 *           a bare `beta.git` seeded with `README.md` holding `seed` on `main`,
 *           and a clone `work` of it configured liquidupstart.access=write and
 *           liquidupstart.policy=protected, governed by the hook through the
 *           system git configuration the start script installs.
 * When:     A5-3 commits `notes.md` holding `probe` as `add probe note` on
 *           `feature/probe`. A5-4 makes the same commit on `main` and pushes
 *           it. A5-5 commits `.env` holding `API_KEY="fixture-not-a-real-secret"`
 *           on `feature/probe` and pushes that branch.
 * Then:     The commit lands with the identity the container carries. Both
 *           pushes exit non-zero with `pre-push refused` in the output — the
 *           first naming `main` and `protected`, the second naming `.env` — and
 *           `beta.git` still holds only the seed on `main` and no
 *           `feature/probe` at all. The project root's `git status --short` and
 *           `HEAD` are identical before and after.
 * Covers:   A5-3, A5-4, A5-5, A5-6, U3, U4, U7, FR2, FR5, NFR1, NFR3, §1.3
 * Note:     The setup runs at import time and its output is asserted before its
 *           exit code, so a failed fixture reports what git said rather than
 *           only "expected 0, received 1".
 * Unhappy:  A5-4 and A5-5 are refusals; A5-3 is their counterweight in the
 *           same clone, showing the clone, the identity and the commit all
 *           work and only the push is stopped. The `.env` value is synthetic on
 *           purpose: no real value is committed even to a local fixture.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { HOOKS_MOUNT } from '../lib/gitfixture';

const SERVICE = 'openclaw-gateway';
const PROBE = `/repos/.a5-probe-${process.pid}`;
const REMOTE = `${PROBE}/beta.git`;
const WORK = `${PROBE}/work`;

const workingCopy = () => ({
  status: sh(['git', 'status', '--short'], repoRoot).stdout,
  head: sh(['git', 'rev-parse', 'HEAD'], repoRoot).stdout.trim()
});
const before = workingCopy();

stackGuard([SERVICE]);

afterAll(() => {
  inContainer(SERVICE, 'rm -rf /repos/.a5-probe*');
  const repos = join(repoRoot, 'volumes', 'repos');
  if (!existsSync(repos)) return;
  for (const name of readdirSync(repos).filter((n) => n.startsWith('.a5-probe'))) {
    rmSync(join(repos, name), { recursive: true, force: true });
  }
});

const effective = (key: string) => inContainer(SERVICE, `printf '%s' "$${key}"`).stdout.trim();

const setup = inContainer(
  SERVICE,
  `set -eu
rm -rf ${PROBE}
mkdir -p ${PROBE}
cd ${PROBE}
git init -q --bare --initial-branch=main beta.git
git init -q -b main seed
cd seed
git config user.name Seed; git config user.email seed@local
echo seed > README.md; git add README.md; git commit -qm seed
git remote add origin ${REMOTE}; git push -q origin main
cd ${PROBE}
git clone -q ${REMOTE} work
cd work
git config liquidupstart.access write
git config liquidupstart.policy protected
printf 'HOOKSPATH=%s\\n' "$(git config --get core.hooksPath)"
printf 'ACCESS=%s\\n' "$(git config --get liquidupstart.access)"
printf 'DEFAULT=%s\\n' "$(git symbolic-ref --short refs/remotes/origin/HEAD)"`
);

test('A5-3 the write-capable clone exists in the container and is governed by the hook', () => {
  expect(setup.output).toContain(`HOOKSPATH=${HOOKS_MOUNT}`);
  expect(setup.code).toBe(0);
  expect(setup.output).toContain('ACCESS=write');
  expect(setup.output).toContain('DEFAULT=origin/main');
}, 60000);

test('A5-3 an agent commits on a feature branch inside the clone, under the configured identity', () => {
  const r = inContainer(
    SERVICE,
    `set -eu
cd ${WORK}
git checkout -q -b feature/probe
printf 'probe\\n' > notes.md
git add notes.md
git -c core.pager=cat commit -qm 'add probe note'
git log -1 --format='AUTHOR=%an <%ae>|COMMITTER=%cn <%ce>|SUBJECT=%s'`
  );
  expect(r.code).toBe(0);
  const expected = `${effective('GIT_USER_NAME')} <${effective('GIT_USER_EMAIL')}>`;
  expect(r.stdout).toContain(`AUTHOR=${expected}`);
  expect(r.stdout).toContain(`COMMITTER=${expected}`);
  expect(r.stdout).toContain('SUBJECT=add probe note');
}, 60000);

test("A5-3 the operator's own working copy is where it was after the commit", () => {
  expect(workingCopy()).toEqual(before);
});

test('A5-4 a push to the protected default branch is refused by the hook, not by a host', () => {
  const r = inContainer(
    SERVICE,
    `set -eu
cd ${WORK}
git checkout -q main
printf 'probe\\n' > notes.md
git add notes.md
git -c core.pager=cat commit -qm 'add probe note'
set +e; out="$(git push origin main 2>&1)"; code=$?; set -e
printf 'PUSHEXIT=%s\\n' "$code"
printf 'REMOTEHEAD=%s\\n' "$(git -C ${REMOTE} log -1 --format=%s main)"
printf '%s\\n' "$out" | sed 's/^/PUSH: /'`
  );
  expect(r.output).toContain('PUSHEXIT=');
  expect(r.output).not.toContain('PUSHEXIT=0');
  expect(r.output).toContain('REMOTEHEAD=seed');
  expect(r.output).toContain('pre-push refused');
  expect(r.output).toContain('main');
  expect(r.output).toContain('protected');
  expect(r.output).toContain('feature branch');
  expect(r.output).not.toMatch(/Permission denied|Repository not found|could not read Username/i);
}, 60000);

test('A5-5 a push whose commits add .env is refused by the secret scan, and nothing reaches the remote', () => {
  const r = inContainer(
    SERVICE,
    `set -eu
cd ${WORK}
git checkout -q feature/probe
printf 'API_KEY="fixture-not-a-real-secret"\\n' > .env
git add .env
git -c core.pager=cat commit -qm 'add env'
set +e; out="$(git push origin feature/probe 2>&1)"; code=$?; set -e
printf 'PUSHEXIT=%s\\n' "$code"
printf 'FEATUREONREMOTE=%s\\n' "$(git -C ${REMOTE} rev-parse --verify --quiet refs/heads/feature/probe >/dev/null && echo yes || echo no)"
printf 'REMOTEHEAD=%s\\n' "$(git -C ${REMOTE} log -1 --format=%s main)"
printf '%s\\n' "$out" | sed 's/^/PUSH: /'`
  );
  expect(r.output).toContain('PUSHEXIT=');
  expect(r.output).not.toContain('PUSHEXIT=0');
  expect(r.output).toContain('FEATUREONREMOTE=no');
  expect(r.output).toContain('REMOTEHEAD=seed');
  expect(r.output).toContain('pre-push refused');
  expect(r.output).toContain('.env');
}, 60000);

test("A5-6 the operator's working copy is untouched after the system cases", () => {
  const after = workingCopy();
  expect(after.head).toBe(before.head);
  expect(after.status).toBe(before.status);
});
