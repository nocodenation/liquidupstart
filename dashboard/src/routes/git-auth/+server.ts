import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

function secretsDir(): string {
  const envDir = process.env.ENV_DIR ?? resolve(process.cwd(), '..');
  return join(envDir, 'volumes', '_git-secrets');
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

export async function GET() {
  const dir = secretsDir();
  const pub = join(dir, 'id_ed25519.pub');

  if (!existsSync(pub)) {
    return Response.json({
      present: false,
      message: 'No agent deploy key yet. Start the stack once to generate one.'
    });
  }

  const publicKey = readFileSync(pub, 'utf8').trim();
  return Response.json({
    present: true,
    publicKey,
    fingerprint: fingerprint(pub),
    instructions:
      'Add this as a deploy key in the repository settings on GitHub. ' +
      'Grant write access only if the agents need to push to that repository.'
  });
}
