import { plugin } from 'bun';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './paths';

const LIB = join(repoRoot, 'dashboard', 'src', 'lib');

export const ROUTES = join(repoRoot, 'dashboard', 'src', 'routes');

export class Redirect extends Error {
  status: number;
  location: string;
  constructor(status: number, location: string) {
    super(`redirect ${status} ${location}`);
    this.status = status;
    this.location = location;
  }
}

export function redirectFrom(err: unknown): Redirect | null {
  return err instanceof Redirect ? err : null;
}

function libModules(dir: string = LIB, prefix = '$lib'): [string, string][] {
  const found: [string, string][] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...libModules(full, `${prefix}/${entry.name}`));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push([`${prefix}/${entry.name.slice(0, -3)}`, full]);
    }
  }
  return found;
}

plugin({
  name: 'dashboard-server-modules',
  setup(build) {
    build.module('@sveltejs/kit', () => ({
      exports: {
        redirect(status: number, location: string): never {
          throw new Redirect(status, location);
        },
        // `json` and `error` since 2026-09-18: routes that answer with data
        // rather than a redirect could not be imported at all, so start-skip --
        // the route behind every Skip button -- had no case of its own until a
        // reviewer found that it refuses a capital letter.
        json(data: unknown, init?: ResponseInit): Response {
          return new Response(JSON.stringify(data), {
            ...init,
            headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
          });
        },
        error(status: number, body?: unknown): never {
          // SvelteKit throws an object carrying the status; a case reads that
          // status, so the shape matters more than the class.
          throw Object.assign(new Error(typeof body === 'string' ? body : 'error'), {
            status,
            body: typeof body === 'string' ? { message: body } : body
          });
        }
      },
      loader: 'object'
    }));
    for (const [specifier, path] of libModules()) {
      build.module(specifier, async () => ({ exports: await import(path), loader: 'object' }));
    }
  }
});
