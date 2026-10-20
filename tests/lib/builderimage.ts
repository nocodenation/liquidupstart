import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
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
 *
 * **The tag is the content, not the run, and that is the repair for a leak.** It
 * used to be `run-<pid>-<random>`, deleted by a `process.on('exit')` handler --
 * and in bun 1.4.2 **that handler does not run**. Measured 2026-10-14: a single
 * passing file left its image behind, and a day's work left 21 of them at about
 * 1 GB each, 9 of those from one default-tier round. Earlier the same day the
 * Docker VM had filled to 100% at 57 of 59 GB, and a build failing with `No space
 * left on device` is indistinguishable from a product failure in the output. The
 * reviewer saw it from outside as two runs leaving two leftovers. N8's
 * out-of-scope note on the 2026-10-14 re-review.
 *
 * An `afterAll` is still wrong, for the reason `dropBuilderImage` gives, so the
 * repair is not to delete more reliably but to stop creating one per run: the tag
 * is a hash of everything `docker build` is given, so two runs over the same tree
 * share one image and two checkouts that differ cannot share. That is the
 * isolation the per-run tag was for, provided by the thing that actually
 * distinguishes them. A changed builder config still leaves its predecessor
 * behind, which the sweep below handles.
 */
const TAG_PREFIX = 'liquidupstart/nar-builder';
const BUILD_CONTEXT = join(repoRoot, 'config/nar_builder');

/**
 * Everything the build context contains, hashed. Paths are relative and sorted,
 * so the digest is the content and nothing about where the checkout lives.
 */
export function builderContextDigest(dir: string = BUILD_CONTEXT): string {
  const files: string[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at).sort()) {
      const full = join(at, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(dir, f));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

/**
 * When docker says a thing was made, in milliseconds, or `null` if it will not say.
 *
 * The parse was inline and it worked: `docker images --format '{{.CreatedAt}}'`
 * prints `2026-06-16 02:01:20 +0200 CEST`, whose `Date.parse` is **NaN** on bun
 * 1.4.3, and the caller stripped the trailing zone **name** -- not the offset --
 * before parsing, which measures correctly on this host (docker 29.8.1,
 * 2026-10-20). It is a function now for three reasons, none of them a defect in
 * what it replaces:
 *
 *   - **two sweeps need it.** The containers get the same age floor as the images
 *     below, so the same reading happens twice, and a second copy is how two
 *     readers come to disagree.
 *   - **an unreadable stamp is a decision, not a fallback.** It read
 *     `Number.isNaN(ms) ? Date.now() : ms` -- dating the object *now*, so it was
 *     kept, which is the right answer arrived at sideways. `null` says it, and a
 *     case can then put it to the rule instead of to the clock.
 *   - **the zone pattern was `[A-Z]{3,4}`**, and `Date.parse` is then handed
 *     whatever a five-letter abbreviation leaves behind. Anchoring on the date,
 *     the time and the **offset** instead means nothing after the offset can
 *     reach the parser, and the same function also takes the RFC 3339 that
 *     `docker inspect` prints.
 *
 * What was actually wrong here is below, and it is not the parse: the container
 * sweep had no age floor at all.
 */
export function parseDockerTime(stamp: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})/.exec(
    stamp.trim()
  );
  if (!m) return null;
  const zone = m[3] === 'Z' ? 'Z' : m[3].length === 5 ? `${m[3].slice(0, 3)}:${m[3].slice(3)}` : m[3];
  const ms = Date.parse(`${m[1]}T${m[2]}${zone}`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Which of the images already on the host this run may remove.
 *
 * A pure function of what `docker images` reports, so the rule is testable
 * without a daemon. Two things it must not do: remove the image this run is
 * about to use, and remove one a **concurrent** run built. The age floor is what
 * covers the second -- a run that is using an image built it seconds or minutes
 * ago, not hours -- and it is why this sweeps rather than deleting everything
 * that is not `keep`.
 *
 * An age of `null` -- docker would not say, or said something unreadable -- keeps
 * the image. *"Cannot measure" is not "stale"*, the rule `SP-4` carries for the
 * disk, and here it is also the only direction that cannot take an image out from
 * under a concurrent run.
 */
export function sweepable(
  images: Array<{ tag: string; createdAtMs: number | null }>,
  keep: string,
  nowMs: number,
  olderThanMs: number = 2 * 60 * 60 * 1000
): string[] {
  return images
    .filter((i) => i.tag !== keep)
    .filter((i) => i.tag.startsWith(`${TAG_PREFIX}:tree-`) || i.tag.startsWith(`${TAG_PREFIX}:run-`))
    .filter((i) => i.createdAtMs !== null && nowMs - i.createdAtMs > olderThanMs)
    .map((i) => i.tag);
}

let built: string | null = null;

export function builderImage(): string {
  if (built) return built;
  const tag = `${TAG_PREFIX}:tree-${builderContextDigest()}`;
  const r = sh(['docker', 'build', '-q', '-t', tag, BUILD_CONTEXT]);
  if (r.code !== 0) {
    throw new Error(`the builder image could not be built from ${BUILD_CONTEXT}:\n${r.output}`);
  }
  built = tag;
  sweepOldBuilderImages(tag);
  return tag;
}

/**
 * Containers left behind by a run that was killed, and which pin the images the
 * sweep below is trying to remove.
 *
 * Found 2026-10-16: `festive_wescoff` had been up for two days holding
 * `liquidupstart/nar-builder:run-47099-xoirn1` -- a probe container from a run
 * that was killed mid-flight. `--rm` does not help there, because it removes a
 * container when it **exits** and this one never did; and the image sweep cannot
 * touch an image a container holds, so one killed run can keep a gigabyte alive
 * indefinitely with nothing saying so.
 *
 * A pure function of what `docker ps -a` reports, for the same reason
 * `sweepable` is one: the rule is then testable without docker.
 *
 * Never a container of this run. The image tag is the discriminator rather than
 * the name, because the names are docker's own when a case does not pass one --
 * which is how the leak was invisible: nothing about `festive_wescoff` says it
 * belongs to this suite.
 *
 * **And never a container of a concurrent run, which is what the age floor is
 * for.** What stood here had none, on the argument that the run in flight is
 * excluded by tag and a concurrent run holds a different tree tag -- true, and
 * beside the point: a *different* tag is exactly what this then removed. The
 * reviewer measured that shape on #19, where the same reasoning had been written
 * into the suite's other sweep: one sweep from a second clone, while a run's
 * first container was up, and that run failed with `never answered on port
 * 32780: … No such container`. The two sweeps answer the same question and now
 * answer it the same way. An unreadable age keeps the container.
 */
export function sweepableContainers(
  containers: Array<{ id: string; image: string; createdAtMs: number | null }>,
  keep: string,
  nowMs: number,
  olderThanMs: number = 2 * 60 * 60 * 1000
): string[] {
  return containers
    .filter((c) => c.image !== keep)
    .filter((c) => c.image.startsWith(`${TAG_PREFIX}:tree-`) || c.image.startsWith(`${TAG_PREFIX}:run-`))
    .filter((c) => c.createdAtMs !== null && nowMs - c.createdAtMs > olderThanMs)
    .map((c) => c.id);
}

/** Remove superseded builder images, best effort and never the one in use. */
function sweepOldBuilderImages(keep: string): void {
  const r = sh(['docker', 'images', TAG_PREFIX, '--format', '{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}']);
  if (r.code !== 0) return;
  const images = r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [tag, created] = l.split('\t');
      return { tag, createdAtMs: parseDockerTime(created ?? '') };
    });
  // Containers first: an image a container holds cannot be removed, so sweeping
  // images alone leaves exactly the gigabyte this is for. Same age floor as the
  // images, because a concurrent run's container is not this run's litter.
  const now = Date.now();
  const ps = sh(['docker', 'ps', '-a', '--format', '{{.ID}}\t{{.Image}}\t{{.CreatedAt}}']);
  if (ps.code === 0) {
    const containers = ps.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [id, image, created] = l.split('\t');
        return { id, image, createdAtMs: parseDockerTime(created ?? '') };
      });
    const stale = sweepableContainers(containers, keep, now);
    if (stale.length) sh(['docker', 'rm', '-f', ...stale]);
  }

  const drop = sweepable(images, keep, now);
  // One call, and failures are ignored: another run may be holding one, which is
  // exactly the case the age floor makes unlikely and docker refuses anyway.
  if (drop.length) sh(['docker', 'rmi', ...drop]);
}

/**
 * Remove the image this process built. A second call is a no-op.
 *
 * **Not for an `afterAll`.** Every file that wants the image captures the tag at
 * module load, so the first file's `afterAll` would pull it out from under the
 * rest: the later `docker run`s then fail with `Unable to find image`, and the
 * assertions report whatever an empty output looks like. Measured, 8 fail across
 * three files.
 *
 * It is no longer registered on process exit, because `process.on('exit')` does
 * not run in bun 1.4.2 -- measured -- and because a content-addressed image is
 * worth keeping: the next run over the same tree reuses it. Exported for a caller
 * that wants the disk back immediately.
 */
export function dropBuilderImage(): void {
  if (!built) return;
  sh(['docker', 'rmi', '-f', built]);
  built = null;
}
