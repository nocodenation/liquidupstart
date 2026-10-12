/**
 * M-A6 · System · An agent in the container reaches the remote through the path
 *
 * Purpose:  The unit and component cases prove the mechanism on the host, where
 *           the command is a file in the repository. In the container it is a
 *           read-only single-file mount that has to be on PATH under the name
 *           the skill and every refusal give — `git-publish`, not a path an
 *           agent has to be told. This case runs it there, the way an agent
 *           would, and then shows the other half in the same clone: a raw push
 *           from the same directory is refused and told to use the command.
 * Given:    The running stack. Inside openclaw-gateway, under
 *           /repos/.a6-probe-<pid> — unique per run, so no run depends on a
 *           previous run's teardown having propagated across the bind mount: a
 *           bare `beta.git` cloned from a seed holding `README.md` with `seed`
 *           on `main` — cloned rather than pushed to, because inside the
 *           container the hook now governs every repository and a seeding push
 *           would itself need the sanctioned path — and a clone `work`
 *           configured liquidupstart.access=write and
 *           liquidupstart.policy=protected, governed by the hook through the
 *           system git configuration the start script installs.
 * When:     `command -v git-publish` is run in both harnesses; then, on
 *           `agent/probe` carrying `notes.md` with `probe` committed as
 *           `add probe note`, `git-publish` is run with no arguments; then a
 *           second commit `add second note` is pushed with `git push`.
 * Then:     The command answers at /usr/local/bin/git-publish in both harnesses;
 *           the publish exits 0 and `beta.git` holds `agent/probe`; the raw push
 *           exits non-zero naming `git-publish`, and `beta.git` still holds only
 *           the published commit.
 * Covers:   A6-12, A6-6 in the place it matters, FR17, FR18, U1, U3, U8
 * Unhappy:  The raw push is the unhappy half and runs in the same container and
 *           the same clone as the happy one, so neither can pass because of the
 *           environment rather than the rule.
 * Note:     The remote is a local bare repository inside the container. Nothing
 *           reaches any real host, and the whole arrangement is removed
 *           afterwards.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inContainer, AGENT_CONTAINERS } from '../lib/stack';
import { stackGuard } from '../lib/guard';
import { repoRoot } from '../lib/paths';
import { PUBLISH_MOUNT, HOOKS_MOUNT } from '../lib/gitfixture';

const SERVICE = 'openclaw-gateway';
const PROBE = `/repos/.a6-probe-${process.pid}`;
const REMOTE = `${PROBE}/beta.git`;
const WORK = `${PROBE}/work`;

stackGuard([SERVICE]);

afterAll(() => {
  inContainer(SERVICE, 'rm -rf /repos/.a6-probe*');
  const repos = join(repoRoot, 'volumes', 'repos');
  if (!existsSync(repos)) return;
  for (const name of readdirSync(repos).filter((n) => n.startsWith('.a6-probe'))) {
    rmSync(join(repos, name), { recursive: true, force: true });
  }
});

const setup = inContainer(
  SERVICE,
  `set -eu
rm -rf ${PROBE}
mkdir -p ${PROBE}
cd ${PROBE}
git init -q -b main seed
cd seed
git config user.name Seed; git config user.email seed@local
echo seed > README.md; git add README.md; git commit -qm seed
cd ${PROBE}
git clone -q --bare seed beta.git
git clone -q ${REMOTE} work
cd work
git config liquidupstart.access write
git config liquidupstart.policy protected
git checkout -q -b agent/probe
printf 'probe\\n' > notes.md
git add notes.md
git -c core.pager=cat commit -qm 'add probe note'
printf 'HOOKSPATH=%s\\n' "$(git config --get core.hooksPath)"`
);

for (const service of AGENT_CONTAINERS) {
  test(`A6-12 git-publish is on PATH in ${service}, under that name`, () => {
    const r = inContainer(service, 'command -v git-publish');
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(PUBLISH_MOUNT);
  });
}

test('A6-12 the write-capable clone is in place and governed by the hook', () => {
  expect(setup.output).toContain(`HOOKSPATH=${HOOKS_MOUNT}`);
  expect(setup.code).toBe(0);
}, 60000);

test('A6-12 an agent publishes through the command, and the branch reaches the remote', () => {
  const r = inContainer(
    SERVICE,
    `cd ${WORK}
set +e; out="$(git-publish 2>&1)"; code=$?; set -e
printf 'PUBLISHEXIT=%s\\n' "$code"
printf 'ONREMOTE=%s\\n' "$(git -C ${REMOTE} rev-parse --verify --quiet refs/heads/agent/probe >/dev/null && echo yes || echo no)"
printf '%s\\n' "$out" | sed 's/^/PUBLISH: /'`
  );
  expect(r.output).toContain('PUBLISHEXIT=0');
  expect(r.output).toContain('ONREMOTE=yes');
  expect(r.output).toContain('agent/probe');
  expect(r.output).not.toMatch(/Permission denied|Repository not found|could not read Username/i);
}, 60000);

test('A6-12 a raw push from the same clone is refused and told to use the command', () => {
  const r = inContainer(
    SERVICE,
    `cd ${WORK}
printf 'second\\n' > second.md
git add second.md
git -c core.pager=cat commit -qm 'add second note'
set +e; out="$(git push origin agent/probe 2>&1)"; code=$?; set -e
printf 'PUSHEXIT=%s\\n' "$code"
printf 'REMOTEHEAD=%s\\n' "$(git -C ${REMOTE} log -1 --format=%s agent/probe)"
printf '%s\\n' "$out" | sed 's/^/PUSH: /'`
  );
  expect(r.output).toContain('PUSHEXIT=');
  expect(r.output).not.toContain('PUSHEXIT=0');
  expect(r.output).toContain('pre-push refused');
  expect(r.output).toContain('git-publish');
  expect(r.output).toContain('REMOTEHEAD=add probe note');
}, 60000);
