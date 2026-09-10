import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeRepository,
  fingerprint,
  readManifest,
  retryRepository,
  secretsDir
} from '$lib/server/git';

function repositories() {
  const manifest = readManifest();
  return manifest.reason === 'ok' ? manifest.document.repositories.map(describeRepository) : [];
}

export async function GET() {
  const pub = join(secretsDir(), 'id_ed25519.pub');

  if (!existsSync(pub)) {
    return Response.json({
      present: false,
      message: 'No agent deploy key yet. Start the stack once to generate one.',
      repositories: repositories()
    });
  }

  return Response.json({
    present: true,
    publicKey: readFileSync(pub, 'utf8').trim(),
    fingerprint: fingerprint(pub),
    instructions:
      'Add this as a deploy key in the repository settings on GitHub. ' +
      'Grant write access only if the agents need to push to that repository.',
    repositories: repositories()
  });
}

// The retry U2 asks for: a real clone of one declared repository, named over
// HTTP, so the name is looked up in the manifest before anything runs.
export async function POST({ request }: { request: Request }) {
  const origin = request.headers.get('origin');
  if (process.env.ORIGIN && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }

  let name = '';
  try {
    name = String(((await request.json()) as { name?: unknown })?.name ?? '');
  } catch {
    return Response.json(
      { ok: false, message: 'Expected a JSON body naming a declared repository.' },
      { status: 400 }
    );
  }

  const result = await retryRepository(name);
  return Response.json(
    { ok: result.ok, message: result.message, repository: result.repository },
    { status: result.status }
  );
}
