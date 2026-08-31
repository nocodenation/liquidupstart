import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

type ManifestEntry = {
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

function envDir(): string {
  return process.env.ENV_DIR ?? resolve(process.cwd(), '..');
}

function secretsDir(): string {
  return join(envDir(), 'volumes', '_git-secrets');
}

function fingerprint(path: string): string | null {
  try {
    return execFileSync('ssh-keygen', ['-l', '-f', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function declaredRepositories() {
  const manifest = join(secretsDir(), 'repositories.json');
  if (!existsSync(manifest)) return [];
  let entries: ManifestEntry[];
  try {
    entries = JSON.parse(readFileSync(manifest, 'utf8')).repositories ?? [];
  } catch {
    return [];
  }
  return entries.map((entry) => {
    const pub = join(envDir(), entry.publicKeyFile);
    const present = existsSync(pub);
    return {
      name: entry.name,
      label: `${entry.host}/${entry.path}`,
      url: entry.url,
      host: entry.host,
      path: entry.path,
      slug: entry.slug,
      access: entry.access,
      policy: entry.policy,
      publicKey: present ? readFileSync(pub, 'utf8').trim() : null,
      fingerprint: present ? fingerprint(pub) : null,
      cloned: entry.cloned,
      clonePath: entry.clonePath,
      error: entry.error,
      instructions:
        `Add this key as a deploy key on ${entry.host}/${entry.path}` +
        (entry.access === 'write' ? ', with write access.' : ', read-only.')
    };
  });
}

export async function GET() {
  const pub = join(secretsDir(), 'id_ed25519.pub');
  const repositories = declaredRepositories();

  if (!existsSync(pub)) {
    return Response.json({
      present: false,
      message: 'No agent deploy key yet. Start the stack once to generate one.',
      repositories
    });
  }

  return Response.json({
    present: true,
    publicKey: readFileSync(pub, 'utf8').trim(),
    fingerprint: fingerprint(pub),
    instructions:
      'Add this as a deploy key in the repository settings on GitHub. ' +
      'Grant write access only if the agents need to push to that repository.',
    repositories
  });
}
