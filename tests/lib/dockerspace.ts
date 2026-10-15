/**
 * How much room the Docker VM has left, because running out of it looks exactly
 * like a product defect.
 *
 * **Twice on 2026-10-14 and 2026-10-15 a full disk was diagnosed as something
 * else.** The VM reached 100% with **0 bytes** free, and a real Maven inside the
 * builder answered
 * `java.nio.file.FileSystemException: /m2/org: No space left on device`. That
 * surfaced as 34 failing cases across M-B5 and M-B6 — refusals that did not
 * refuse, builds that exited 2, `AFTER=0` where a build should have succeeded —
 * and most of an incompatibility analysis between #10 and #25 had been written
 * before the build was probed by hand. The morning before, the same condition
 * produced a reading reported as a "harness artifact" in a review round.
 *
 * `docker system df` does not say this. It reported *20% reclaimable* while the
 * filesystem had nothing left, because it measures what images and containers
 * occupy and not what the VM has free. The number that matters came from
 * `df` **inside** a container, and the space was in the **build cache**: 39.7 GB,
 * none of which any test accounts for.
 *
 * So this is read, not remembered, and it is read where it bites.
 */
import { sh } from './shell';

/** The floor, and where the number comes from rather than a guess. */
export const FLOOR_BYTES = Number(process.env.LU_DISK_FLOOR_BYTES) || 2 * 1024 * 1024 * 1024;

/**
 * Free bytes on the Docker VM's filesystem, or `null` when docker cannot say.
 *
 * Measured from inside a container because that is the filesystem the builds
 * write to; the host's own `df` describes a different disk entirely on Docker
 * Desktop. `null` rather than `0` when docker is unreachable, because "no answer"
 * and "no space" must not be the same reading — a machine without docker should
 * not be told its disk is full.
 */
export function vmFreeBytes(): number | null {
  const r = sh(['docker', 'run', '--rm', '--entrypoint', 'sh', 'alpine', '-c', 'df -kP / | tail -1']);
  if (r.code !== 0) return null;
  const kb = Number(r.stdout.trim().split(/\s+/)[3]);
  return Number.isFinite(kb) ? kb * 1024 : null;
}

export type Verdict = { ok: boolean; message: string };

/**
 * The decision, as a pure function of the reading, so it can be tested without
 * filling a disk.
 *
 * An unknown reading is **ok**: a guard that stops a run because it could not
 * measure is worse than the thing it guards against, and docker being absent is
 * already reported by every case that needs it.
 */
export function spaceVerdict(freeBytes: number | null, floorBytes: number = FLOOR_BYTES): Verdict {
  const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;
  if (freeBytes === null) {
    return { ok: true, message: 'docker could not be asked how much space the VM has; continuing' };
  }
  if (freeBytes >= floorBytes) {
    return { ok: true, message: `the Docker VM has ${mb(freeBytes)} free` };
  }
  return {
    ok: false,
    message:
      `the Docker VM has ${mb(freeBytes)} free, below the ${mb(floorBytes)} floor.\n` +
      '  Builds will fail with "No space left on device", and that reads as a product failure:\n' +
      '  a refusal that does not refuse, a build that exits 2, an AccessDeniedException.\n' +
      '  This has been misdiagnosed twice. Reclaim first:\n' +
      '      docker builder prune -af && docker image prune -f\n' +
      '  The build cache is usually the one holding it, and `docker system df` will say\n' +
      '  "reclaimable" while the filesystem has nothing left. Set LU_DISK_FLOOR_BYTES to\n' +
      '  change the floor deliberately. One cold builder image build costs about 305 MB,\n' +
      '  measured 2026-10-15, which is where the default comes from.'
  };
}

/** Throws when there is not enough room, with that message. Injectable for cases. */
export function requireSpaceForDockerBuild(
  what: string,
  read: () => number | null = vmFreeBytes,
  floorBytes: number = FLOOR_BYTES
): void {
  const v = spaceVerdict(read(), floorBytes);
  if (!v.ok) throw new Error(`${what}: ${v.message}`);
}
