import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from './paths';
import { sh, type Result } from './shell';

export const entrypointPath = join(repoRoot, 'config/liquid/entrypoint.sh');
export const LIQUID_SERVICE = 'liquid';
export const CONTAINER_ENTRYPOINT = '/opt/nifi/scripts/entrypoint.sh';
export const NAR_NAMES = ['b2-probe.nar', 'b2-second.nar'];
export const NAR_CONTENT = 'probe\n';
export const LIB_AS_FILE_CONTENT = 'not a directory\n';

export function entrypointText(): string {
  return readFileSync(entrypointPath, 'utf8');
}

export type Sandbox = { base: string; home: string; drop: string; lib: string; launched: string };

export function sandbox(opts: { nars?: string[]; libIsFile?: boolean } = {}): Sandbox {
  const base = mkdtempSync(join(tmpdir(), 'm-b2-entrypoint-'));
  const home = join(base, 'nifi-current');
  const drop = join(home, 'nar_extensions');
  const lib = join(home, 'lib');
  const launched = join(base, 'launched.txt');
  mkdirSync(drop, { recursive: true });
  mkdirSync(join(base, 'scripts'), { recursive: true });
  if (opts.libIsFile) writeFileSync(lib, LIB_AS_FILE_CONTENT);
  else mkdirSync(lib, { recursive: true });
  for (const nar of opts.nars ?? []) writeFileSync(join(drop, nar), NAR_CONTENT);
  writeFileSync(
    join(base, 'scripts/start.sh'),
    `#!/bin/sh\nls -1 ${lib} > ${launched} 2>&1 || echo "(lib is not a directory)" > ${launched}\nexit 0\n`,
    { mode: 0o755 }
  );
  return { base, home, drop, lib, launched };
}

export function runEntrypoint(sb: Sandbox): Result {
  return sh([entrypointPath], repoRoot, { NIFI_BASE_DIR: sb.base, NIFI_HOME: sb.home });
}

export function libContents(sb: Sandbox): string[] {
  if (!existsSync(sb.lib)) return [];
  try {
    return readdirSync(sb.lib).sort();
  } catch {
    return [];
  }
}

export function launchSaw(sb: Sandbox): string {
  return existsSync(sb.launched) ? readFileSync(sb.launched, 'utf8') : '';
}

export function discard(sb: Sandbox): void {
  rmSync(sb.base, { recursive: true, force: true });
}
