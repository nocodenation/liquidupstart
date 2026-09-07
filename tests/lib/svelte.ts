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
        }
      },
      loader: 'object'
    }));
    for (const [specifier, path] of libModules()) {
      build.module(specifier, async () => ({ exports: await import(path), loader: 'object' }));
    }
  }
});
