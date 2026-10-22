import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from './paths';
import { sh, type Result } from './shell';

export const START_SCRIPT_BUDGET = 60_000;

export const gitScript = join(repoRoot, 'config/scripts/start/git.sh');
export const reposLib = join(repoRoot, 'config/scripts/start/lib/git-repos.sh');

export function tempProject(prefix = 'lu-a3c-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

// `extraHosts` since 2026-09-17: a clone is now refused for a host known_hosts
// says nothing about, so a case whose subject is something else -- the insteadOf
// rewrite, the hook path, the warning text -- has to seed the hosts its own
// scenario uses. The fixture key is syntactically a host key and belongs to
// nothing; the fake ssh stand-in never checks it.
export function seedKnownHosts(project: string, extraHosts: string[] = []): void {
  const dir = join(project, 'volumes', '_git-secrets');
  mkdirSync(dir, { recursive: true });
  const real = join(repoRoot, 'volumes', '_git-secrets', 'known_hosts');
  const body = existsSync(real)
    ? readFileSync(real, 'utf8')
    : 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFIXTUREHOSTKEYFIXTUREHOSTKEY\n';
  const extra = extraHosts
    .map((h) => `${h} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFIXTUREHOSTKEYFIXTUREHOSTKEY\n`)
    .join('');
  writeFileSync(join(dir, 'known_hosts'), `${body}${extra}`);
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
  // A test run is an unattended run. Since 2026-09-17 a clone that fails stops
  // and waits for the operator to register the deploy key -- fifteen minutes by
  // default -- so every case that makes a clone fail on purpose would sit there.
  // 0 means do not wait, which is what a suite wants; a case that is *about* the
  // wait writes its own value into this file first and keeps it.
  const envFile = join(project, '.env');
  mkdirSync(project, { recursive: true });
  if (!existsSync(envFile) || !readFileSync(envFile, 'utf8').includes('SYSTEM_SIGNIN_WAIT_SECONDS=')) {
    appendFileSync(envFile, 'SYSTEM_SIGNIN_WAIT_SECONDS=0\n');
  }
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

// Exported so a case that spawns git itself cannot leave the ceiling out.
export const FIXTURE_IDENTITY = {
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@local',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@local',
  GIT_CONFIG_NOSYSTEM: '1',
  // The upward search stops before this working copy. Without it a fixture
  // directory that exists but holds no repository -- which is what a chain
  // fixture leaves behind when its stack start fails -- makes git walk up and
  // find *this* repository, and every command then acts on the operator's own
  // checkout. Measured 2026-09-17: a suite run committed the working tree as
  // "1" onto feature/liquid-java-extensions, created agent/probe-2 and
  // agent/probe-3 from main, and left HEAD on the last of them. Nothing was
  // lost and nothing was pushed, and neither of those was to the suite's credit.
  GIT_CEILING_DIRECTORIES: repoRoot
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

export const publishCommand = join(repoRoot, 'config/agents/bin/git-publish.sh');
export const PUBLISH_TOKEN = 'liquidupstart-publish';
export const PUBLISH_MOUNT = '/usr/local/bin/git-publish';

export function tokenPath(clone: string): string {
  return join(clone, '.git', PUBLISH_TOKEN);
}

export function sanction(clone: string): void {
  writeFileSync(tokenPath(clone), 'fixture-minted\n');
}

export function hasToken(clone: string): boolean {
  return existsSync(tokenPath(clone));
}

export function publish(clone: string, args: string[] = []): Result {
  const p = Bun.spawnSync([publishCommand, ...args], {
    cwd: clone,
    env: { ...(process.env as Record<string, string>), ...FIXTURE_IDENTITY, LC_ALL: 'C' },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return { code: p.exitCode ?? -1, stdout, stderr, output: stdout + stderr };
}

export function publishFixture(
  opts: { prefix?: string; access?: string; policy?: string } = {}
): HookFixture {
  const root = mkdtempSync(join(tmpdir(), opts.prefix ?? 'lu-a6-'));
  const remote = join(root, 'beta.git');
  const seed = join(root, 'seed');
  const clone = join(root, 'work');

  sh(['git', 'init', '-q', '--bare', '--initial-branch=main', remote], root);
  mkdirSync(seed, { recursive: true });
  sh(['git', 'init', '-q', '-b', 'main', seed], root);
  git(seed, ['config', 'user.name', 'Seed']);
  git(seed, ['config', 'user.email', 'seed@local']);
  commit(seed, { 'README.md': 'seed\n' }, 'seed');
  git(seed, ['remote', 'add', 'origin', remote]);
  const pushed = git(seed, ['push', '-q', 'origin', 'main']);
  if (pushed.code !== 0) throw new Error(`fixture seed push failed: ${pushed.output}`);

  sh(['git', 'clone', '-q', remote, clone], root);
  git(clone, ['config', 'user.name', 'Fixture']);
  git(clone, ['config', 'user.email', 'fixture@local']);
  git(clone, ['config', 'commit.gpgsign', 'false']);
  git(clone, ['config', 'liquidupstart.access', opts.access ?? 'write']);
  git(clone, ['config', 'liquidupstart.policy', opts.policy ?? 'protected']);
  git(clone, ['config', 'core.hooksPath', hooksSource]);

  return { root, remote, clone };
}

export const FIXTURE_PRIVATE_KEY =
  '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAFIXTURENOTAREALKEY\n-----END OPENSSH PRIVATE KEY-----\n';

export function pushSanctioned(clone: string, args: string[]): Result {
  sanction(clone);
  return git(clone, ['push', ...args]);
}

export const CHAIN_ROOT_PREFIX = '.a7-';
export const chainSsh = `#!/bin/sh
BASE="__BASE__"
cmd=""
while [ $# -gt 0 ]; do
  case "$1" in
    -i|-o|-F|-p|-l|-b|-c|-E|-I|-J|-L|-m|-O|-Q|-R|-S|-W|-w) shift 2 ;;
    -*) shift ;;
    *) shift; cmd="$*"; break ;;
  esac
done
verb="\${cmd%% *}"
path="\${cmd#* }"
path="$(printf '%s' "$path" | tr -d "'\\"")"
name="\${path##*/}"
case "$verb" in
  git-receive-pack)
    [ -n "\${A7_SSH_DELAY:-}" ] && sleep "$A7_SSH_DELAY"
    exec "$verb" "\${BASE}/\${name}" ;;
  git-upload-pack) exec "$verb" "\${BASE}/\${name}" ;;
  *) echo "a7-ssh: unsupported command: $cmd" >&2; exit 128 ;;
esac
`;

export type ChainFixture = {
  root: string;
  containerRoot: string;
  project: string;
  declaration: string;
  hostBin: string;
  containerBin: string;
  start: Result;
  bare: (name: string) => string;
  clone: (name: string) => string;
  containerClone: (name: string) => string;
  containerBare: (name: string) => string;
};

function writeSsh(path: string, base: string): void {
  writeFileSync(path, chainSsh.replace('__BASE__', base));
  chmodSync(path, 0o755);
}

export function chainFixture(
  tag: string,
  names: string[],
  view: 'container' | 'host' = 'container'
): ChainFixture {
  const dir = `${CHAIN_ROOT_PREFIX}${tag}-${process.pid}`;
  const root = join(repoRoot, 'volumes', 'repos', dir);
  const containerRoot = `/repos/${dir}`;
  const project = join(root, 'project');

  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'bin-host'), { recursive: true });
  mkdirSync(join(root, 'bin-container'), { recursive: true });
  writeSsh(join(root, 'bin-host', 'ssh'), root);
  writeSsh(join(root, 'bin-container', 'ssh'), containerRoot);

  for (const name of names) {
    const seed = join(root, `${name}-seed`);
    mkdirSync(seed, { recursive: true });
    sh(['git', 'init', '-q', '-b', 'main', seed], root);
    git(seed, ['config', 'user.name', 'Seed']);
    git(seed, ['config', 'user.email', 'seed@local']);
    commit(seed, { 'README.md': 'seed\n' }, 'seed');
    sh(['git', 'clone', '-q', '--bare', seed, join(root, `${name}.git`)], root);
  }

  // localhost is the host this fixture's own declaration uses, and a clone is
  // refused for a host known_hosts says nothing about (finding 5 of the #9
  // review). Without it the fixture clones nothing, and every git command that
  // follows runs in a directory that holds no repository.
  seedKnownHosts(project, ['localhost']);
  const mountRoot = view === 'container' ? containerRoot : root;
  const declaration = names.map((n) => `git@localhost:${n}.git|write|protected`).join(',');
  const start = runStart(project, declaration, {
    pathPrefix: join(root, 'bin-host'),
    env: {
      GIT_SECRETS_MOUNT: `${mountRoot}/project/volumes/_git-secrets`,
      GIT_REPOS_MOUNT: `${mountRoot}/project/volumes/repos`
    }
  });

  return {
    root,
    containerRoot,
    project,
    declaration,
    hostBin: join(root, 'bin-host'),
    containerBin: `${containerRoot}/bin-container`,
    start,
    bare: (name) => join(root, `${name}.git`),
    clone: (name) => join(project, 'volumes', 'repos', name),
    containerClone: (name) => `${containerRoot}/project/volumes/repos/${name}`,
    containerBare: (name) => `${containerRoot}/${name}.git`
  };
}

export function dropChainFixture(fx: ChainFixture): void {
  rmSync(fx.root, { recursive: true, force: true });
}

export function publishOnHost(
  clone: string,
  pathPrefix: string,
  extra: Record<string, string> = {}
): Promise<Result> {
  const p = Bun.spawn([publishCommand], {
    cwd: clone,
    env: {
      ...(process.env as Record<string, string>),
      ...FIXTURE_IDENTITY,
      LC_ALL: 'C',
      PATH: `${pathPrefix}:${process.env.PATH}`,
      ...extra
    },
    stdout: 'pipe',
    stderr: 'pipe'
  });
  return (async () => {
    const stdout = await new Response(p.stdout).text();
    const stderr = await new Response(p.stderr).text();
    const code = await p.exited;
    return { code, stdout, stderr, output: stdout + stderr };
  })();
}

export function gitOnHost(dir: string, args: string[], pathPrefix: string): Result {
  return git(dir, args, { PATH: `${pathPrefix}:${process.env.PATH}` });
}

type WatchedRun = { exitCode: number | null };

const isStream = (s: unknown): s is ReadableStream<Uint8Array> =>
  !!s && typeof s === 'object' && 'getReader' in (s as object);

/**
 * Wait until `file` holds something, and give back what it holds.
 *
 * A start writes its lock holder when it reaches the repository, and that is not
 * a fixed distance away. Measured 2026-10-02 against this fixture: 241ms and
 * 251ms on an idle host, 1047ms to 1342ms with eight starts running at once --
 * eight of eight past the 900ms two cases had been reading at. An empty read was
 * then asserted on as though it were the holder, so a busy machine and a missing
 * identity failed identically. A16-11 and A15-1 of the 2026-10-01 review.
 *
 * The run is watched with it: one that ends without ever writing says so, rather
 * than producing the same empty string for a different reason. Its pipes are left
 * alone -- a `new Response(run.stdout).text()` here consumes the stream the case
 * reads afterwards, which cost one `ReadableStream has already been used` on the
 * first failure path this helper took. Pass a `watchOutput` handle as `seen` to
 * get the output into the message.
 */
export async function awaitFile(
  file: string,
  run: WatchedRun,
  seen?: { text: string },
  seconds = 20
): Promise<string> {
  const read = () => (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');
  const said = () => (seen ? `. It said:\n${seen.text}` : '');
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const held = read();
    if (held !== '') return held;
    if (run.exitCode !== null) {
      // It may have written and released between two polls, so the file decides
      // before the ending does.
      const last = read();
      if (last !== '') return last;
      throw new Error(`the run ended with ${run.exitCode} before it wrote ${file}${said()}`);
    }
    await Bun.sleep(20);
  }
  throw new Error(`${file} was still empty after ${seconds}s, with the run still going${said()}`);
}

/**
 * Follow a running child's output, so a case can wait for a line it prints.
 *
 * `await new Response(run.stdout).text()` only answers once the child is gone,
 * which is no use to a case whose subject is what is true *while* it runs. The
 * alternative a case reaches for is a sleep, and A16-27 showed what that costs:
 * it released a lock after 3000ms and asserted the elapsed time was over 3000ms,
 * which its own sleep guarantees. A run that had not reached the lock yet never
 * waited for anything and the case passed anyway.
 */
export function watchOutput(run: { stdout?: unknown; stderr?: unknown }) {
  const dec = new TextDecoder();
  let text = '';
  let ended = false;
  const pump = async (s: unknown) => {
    if (!isStream(s)) return;
    const reader = s.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) text += dec.decode(value, { stream: true });
    }
  };
  // Caught, because a rejected pump would otherwise surface as an unhandled
  // rejection in a test run that is about something else entirely.
  const drained = Promise.all([pump(run.stdout), pump(run.stderr)])
    .catch(() => undefined)
    .then(() => {
      ended = true;
    });
  return {
    get text() {
      return text;
    },
    /** Resolve once the child has said this, or fail naming everything it did say. */
    async until(needle: string, seconds = 60): Promise<void> {
      const deadline = Date.now() + seconds * 1000;
      while (Date.now() < deadline) {
        if (text.includes(needle)) return;
        if (ended) break;
        await Bun.sleep(20);
      }
      throw new Error(
        `the run never said ${JSON.stringify(needle)}${ended ? ' and has ended' : ` within ${seconds}s`}. It said:\n${text}`
      );
    },
    /** Everything it printed, once there is no more of it. */
    async finished(): Promise<string> {
      await drained;
      return text;
    }
  };
}
