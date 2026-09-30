/**
 * M-A4 · System · The hook refuses inside the container, where the agent works
 *
 * Purpose:  Everything else in this milestone runs on the host. This proves the
 *           same mechanism is installed where an agent actually is: the shared
 *           hook is present in the container, the real clone points at it, a
 *           clone made inside the container is governed without anyone setting
 *           anything, and a push to a protected default branch is refused there
 *           with the hook's own words.
 * Given:    The running stack, /repos/agent-skills cloned by M-A3c, and
 *           /git-secrets/hooks/pre-push installed by the start script.
 * When:     An empty commit `guardrail probe` is pushed to main in the real
 *           clone and undone afterwards; and, separately, a bare remote and a
 *           clone of it are built inside the container under /repos, declared
 *           access=write and policy=protected, and pushed to their default
 *           branch.
 * Then:     Nothing reaches the default branch of the real repository, and the
 *           push in the container clone is refused by the hook, naming the
 *           branch, the policy and the feature branch to use instead.
 * Covers:   A4-14, U3, U4
 * Unhappy:  Both halves are refusals. The positive counterweight is A4-1 to
 *           A4-12 on the host, and the second half's own setup: the clone, the
 *           commit and the remote all work — only the push is stopped.
 *
 * What this found: the specified step, pushing the real /repos/agent-skills to
 * main, never reaches the hook. Its deploy key is registered read-only with
 * GitHub, and a push is refused by the server while git is still opening the
 * connection — before pre-push runs. The guarantee holds (nothing reaches main)
 * but the refusal is GitHub's, not this stack's, so it proves nothing about the
 * hook. The second half was added to prove what the case is actually for.
 * M-A6:     The bare remote is cloned from the seed rather than pushed to.
 *           Inside the container every repository is governed, so a seeding
 *           push would itself need the sanctioned path M-A6 installed; the
 *           refusal this case asserts is unchanged, and still the policy
 *           rule, because that rule is evaluated before the path rule.
 */
import { test, expect } from 'bun:test';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';
import { HOOKS_MOUNT } from '../lib/gitfixture';

const SERVICE = 'openclaw-gateway';
const CLONE = '/repos/agent-skills';

stackGuard([SERVICE]);

test('A4-14 the shared hook is installed in the container and the real clone points at it', () => {
  const r = inContainer(
    SERVICE,
    `test -x ${HOOKS_MOUNT}/pre-push && echo EXECUTABLE; git -C ${CLONE} config --get core.hooksPath`
  );
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('EXECUTABLE');
  expect(r.stdout).toContain(HOOKS_MOUNT);
}, 30000);

test('A4-14 an empty commit does not reach the default branch of the real repository', () => {
  const r = inContainer(
    SERVICE,
    `cd ${CLONE} &&
     before="$(git ls-remote origin refs/heads/main | cut -f1)" &&
     git commit -q --allow-empty -m 'guardrail probe' &&
     set +e; out="$(git push origin HEAD:main 2>&1)"; code=$?; set -e
     git reset -q --hard origin/main
     after="$(git ls-remote origin refs/heads/main | cut -f1)"
     printf 'PUSHEXIT=%s\\n' "$code"
     printf 'UNCHANGED=%s\\n' "$([ "$before" = "$after" ] && echo yes || echo no)"
     printf 'HEADRESTORED=%s\\n' "$(git log -1 --format=%s)"
     printf '%s\\n' "$out" | sed 's/^/PUSH: /'`
  );
  expect(r.output).not.toContain('PUSHEXIT=0');
  expect(r.output).toContain('UNCHANGED=yes');
  expect(r.output).not.toContain('HEADRESTORED=guardrail probe');
}, 60000);

test('A4-14 a clone made inside the container is governed, and its protected default branch is refused', () => {
  const script = `set -eu
rm -rf /repos/.a4-probe.*
probe=/repos/.a4-probe.$$
mkdir -p "$probe"; cd "$probe"
git init -q -b main seed
cd seed
git config user.name Probe; git config user.email probe@local
echo seed > README.md; git add README.md; git commit -qm seed
cd "$probe"
git clone -q --bare seed remote.git
git clone -q remote.git work
cd work
git config user.name Probe; git config user.email probe@local
git config liquidupstart.access write
git config liquidupstart.policy protected
echo probe >> README.md; git add README.md; git commit -qm 'probe change'
printf 'HOOKSPATH=%s\\n' "$(git config --get core.hooksPath)"
set +e; out="$(git push origin main 2>&1)"; code=$?; set -e
printf 'PUSHEXIT=%s\\n' "$code"
printf 'REMOTEHEAD=%s\\n' "$(git -C "$probe/remote.git" log -1 --format=%s main)"
printf '%s\\n' "$out" | sed 's/^/PUSH: /'
cd /; rm -rf "$probe"`;
  const r = inContainer(SERVICE, script);
  expect(r.output).toContain(`HOOKSPATH=${HOOKS_MOUNT}`);
  expect(r.output).not.toContain('PUSHEXIT=0');
  expect(r.output).toContain('REMOTEHEAD=seed');
  expect(r.output).toContain('pre-push refused');
  expect(r.output).toContain('protected');
  expect(r.output).toContain('feature branch');
}, 60000);
