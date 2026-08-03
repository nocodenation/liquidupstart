import { json } from '@sveltejs/kit';
import { readAppPassword, writeAppPassword } from '$lib/server/project';

export function GET() {
  return json({ password: readAppPassword() });
}

export async function POST({ request }) {
  const origin = request.headers.get('origin');
  if (process.env.ORIGIN && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid body' }, { status: 400 });
  }

  const password = (body as { password?: unknown })?.password;
  if (typeof password !== 'string' || password.trim() === '') {
    return json({ error: 'password is required' }, { status: 400 });
  }

  try {
    writeAppPassword(password);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
