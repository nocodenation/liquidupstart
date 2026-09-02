import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from './paths';
import { sh, type Result } from './shell';

export const gitScript = join(repoRoot, 'config/scripts/start/git.sh');
export const reposLib = join(repoRoot, 'config/scripts/start/lib/git-repos.sh');

export function tempProject(prefix = 'lu-a3c-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function seedKnownHosts(project: string): void {
  const dir = join(project, 'volumes', '_git-secrets');
  mkdirSync(dir, { recursive: true });
  const real = join(repoRoot, 'volumes', '_git-secrets', 'known_hosts');
  const body = existsSync(real)
    ? readFileSync(real, 'utf8')
    : 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFIXTUREHOSTKEYFIXTUREHOSTKEY\n';
  writeFileSync(join(dir, 'known_hosts'), body);
}

export function seedRepo(root: string, name: string): string {
  const work = join(root, `${name}-work`);
  const bare = join(root, `${name}.git`);
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'README.md'), `# ${name}\n`);
  const env = { GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@local', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@local' };
  sh(['git', 'init', '-q', '-b', 'main', work], root);
  Bun.spawnSync(['git', '-C', work, 'add', 'README.md'], { env: { ...process.env, ...env } });
  Bun.spawnSync(['git', '-C', work, 'commit', '-qm', 'seed'], { env: { ...process.env, ...env } });
  sh(['git', 'clone', '-q', '--bare', work, bare], root);
  return bare;
}

export function fakeSsh(root: string, routes: Array<{ match: string; bare: string }>): string {
  const dir = join(root, 'fake-bin');
  mkdirSync(dir, { recursive: true });
  const cases = routes
    .map((r) => `    *${r.match}*) set -- git-upload-pack '${r.bare}' ;;`)
    .join('\n');
  const script = `#!/bin/sh
cmd=""
while [ $# -gt 0 ]; do
  case "$1" in
    -i|-o|-p|-F|-l|-b|-c|-E|-I|-J|-L|-m|-O|-Q|-R|-S|-W|-w) shift 2 ;;
    -*) shift ;;
    *) shift; cmd="$*"; break ;;
  esac
done
case "$cmd" in
${cases}
    *) echo "fake-ssh: no route for $cmd" >&2; exit 128 ;;
esac
exec "$@"
`;
  const path = join(dir, 'ssh');
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return dir;
}

export function runStart(
  project: string,
  declaration: string,
  extra: { pathPrefix?: string; env?: Record<string, string> } = {}
): Result {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    GIT_REPOSITORIES: declaration,
    ...(extra.env ?? {})
  };
  if (extra.pathPrefix) env.PATH = `${extra.pathPrefix}:${env.PATH}`;
  const p = Bun.spawnSync(['bash', gitScript, project], { env, stdout: 'pipe', stderr: 'pipe' });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return { code: p.exitCode ?? -1, stdout, stderr, output: stdout + stderr };
}

export function manifest(project: string): any {
  return JSON.parse(
    readFileSync(join(project, 'volumes', '_git-secrets', 'repositories.json'), 'utf8')
  );
}

export function parseDeclaration(declaration: string): Result {
  return sh(['bash', reposLib, 'parse', declaration]);
}

export const repoCommand = join(repoRoot, 'config/agents/bin/git-repo-info.sh');

export const DECLARED = {
  name: 'agent-skills',
  url: 'git@github.com:nocodenation/agent-skills.git',
  host: 'github.com',
  path: 'nocodenation/agent-skills',
  access: 'read',
  policy: 'protected',
  slug: 'github.com_nocodenation_agent-skills',
  keyDir: 'volumes/_git-secrets/repos/github.com_nocodenation_agent-skills',
  publicKeyFile: 'volumes/_git-secrets/repos/github.com_nocodenation_agent-skills/id_ed25519.pub',
  clonePath: 'volumes/repos/agent-skills',
  containerKey: '/git-secrets/repos/github.com_nocodenation_agent-skills/id_ed25519',
  containerClone: '/repos/agent-skills',
  cloned: true,
  error: null as string | null
};

export const CLONE_FAILED = {
  ...DECLARED,
  name: 'flows',
  url: 'git@github.com:nocodenation/flows.git',
  path: 'nocodenation/flows',
  access: 'write',
  policy: 'direct',
  slug: 'github.com_nocodenation_flows',
  keyDir: 'volumes/_git-secrets/repos/github.com_nocodenation_flows',
  publicKeyFile: 'volumes/_git-secrets/repos/github.com_nocodenation_flows/id_ed25519.pub',
  clonePath: 'volumes/repos/flows',
  containerKey: '/git-secrets/repos/github.com_nocodenation_flows/id_ed25519',
  containerClone: '/repos/flows',
  cloned: false,
  error: 'ERROR: Repository not found. fatal: Could not read from remote repository.'
};

export function writeManifest(repositories: unknown[], prefix = 'lu-a3e-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const path = join(dir, 'repositories.json');
  writeFileSync(
    path,
    JSON.stringify({ generated: '2026-09-02T00:00:00Z', repositories }, null, 2) + '\n'
  );
  return path;
}

export function askRepoCommand(manifestPath: string, args: string[]): Result {
  const p = Bun.spawnSync([repoCommand, ...args], {
    cwd: repoRoot,
    env: { ...(process.env as Record<string, string>), GIT_REPOSITORIES_MANIFEST: manifestPath },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return { code: p.exitCode ?? -1, stdout, stderr, output: stdout + stderr };
}

export const hooksSource = join(repoRoot, 'config/agents/hooks');
export const HOOKS_MOUNT = '/git-secrets/hooks';

const FIXTURE_IDENTITY = {
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@local',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@local',
  GIT_CONFIG_NOSYSTEM: '1'
};

export function git(dir: string, args: string[], env: Record<string, string> = {}): Result {
  const p = Bun.spawnSync(['git', '-C', dir, ...args], {
    env: { ...(process.env as Record<string, string>), ...FIXTURE_IDENTITY, ...env },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return { code: p.exitCode ?? -1, stdout, stderr, output: stdout + stderr };
}

export function commit(dir: string, files: Record<string, string>, message: string): void {
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  git(dir, ['add', '--all']);
  const r = git(dir, ['commit', '-qm', message]);
  if (r.code !== 0) throw new Error(`fixture commit "${message}" failed: ${r.output}`);
}

export type HookFixture = { root: string; remote: string; clone: string };

export function hookFixture(prefix = 'lu-a4-'): HookFixture {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const clone = join(root, 'work');

  sh(['git', 'init', '-q', '--bare', '--initial-branch=main', remote], root);
  mkdirSync(seed, { recursive: true });
  sh(['git', 'init', '-q', '-b', 'main', seed], root);
  git(seed, ['config', 'user.name', 'Fixture']);
  git(seed, ['config', 'user.email', 'fixture@local']);
  commit(seed, { 'README.md': 'seed\n' }, 'seed');
  git(seed, ['remote', 'add', 'origin', remote]);
  git(seed, ['push', '-q', 'origin', 'main']);

  sh(['git', 'clone', '-q', remote, clone], root);
  git(clone, ['config', 'user.name', 'Fixture']);
  git(clone, ['config', 'user.email', 'fixture@local']);
  git(clone, ['config', 'commit.gpgsign', 'false']);
  git(clone, ['config', 'liquidupstart.access', 'write']);
  git(clone, ['config', 'liquidupstart.policy', 'protected']);
  git(clone, ['config', 'core.hooksPath', hooksSource]);
  git(clone, ['checkout', '-q', '-b', 'feature/probe']);
  commit(clone, { 'notes.md': 'probe\n' }, 'add probe note');

  return { root, remote, clone };
}

export function commitOnRemote(
  fx: HookFixture,
  branch: string,
  files: Record<string, string>,
  message: string
): void {
  const scratch = mkdtempSync(join(fx.root, 'elsewhere-'));
  sh(['git', 'clone', '-q', fx.remote, scratch], fx.root);
  git(scratch, ['config', 'user.name', 'Elsewhere']);
  git(scratch, ['config', 'user.email', 'elsewhere@local']);
  git(scratch, ['checkout', '-q', branch]);
  commit(scratch, files, message);
  const r = git(scratch, ['push', '-q', 'origin', branch]);
  if (r.code !== 0) throw new Error(`fixture push to the remote failed: ${r.output}`);
}

export function remoteSha(fx: HookFixture, ref: string): string {
  return git(fx.remote, ['rev-parse', ref]).stdout.trim();
}

export function remoteHas(fx: HookFixture, ref: string): boolean {
  return git(fx.remote, ['rev-parse', '--verify', '--quiet', ref]).code === 0;
}

export function remoteFile(fx: HookFixture, ref: string, path: string): string {
  return git(fx.remote, ['show', `${ref}:${path}`]).stdout;
}
