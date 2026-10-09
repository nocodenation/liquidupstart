import { join } from 'node:path';
import { repoRoot } from './paths';
import { sh } from './shell';

/**
 * The builder image, built from the tree under test and tagged per run.
 *
 * **Why not `liquidupstart/nar-builder:latest`.** Four M-B5 files named that tag,
 * and whatever it points at on the host is what they measured. On 2026-10-07 that
 * turned out to have hidden a real defect for two days: the host's copy was dated
 * 2026-09-14, before the unprivileged `builder` user existed, so `run_maven` took
 * its direct branch, a stub on `PATH` was found, and `/m2`'s ownership never
 * mattered. The same files reported 121 pass / 0 fail against an image that
 * lacked the very user the change under test introduces. When the image was
 * rebuilt they went red at once, and two of their assertions had been passing
 * because nothing was built at all.
 *
 * HANDOFF records the shape as *"a locally built image can belong to another
 * branch"*; this is that, with the suite as the victim rather than the operator.
 * S9 of the 2026-10-01 review is the same finding from outside.
 *
 * So the image is built here, from `config/nar_builder` as it stands in this
 * tree, and tagged per run so two checkouts cannot measure each other's. A warm
 * layer cache makes it 0.7s, measured; a cold one is bounded by a 41MB apt layer.
 *
 * Memoised per process, so a file that asks twice and a run that loads several
 * files pay for one build.
 */
let built: string | null = null;
let registered = false;

export function builderImage(): string {
  if (built) return built;
  const tag = `liquidupstart/nar-builder:run-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const r = sh(['docker', 'build', '-q', '-t', tag, join(repoRoot, 'config/nar_builder')]);
  if (r.code !== 0) {
    throw new Error(
      `the builder image could not be built from ${join(repoRoot, 'config/nar_builder')}:\n${r.output}`
    );
  }
  built = tag;
  // Once, after every file in this process -- see dropBuilderImage.
  if (!registered) {
    registered = true;
    process.on('exit', () => dropBuilderImage());
  }
  return tag;
}

/**
 * Remove it. A second call is a no-op.
 *
 * **Not for an `afterAll`.** Every file that wants the image captures the tag at
 * module load, so the first file's `afterAll` would pull it out from under the
 * rest: the later `docker run`s then fail with `Unable to find image`, and the
 * assertions report whatever an empty output looks like. Measured, 8 fail across
 * three files. It is registered on process exit instead, which runs once after
 * every file the run loaded.
 */
export function dropBuilderImage(): void {
  if (!built) return;
  sh(['docker', 'rmi', '-f', built]);
  built = null;
}
