import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from './paths';
import { sh, type Result } from './shell';

export const entrypointPath = join(repoRoot, 'config/liquid/entrypoint.sh');
export const LIQUID_SERVICE = 'liquid';
export const CONTAINER_ENTRYPOINT = '/opt/nifi/scripts/entrypoint.sh';
export const NAR_NAMES = ['b2-probe.nar', 'b2-second.nar'];
export const NAR_ENTRY = 'probe.txt';
export const NAR_CONTENT = 'probe\n';
export const LIB_AS_FILE_CONTENT = 'not a directory\n';

export function entrypointText(): string {
  return readFileSync(entrypointPath, 'utf8');
}

// A NAR the entrypoint is willing to open. Until M-B4 the sandbox wrote the
// bytes `probe\n` under a .nar name, because the entrypoint copied files and
// never looked inside one. FR36's check does look: it reads every class the
// bundle carries, and a file that is not an archive is refused rather than
// copied. So the fixture is now a real archive carrying a single entry,
// probe.txt, with those same bytes in it -- no classes, therefore nothing to
// judge, and the copy B2-5 and B2-6 are about is what is left being asserted.
export function writeNar(path: string): void {
  const script = `import zipfile,sys
z = zipfile.ZipFile(sys.argv[1], "w")
z.writestr(sys.argv[2], sys.argv[3])
z.close()`;
  const r = sh(['python3', '-c', script, path, NAR_ENTRY, NAR_CONTENT]);
  if (r.code !== 0) throw new Error(`could not write the sandbox NAR ${path}: ${r.output}`);
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
  for (const nar of opts.nars ?? []) writeNar(join(drop, nar));
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
