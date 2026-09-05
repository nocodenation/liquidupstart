/**
 * M-A3c · System · Each clone offers its own key, from inside the harness
 *
 * Purpose:  Proving that two declared repositories are both *reachable* needs a
 *           human to register a second deploy key, which is the wall A3-11 hit.
 *           What can be proven without one is selection: which key a clone
 *           offers is visible in the SSH handshake whether or not access is
 *           granted. That is the property this milestone adds, and it is checked
 *           from inside the running harness — where the stack-wide GIT_SSH_COMMAND
 *           would otherwise override anything a clone declares, because git lets
 *           the environment win over core.sshCommand.
 * Given:    A fixture project under the mounted secrets directory, cloned by the
 *           real start script through an ssh stand-in, so no deploy key has to
 *           be registered for the clones to exist.
 * When:     Inside openclaw-gateway, each clone's configuration is read, and a
 *           bounded ls-remote is run against the real github.com with ssh
 *           tracing on — once with the clone's own command, once with the
 *           command compose ships.
 * Then:     Each clone names and offers its own key, the remote URL stays the
 *           plain git@host:owner/repo.git form, and the two clones offer
 *           different keys.
 * Covers:   A3c-8, A3c-9, FR3, FR11, FR12
 * Unhappy:  GitHub denies both keys — that is expected and is not the assertion.
 *           A hang would be a failure, so every network command is bounded.
 */
import { test, expect, afterAll } from 'bun:test';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inContainer } from '../lib/stack';
import { stackGuard } from '../lib/guard';
import { repoRoot } from '../lib/paths';
import { tempProject, seedRepo, fakeSsh, runStart } from '../lib/gitfixture';
import { serviceBlock, composeText } from '../lib/compose-file';

stackGuard();

const FIXTURE = '.a3c-system';
const hostRoot = join(repoRoot, 'volumes', '_git-secrets', FIXTURE);
const containerRoot = `/git-secrets/${FIXTURE}`;
const work = tempProject('lu-a3c-sys-');

afterAll(() => {
  rmSync(hostRoot, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

rmSync(hostRoot, { recursive: true, force: true });
mkdirSync(join(hostRoot, 'volumes', '_git-secrets'), { recursive: true });
Bun.spawnSync(['cp', join(repoRoot, 'volumes', '_git-secrets', 'known_hosts'),
  join(hostRoot, 'volumes', '_git-secrets', 'known_hosts')]);

const skills = seedRepo(work, 'agent-skills');
const upstart = seedRepo(work, 'liquidupstart');
const bin = fakeSsh(work, [
  { match: 'agent-skills', bare: skills },
  { match: 'liquidupstart', bare: upstart }
]);

const DECLARATION =
  'git@github.com:nocodenation/agent-skills.git|read|protected,' +
  'git@github.com:nocodenation/liquidupstart.git|write|direct';

const started = runStart(hostRoot, DECLARATION, {
  pathPrefix: bin,
  env: { GIT_SECRETS_MOUNT: `${containerRoot}/volumes/_git-secrets` }
});

const REPOS = ['agent-skills', 'liquidupstart'];
const clone = (name: string) => `${containerRoot}/volumes/repos/${name}`;
const keyOf = (name: string) =>
  `${containerRoot}/volumes/_git-secrets/repos/github.com_nocodenation_${name}/id_ed25519`;

const composeSshCommand = () => {
  const line = serviceBlock('openclaw-gateway', composeText())
    .split('\n')
    .find((l) => l.includes('GIT_SSH_COMMAND'))!;
  const value = line.slice(line.indexOf(':') + 1).trim();
  return value.replace(/^"|"$/g, '').replaceAll('$$', '$');
};

test('A3c-8 the fixture clones were produced by the start script', () => {
  expect(started.code).toBe(0);
  for (const name of REPOS) {
    expect(existsSync(join(hostRoot, 'volumes', 'repos', name, '.git', 'HEAD'))).toBe(true);
  }
});

for (const name of REPOS) {
  test(`A3c-8 ${name} names its own key in its own configuration`, () => {
    const r = inContainer('openclaw-gateway', `cd ${clone(name)} && git config --get core.sshCommand`);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toContain(`-i ${keyOf(name)}`);
    expect(r.stdout.trim()).toContain('StrictHostKeyChecking=yes');
  });

  test(`A3c-8 ${name} keeps the plain git@host:owner/repo.git remote URL`, () => {
    const r = inContainer('openclaw-gateway', `cd ${clone(name)} && git config --get remote.origin.url`);
    expect(r.stdout.trim()).toBe(`git@github.com:nocodenation/${name}.git`);
  });
}

const offered = (script: string): string[] =>
  script
    .split('\n')
    .filter((l) => l.includes('Offering public key'))
    .map((l) => l.trim());

const handshake = (name: string, command: string) =>
  inContainer(
    'openclaw-gateway',
    `cd ${clone(name)} && GIT_SSH_COMMAND="$(echo ${Buffer.from(command).toString('base64')} | base64 -d) -v" ` +
      `timeout 25 git ls-remote origin 2>&1; echo "RC=$?"`
  );

for (const name of REPOS) {
  test(`A3c-9 ${name} offers its own key to GitHub, inside the time bound`, () => {
    const r = handshake(name, `$(git config --get core.sshCommand)`);
    expect(r.output).not.toContain('RC=124');
    const lines = offered(r.output);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).toContain(keyOf(name));
    const other = REPOS.find((n) => n !== name)!;
    expect(lines.join('\n')).not.toContain(keyOf(other));
  });

  test(`A3c-9 the command compose ships picks up ${name}'s key, not a stack-wide one`, () => {
    const r = handshake(name, composeSshCommand());
    expect(r.output).not.toContain('RC=124');
    const lines = offered(r.output).join('\n');
    expect(lines).toContain(keyOf(name));
    expect(lines).not.toContain('/git-secrets/id_ed25519');
  });
}
