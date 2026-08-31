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
