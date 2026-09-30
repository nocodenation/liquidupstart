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
export const LOAD_AS_FILE_CONTENT = 'not a directory\n';

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

// `drop` is the inbox everyone writes to and `load` is what NiFi auto-loads
// from. They were one directory until 2026-09-29, which is why a bundle copied
// in by hand was loaded unjudged -- item 11 of the 2026-09-28 review. The
// sandbox mirrors the split, so what these cases assert is what the container
// does.
export type Sandbox = {
  base: string;
  home: string;
  drop: string;
  load: string;
  lib: string;
  launched: string;
};

export function sandbox(opts: { nars?: string[]; loadIsFile?: boolean } = {}): Sandbox {
  const base = mkdtempSync(join(tmpdir(), 'm-b2-entrypoint-'));
  const home = join(base, 'nifi-current');
  const drop = join(home, 'nar_inbox');
  const load = join(home, 'nar_extensions');
  const lib = join(home, 'lib');
  const launched = join(base, 'launched.txt');
  mkdirSync(drop, { recursive: true });
  mkdirSync(join(base, 'scripts'), { recursive: true });
  // The destination that can fail. It used to be lib/, which is where approved
  // bundles went before the split.
  if (opts.loadIsFile) writeFileSync(load, LOAD_AS_FILE_CONTENT);
  else mkdirSync(load, { recursive: true });
  mkdirSync(lib, { recursive: true });
  for (const nar of opts.nars ?? []) writeNar(join(drop, nar));
  writeFileSync(
    join(base, 'scripts/start.sh'),
    `#!/bin/sh\nls -1 ${load} > ${launched} 2>&1 || echo "(the load directory is not a directory)" > ${launched}\nexit 0\n`,
    { mode: 0o755 }
  );
  return { base, home, drop, load, lib, launched };
}

export function runEntrypoint(sb: Sandbox): Result {
  // NAR_WATCH resolves beside the entrypoint, so in this sandbox it is the real
  // nar-watch.sh -- a loop that never returns. These cases are about the pass
  // the entrypoint makes before the launch; the watcher is held by B5-28 to
  // B5-30, which boot NiFi. `sh` starts it in the background either way, so
  // this only keeps a stray process out of the run.
  return sh([entrypointPath], repoRoot, {
    NIFI_BASE_DIR: sb.base,
    NIFI_HOME: sb.home,
    NAR_WATCH_INTERVAL_SECONDS: '3600'
  });
}

export function loadContents(sb: Sandbox): string[] {
  if (!existsSync(sb.load)) return [];
  try {
    return readdirSync(sb.load).sort();
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
