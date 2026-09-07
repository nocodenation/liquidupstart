/**
 * M-A7 · End-to-end · The whole path in one chain, in the container
 *
 * Purpose:  Counted on 2026-09-04 the suite held 345 tests across five levels
 *           and not one that walks the path a repository actually travels:
 *           declaration, key, clone, hook, identity, commit, publish, artefact
 *           on the remote. Every link has a case; the chain has none, and a
 *           chain fails at its joints — a key generated but not selected, a
 *           clone made but not configured, a hook installed but never reached
 *           would each leave every existing case green. FR32 exists for that,
 *           and this is the case that discharges it. Nothing here is
 *           constructed by the test: the clone is the one `git.sh` made from a
 *           declaration, the hook the one it installed, the identity the one it
 *           configured, and the push goes through the mounted `git-publish`.
 * Given:    The running stack, and a throwaway declaration in a temporary
 *           project directory under `volumes/repos/.a7-chain-<pid>` — inside
 *           the workspace so the container sees it, dot-prefixed so neither the
 *           start script's own directory sweep nor A4-16 ever looks at it. The
 *           declaration is `git@localhost:e2e.git|write|protected`, its remote a
 *           local bare
 *           repository seeded from `README.md` holding `seed` on `main`. A5-9
 *           proves the real remote once by hand; a local bare remote exercises
 *           every join identically, because the hook reads the clone's own
 *           configuration and not the host's. `.env` is not read or written.
 * When:     The start script's git step runs against that declaration; then,
 *           inside openclaw-gateway, `notes.md` holding `probe` is committed as
 *           `add probe note` on `agent/probe` and `git-publish` is run with no
 *           arguments.
 * Then:     The clone carries liquidupstart.access=write,
 *           liquidupstart.policy=protected, core.hooksPath and
 *           liquidupstart.identity; the hook at that path is byte-identical to
 *           config/agents/hooks/pre-push and the key at that identity exists;
 *           the publish exits 0; and `e2e.git` holds `agent/probe` at the local
 *           sha, carrying `notes.md` with `probe` and the identity the
 *           containers are configured with. No token is left behind.
 * Covers:   A7-1, FR32, FR18, U1, U2, U3, U4
 * Unhappy:  A7-2, in the sibling file, is the same chain aimed at the protected
 *           default branch — so a refusal there is attributable to the branch
 *           rule rather than to the arrangement.
 * Note:     `ssh` is stood in for on PATH, on the host for the clone and in the
 *           container for the push, and routes `git-upload-pack` and
 *           `git-receive-pack` to the local bare repository. That is the
 *           transport, not a step of the chain: the declaration parser accepts
 *           SSH URLs only (by design — the stack's credentials are SSH-only)
 *           and no sshd runs in either place. Every step the milestone names is
 *           performed by the stack itself.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';
import { repoRoot } from '../lib/paths';
import {
  chainFixture,
  dropChainFixture,
  hooksSource,
  PUBLISH_MOUNT,
  PUBLISH_TOKEN,
  START_SCRIPT_BUDGET
} from '../lib/gitfixture';

const SERVICE = 'openclaw-gateway';

stackGuard([SERVICE]);

const fx = chainFixture('chain', ['e2e']);
afterAll(() => {
  inContainer(SERVICE, `rm -rf ${fx.containerRoot}`);
  dropChainFixture(fx);
});

const clone = fx.clone('e2e');
const config = (key: string) =>
  Bun.spawnSync(['git', '-C', clone, 'config', '--get', key]).stdout.toString().trim();

const identity = (key: string) => inContainer(SERVICE, `printf '%s' "$${key}"`).stdout.trim();
const NAME = identity('GIT_USER_NAME');
const EMAIL = identity('GIT_USER_EMAIL');

const chain = inContainer(
  SERVICE,
  `export PATH=${fx.containerBin}:$PATH
cd ${fx.containerClone('e2e')} || exit 1
printf 'PUBLISHCOMMAND=%s\\n' "$(command -v git-publish)"
printf 'HOOKREACHABLE=%s\\n' "$(test -x "$(git config --get core.hooksPath)/pre-push" && echo yes || echo no)"
printf 'KEYREACHABLE=%s\\n' "$(test -f "$(git config --get liquidupstart.identity)" && echo yes || echo no)"
git checkout -q -b agent/probe
printf 'probe\\n' > notes.md
git add notes.md
git -c core.pager=cat commit -qm 'add probe note'
printf 'LOCALSHA=%s\\n' "$(git rev-parse HEAD)"
set +e
out="$(git-publish 2>&1)"; code=$?
set -e
printf 'PUBLISHEXIT=%s\\n' "$code"
printf '%s\\n' "$out" | sed 's/^/PUBLISH: /'
printf 'REMOTESUBJECT=%s\\n' "$(git -C ${fx.containerBare('e2e')} log -1 --format=%s agent/probe)"
printf 'REMOTESHA=%s\\n' "$(git -C ${fx.containerBare('e2e')} rev-parse agent/probe)"
printf 'REMOTEAUTHOR=%s\\n' "$(git -C ${fx.containerBare('e2e')} log -1 --format='%an <%ae>' agent/probe)"
printf 'REMOTEFILE=%s\\n' "$(git -C ${fx.containerBare('e2e')} show agent/probe:notes.md)"
printf 'TOKEN=%s\\n' "$(test -e .git/${PUBLISH_TOKEN} && echo present || echo none)"`
);

const line = (label: string) =>
  (chain.output.split('\n').find((l) => l.startsWith(`${label}=`)) ?? '').slice(label.length + 1);

test('A7-1 the start script clones the declared repository into the workspace', () => {
  expect(fx.start.code).toBe(0);
  expect(fx.start.output).toContain('git@localhost:e2e.git');
  expect(existsSync(join(clone, '.git', 'HEAD'))).toBe(true);
  expect(readFileSync(join(clone, 'README.md'), 'utf8')).toBe('seed\n');
}, START_SCRIPT_BUDGET);

test('A7-1 the clone it made carries the declaration, the hook and the identity', () => {
  expect(config('liquidupstart.access')).toBe('write');
  expect(config('liquidupstart.policy')).toBe('protected');
  expect(config('core.hooksPath')).toBe(`${fx.containerRoot}/project/volumes/_git-secrets/hooks`);
  expect(config('liquidupstart.identity')).toBe(
    `${fx.containerRoot}/project/volumes/_git-secrets/repos/localhost_e2e/id_ed25519`
  );
  const installed = join(fx.project, 'volumes', '_git-secrets', 'hooks', 'pre-push');
  expect(readFileSync(installed, 'utf8')).toBe(readFileSync(join(hooksSource, 'pre-push'), 'utf8'));
});

test('A7-1 in the container the command, the hook and the key are all reachable', () => {
  expect(line('PUBLISHCOMMAND')).toBe(PUBLISH_MOUNT);
  expect(line('HOOKREACHABLE')).toBe('yes');
  expect(line('KEYREACHABLE')).toBe('yes');
}, 60000);

test('A7-1 an agent commits and publishes, and the commit is on the remote', () => {
  expect(line('PUBLISHEXIT')).toBe('0');
  expect(chain.output).toContain('PUBLISH: published agent/probe to origin');
  expect(line('REMOTESUBJECT')).toBe('add probe note');
  expect(line('REMOTESHA')).toBe(line('LOCALSHA'));
  expect(line('REMOTEFILE')).toBe('probe');
}, 60000);

test('A7-1 the commit on the remote carries the identity the stack configured', () => {
  expect(NAME.length).toBeGreaterThan(0);
  expect(EMAIL.length).toBeGreaterThan(0);
  expect(line('REMOTEAUTHOR')).toBe(`${NAME} <${EMAIL}>`);
}, 60000);

test('A7-1 the permission the publish minted is gone once it returns', () => {
  expect(line('TOKEN')).toBe('none');
  expect(existsSync(join(clone, '.git', PUBLISH_TOKEN))).toBe(false);
});
