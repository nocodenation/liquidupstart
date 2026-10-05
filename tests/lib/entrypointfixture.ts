import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync,
  copyFileSync, chmodSync, symlinkSync
} from 'node:fs';
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

/**
 * The real entrypoint, run from a copy in the sandbox so that the watcher it
 * starts is a stand-in.
 *
 * `NAR_WATCH` and `NAR_CHECK` both resolve beside the script that is running
 * (`entrypoint.sh:23`, `:24`), so running the file in place means the real
 * `nar-watch.sh` -- `while true; do sweep; sleep "$INTERVAL"; done`, which
 * inherits this helper's stdout and stderr. `sh()` is
 * `Bun.spawnSync(..., { stdout: 'pipe', stderr: 'pipe' })`, which on Linux waits
 * for those pipes to close: a plain `./tests/run.sh` blocked in
 * `m-b2.copy-failure-reported` and never returned, and the two cases finished
 * only when the watcher was killed by hand, at 239.6s and 152.4s. On macOS
 * spawnSync returns, and the watcher plus its `sleep` are left reparented to
 * PID 1 after every run -- measured here, 5 pass in 986ms with two processes
 * surviving. One defect, two symptoms, and which one you get belongs to the
 * host. B3 of the 2026-10-01 review.
 *
 * The comment this replaces had it backwards: it set the interval to 3600 and
 * said that "only keeps a stray process out of the run". A longer sleep makes
 * the wait longer.
 *
 * The entrypoint is copied on **every** call, from its real path, so there is no
 * second copy to go stale -- and `m-b4.entrypoint-in-container` separately
 * compares what the container runs against that same file. `narcheck.py` is
 * symlinked rather than stubbed, because what the check permits is part of what
 * these cases assert.
 */
export function runEntrypoint(sb: Sandbox): Result {
  const dir = join(sb.base, 'scripts');
  const entry = join(dir, 'entrypoint.sh');
  copyFileSync(entrypointPath, entry);
  chmodSync(entry, 0o755);
  const link = join(dir, 'narcheck.py');
  if (!existsSync(link)) symlinkSync(join(repoRoot, 'config/liquid/narcheck.py'), link);
  // The stand-in. It is executable and it returns, so the branch at
  // entrypoint.sh:168 is taken exactly as it is in the container -- what differs
  // is only that this one ends. The watcher itself is held by B5-28 to B5-30,
  // which boot NiFi.
  writeFileSync(join(dir, 'nar-watch.sh'), '#!/bin/sh\necho "[nar-watch] stand-in for the suite"\nexit 0\n', {
    mode: 0o755
  });
  return sh([entry], repoRoot, { NIFI_BASE_DIR: sb.base, NIFI_HOME: sb.home });
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
