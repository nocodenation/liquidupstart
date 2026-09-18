import { execFileSync, spawn, spawnSync } from 'node:child_process';

const C_LOCALE = { LC_ALL: 'C', LANG: 'C', LANGUAGE: 'C' };
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnvValues } from '../env-file';

export type ManifestEntry = {
  name: string;
  url: string;
  host: string;
  path: string;
  access: string;
  policy: string;
  slug: string;
  publicKeyFile: string;
  clonePath: string;
  containerClone?: string;
  cloned: boolean;
  error: string | null;
};

export type DeclaredRepository = {
  name: string;
  url: string;
  host: string;
  path: string;
  label: string;
  access: string;
  policy: string;
  slug: string;
};

export type CardRepository = {
  name: string;
  label: string;
  url: string;
  host: string;
  path: string;
  slug: string;
  access: string;
  policy: string;
  publicKey: string | null;
  fingerprint: string | null;
  cloned: boolean;
  clonePath: string;
  error: string | null;
  unreachable: boolean;
  canRetry: boolean;
  instructions: string;
  deployKeyUrl: string;
};

export type GitCard = {
  state: 'none' | 'unprepared' | 'unknown' | 'ready';
  message: string;
  declared: DeclaredRepository[];
  declarationError: string | null;
  repositories: CardRepository[];
  pending: DeclaredRepository[];
};

export type RetryResult = {
  status: number;
  ok: boolean;
  message: string;
  repository: CardRepository | null;
};

type ManifestDocument = { generated: string; repositories: ManifestEntry[] };
type ManifestRead =
  | { reason: 'ok'; document: ManifestDocument }
  | { reason: 'missing' | 'unreadable' | 'empty'; document: null };

const DECLARATION_SOURCE = 'GIT_REPOSITORIES in .env';
const PARSER_PATH = 'config/scripts/start/lib/git-repos.sh';

export function envDir(): string {
  return process.env.ENV_DIR ?? resolve(process.cwd(), '..');
}

export function secretsDir(): string {
  return join(envDir(), 'volumes', '_git-secrets');
}

function manifestFile(): string {
  return join(secretsDir(), 'repositories.json');
}

export function fingerprint(path: string): string | null {
  try {
    return execFileSync('ssh-keygen', ['-l', '-f', path], {
      encoding: 'utf8',
      env: { ...process.env, ...C_LOCALE },
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

/** The page that adds a deploy key, at the fixed address every host uses. */
export function deployKeyUrl(entry: { host: string; path: string }): string {
  return `https://${entry.host}/${entry.path}/settings/keys/new`;
}

export function instructionFor(entry: { host: string; path: string; access: string }): string {
  const where = `${entry.host}/${entry.path}`;
  // Names the control, not the intention. "with write access" described what the
  // key is for; the checkbox is off by default, and a key added without it clones
  // fine and fails on the first push, in an agent session, much later.
  return entry.access === 'write'
    ? `Add this key as a deploy key on ${where} and tick "Allow write access" — the agents push to it.`
    : `Add this key as a deploy key on ${where}, read-only — the agents only read it.`;
}

export function readManifest(): ManifestRead {
  const path = manifestFile();
  if (!existsSync(path)) return { reason: 'missing', document: null };
  let document: ManifestDocument;
  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { reason: 'unreadable', document: null };
  }
  const repositories = document?.repositories;
  if (!Array.isArray(repositories)) return { reason: 'unreadable', document: null };
  if (repositories.length === 0) return { reason: 'empty', document: null };
  return { reason: 'ok', document: { generated: document.generated, repositories } };
}

export function declaration(): string {
  const envFile = join(envDir(), '.env');
  if (!existsSync(envFile)) return '';
  return parseEnvValues(readFileSync(envFile, 'utf8')).get('GIT_REPOSITORIES')?.value ?? '';
}

export function declaredRepositories(): {
  repositories: DeclaredRepository[];
  error: string | null;
} {
  const value = declaration().trim();
  if (value === '') return { repositories: [], error: null };

  const parser = join(envDir(), 'config', 'scripts', 'start', 'lib', 'git-repos.sh');
  if (!existsSync(parser)) {
    return {
      repositories: [],
      error: `this project directory does not carry ${PARSER_PATH}, so the declaration cannot be read.`
    };
  }

  const parsed = spawnSync('bash', [parser, 'parse', value], {
    encoding: 'utf8',
    env: { ...process.env, ...C_LOCALE },
    timeout: 20_000
  });
  if (parsed.status !== 0) {
    const detail = (parsed.stderr ?? '').trim();
    return {
      repositories: [],
      error:
        detail === ''
          ? `${DECLARATION_SOURCE} could not be read. Correct it in the configuration, then start the stack.`
          : `${detail} Correct ${DECLARATION_SOURCE} in the configuration, then start the stack.`
    };
  }

  const repositories = (parsed.stdout ?? '')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [name, url, host, path, access, policy, slug] = line.split('\t');
      return { name, url, host, path, label: `${host}/${path}`, access, policy, slug };
    });
  return { repositories, error: null };
}

export function describeRepository(entry: ManifestEntry): CardRepository {
  const publicKeyPath = join(envDir(), entry.publicKeyFile ?? '');
  const present = entry.publicKeyFile !== undefined && existsSync(publicKeyPath);
  return {
    name: entry.name,
    label: `${entry.host}/${entry.path}`,
    url: entry.url,
    host: entry.host,
    path: entry.path,
    slug: entry.slug,
    access: entry.access,
    policy: entry.policy,
    publicKey: present ? readFileSync(publicKeyPath, 'utf8').trim() : null,
    fingerprint: present ? fingerprint(publicKeyPath) : null,
    cloned: entry.cloned,
    clonePath: entry.clonePath,
    error: entry.error,
    unreachable: !entry.cloned,
    canRetry: !entry.cloned,
    instructions: instructionFor(entry),
    deployKeyUrl: deployKeyUrl(entry)
  };
}

function counted(n: number): string {
  return n === 1 ? '1 repository is declared' : `${n} repositories are declared`;
}

export function gitCard(): GitCard {
  const { repositories: declared, error: declarationError } = declaredRepositories();
  const manifest = readManifest();

  if (manifest.reason === 'ok') {
    const repositories = manifest.document.repositories.map(describeRepository);
    // The manifest is what the last start prepared; the declaration is what the
    // operator asked for. Reporting only the first says "all declared
    // repositories are cloned" while .env names one the start has never seen --
    // after a save without a restart, and in the window a scoped retry leaves.
    const prepared = new Set(repositories.map((r) => r.slug));
    const pending = declared.filter((r) => !prepared.has(r.slug));
    const unreachable = repositories.filter((r) => r.unreachable).length;

    const said: string[] = [];
    if (unreachable > 0) {
      said.push(
        `${unreachable} of ${repositories.length} prepared ${repositories.length === 1 ? 'repository' : 'repositories'} could not be reached. Register the deploy key below at the host, then test the repository from here.`
      );
    } else if (repositories.length > 0) {
      said.push(
        repositories.length === 1
          ? 'The one prepared repository is cloned into ./volumes/repos.'
          : `All ${repositories.length} prepared repositories are cloned into ./volumes/repos.`
      );
    }
    if (pending.length > 0) {
      said.push(
        `${pending.length === 1 ? '1 declared repository has' : `${pending.length} declared repositories have`} no deploy key yet. Start the stack so ${pending.length === 1 ? 'it gets' : 'they get'} one.`
      );
    }

    return {
      state: 'ready',
      message: said.join(' '),
      declared,
      declarationError,
      repositories,
      pending
    };
  }

  if (declared.length === 0) {
    const message =
      declarationError === null
        ? `No repositories are declared. Add them to ${DECLARATION_SOURCE} in the configuration, then start the stack to give each one its own deploy key.`
        : `The repository declaration could not be read: ${declarationError}`;
    return { state: 'none', message, declared, declarationError, repositories: [], pending: declared };
  }

  if (!existsSync(secretsDir())) {
    return {
      state: 'unprepared',
      message: `${counted(declared.length)}. Their deploy keys have not been generated yet — start the stack once and each one gets its own key to register here.`,
      declared,
      declarationError,
      repositories: [],
      pending: declared
    };
  }

  const why =
    manifest.reason === 'empty'
      ? 'the repository manifest does not list them'
      : manifest.reason === 'unreadable'
        ? 'the repository manifest could not be read'
        : 'the repository manifest has not been written yet';
  return {
    state: 'unknown',
    message: `${counted(declared.length)}, and their state is unknown: ${why}. Start the stack to write it again.`,
    declared,
    declarationError,
    repositories: [],
    pending: declared
  };
}

function writeManifestDocument(document: ManifestDocument): void {
  const path = manifestFile();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(document, null, 2)}\n`);
  renameSync(tmp, path);
}

function runStartGitStep(
  dir: string,
  entry: ManifestEntry,
  declared: ManifestEntry[]
): Promise<{ output: string; code: number | null }> {
  const script = join(dir, 'config', 'scripts', 'start', 'git.sh');
  return new Promise((done) => {
    const child = spawn('bash', [script, dir], {
      cwd: dir,
      env: {
        ...process.env,
        ...C_LOCALE,
        // The whole declaration, and the one to act on. With a single entry
        // `lu_git_parse` sees no name collision and names the clone folder after
        // the plain repository name -- a folder a full start never uses when two
        // declared repositories share a name, so the Test cloned somewhere else
        // and the next start left that folder behind. Finding 1 of the review.
        GIT_REPOSITORIES: declared
          .map((r) => `${r.url}|${r.access}|${r.policy}`)
          .join(','),
        GIT_ONLY_SLUG: entry.slug
      }
    });
    let output = '';
    const timer = setTimeout(() => child.kill(), 420_000);
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      done({ output: `${output}${err.message}`, code: -1 });
    });
    // The status matters: git.sh exits 0 when a clone fails -- that is a result --
    // and non-zero only when it stopped early under `set -e`, before rewriting
    // the manifest. Ignoring it meant the previous manifest was read back and
    // answered with as though it were this run's. `code` is null when the 420s
    // timer killed the child.
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ output, code });
    });
  });
}

let testing = false;

export async function retryRepository(name: string): Promise<RetryResult> {
  const dir = envDir();
  const manifest = readManifest();
  if (manifest.reason !== 'ok') {
    return {
      status: 409,
      ok: false,
      message: `There is no repository manifest yet. Start the stack once so the repositories in ${DECLARATION_SOURCE} are prepared, then test one from here.`,
      repository: null
    };
  }

  // Slug first, then host/path, then the plain name. Two declared repositories
  // can share a name -- `acme/skills` and `other/skills` are both "skills" --
  // and a lookup by name alone could only ever reach the first of them, so the
  // second could not be tested at all. The card sends the slug; the other two
  // forms stay because they are what a person types.
  const repos = manifest.document.repositories;
  const sameName = repos.filter((r) => r.name === name);
  const entry =
    repos.find((r) => r.slug === name) ??
    repos.find((r) => r.path === name) ??
    (sameName.length === 1 ? sameName[0] : undefined);
  if (!entry) {
    const ambiguous =
      sameName.length > 1
        ? ` "${name}" names ${sameName.length} declared repositories — ask for one by its path, for example ${sameName[0].path}.`
        : '';
    return {
      status: 404,
      ok: false,
      message: `"${name}" is not a repository this stack declares.${ambiguous} Repositories come from ${DECLARATION_SOURCE} — add it there and start the stack.`,
      repository: null
    };
  }

  if (!existsSync(join(dir, 'config', 'scripts', 'start', 'git.sh'))) {
    return {
      status: 500,
      ok: false,
      message: 'The project directory does not carry config/scripts/start/git.sh, so nothing can be cloned from here.',
      repository: describeRepository(entry)
    };
  }

  if (testing) {
    return {
      status: 409,
      ok: false,
      message: 'Another repository is being tested. Wait for it to finish, then try again.',
      repository: describeRepository(entry)
    };
  }

  testing = true;
  let ran: { output: string; code: number | null };
  try {
    ran = await runStartGitStep(dir, entry, manifest.document.repositories);
  } finally {
    testing = false;
  }
  const output = ran.output;

  const where0 = `${entry.host}/${entry.path}`;
  if (ran.code !== 0) {
    // Nothing was written, so there is nothing to merge and nothing fresh to
    // report. The script's own words are the answer -- they name what stopped it.
    const why =
      ran.code === null
        ? 'it did not finish within seven minutes and was stopped'
        : `it stopped with status ${ran.code}`;
    return {
      status: 502,
      ok: false,
      message: `Testing ${where0} could not be run: ${why}. ${output.trim() || 'The start script reported nothing.'}`,
      repository: describeRepository(entry)
    };
  }

  const after = readManifest();
  const fresh =
    after.reason === 'ok'
      ? after.document.repositories.find((r) => r.slug === entry.slug)
      : undefined;

  const document: ManifestDocument = {
    generated: after.reason === 'ok' ? after.document.generated : manifest.document.generated,
    repositories: manifest.document.repositories.map((r) =>
      r.slug === entry.slug ? (fresh ?? r) : r
    )
  };
  writeManifestDocument(document);

  const where = `${entry.host}/${entry.path}`;
  if (!fresh) {
    return {
      status: 502,
      ok: false,
      message: `Testing ${where} did not complete: ${output.trim() || 'the start script reported nothing'}`,
      repository: describeRepository(entry)
    };
  }

  const repository = describeRepository(fresh);
  const message = fresh.cloned
    ? `${where} is reachable — its clone is in ./${fresh.clonePath}.`
    : `${where} is still unreachable: ${fresh.error ?? 'the clone failed'} Register the deploy key below on ${where}, then test it again.`;
  return { status: 200, ok: fresh.cloned, message, repository };
}
