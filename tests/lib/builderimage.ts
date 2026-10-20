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
  if (!Number.isFinite(ms)) return null;
  // **A sentinel is not an age.** `1970-01-01` parses to 0 and Go's zero time to
  // -62135596800000; both are finite, both read as maximally stale, and both are
  // reachable -- BuildKit stamps an image from `SOURCE_DATE_EPOCH`, which
  // `tests/lib/shell.ts` forwards wholesale. A concurrent run's object would then
  // be removed the moment it appeared. Anything before this project existed is
  // treated as unreadable, which keeps it.
  return ms < Date.parse('2020-01-01T00:00:00Z') ? null : ms;
}

let built: string | null = null;

export function builderImage(): string {
  if (built) return built;
  const tag = `${TAG_PREFIX}:tree-${builderContextDigest()}`;
  // **Before the build, not after it.** It ran after, so the one state it exists
  // to relieve -- the Docker VM full, which this file's own header records at 57
  // of 59 GB with 34 phantom failures -- is the state in which the build throws
  // and the sweep is never reached. It needs nothing the build produces: it is a
  // function of what docker reports about labelled objects.
  sweepAbandonedBuilderObjects();
  const r = sh(['docker', 'build', '-q', '-t', tag, ...builderLabels(), BUILD_CONTEXT]);
  if (r.code !== 0) {
    throw new Error(`the builder image could not be built from ${BUILD_CONTEXT}:\n${r.output}`);
  }
  built = tag;
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
 * **Ownership is a label, and the first two answers here guessed it from the
 * image name.** That cost three things, each measured on 2026-10-20:
 *
 *   - **The leak that recurs was exempt.** `c.image !== keep` protects the run in
 *     flight -- and `B6-39` made the tag content-addressed, so `keep` is the
 *     *same string* on every run over an unchanged `config/nar_builder`. A
 *     container left by a killed run therefore sits on exactly `keep` and was
 *     never swept, at any age. Measured: a 48h leftover on `keep` gave `[]`,
 *     while the legacy `run-47099-xoirn1` tag gave `['old_leak']` -- and nothing
 *     has minted the `run-` scheme since `B6-39`. The sweep reached only the
 *     shape that no longer happens.
 *   - **Four more tag schemes were invisible.** `m-b6.build-privileges`,
 *     `m-b6.budget-stops-the-build`, `m-b6.ordinary-projects` and
 *     `m-b6.concurrent-and-strays` each mint `b6-`, `b6s2-`, `b6s7-` and `b6c-`.
 *     `liquidupstart/nar-builder:b6c-10699-o4032x`, 1.02 GB, was five days old on
 *     this host and unswept.
 *   - **`docker ps -a` enumerated the operator's installation.** This runs in the
 *     *default* tier -- two unit files call `builderImage()` at module load --
 *     against `tests/run.sh`'s stated contract that a bare `docker` touches
 *     nothing of the operator's. 21 live stack containers were listed and the
 *     only thing between them and removal was a `startsWith`.
 *
 * So the suite labels what it creates, and the daemon does the narrowing. The
 * label answers *whose*; the age still answers *abandoned or in flight*, because
 * a concurrent run's objects are not ours either and must survive. `{{.Image}}`
 * stops being load-bearing, which also closes the case where docker renders a
 * bare image id once the tag stops resolving.
 */
export const BUILDER_LABEL = 'lu-builder';
export const BUILDER_RUN_LABEL = 'lu-builder-run';
const BUILDER_MADE_LABEL = 'lu-builder-made';

/**
 * This run's id for builder objects.
 *
 * Deliberately **not** imported from `dashboardserver.ts`: that module is this
 * suite's dashboard fixture and pulling it in here would make every builder file
 * depend on it. When both branches are on `main` the two should become one
 * helper -- `BACKLOG.md` carries that as an entry rather than leaving it to be
 * noticed.
 */
export const BUILDER_RUN_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** The labels every builder image and container this suite creates must carry. */
export function builderLabels(): string[] {
  return [
    '--label', `${BUILDER_LABEL}=1`,
    '--label', `${BUILDER_RUN_LABEL}=${BUILDER_RUN_ID}`,
    '--label', `${BUILDER_MADE_LABEL}=${new Date().toISOString()}`
  ];
}

/**
 * Which of these labelled objects this run may remove.
 *
 * A pure function of what docker reported, so the rule is testable without a
 * daemon. Two things it must not do: remove anything of this run's, and remove
 * anything a **concurrent** run is using. The first is identity now; the second
 * is the age floor, and it is the only thing the floor is still for.
 *
 * An unreadable age keeps the object: *"cannot measure" is not "abandoned"*.
 */
export function sweepableObjects(
  objects: Array<{ ref: string; runId: string | null; madeAtMs: number | null }>,
  ownRunId: string,
  nowMs: number,
  olderThanMs: number = 2 * 60 * 60 * 1000
): string[] {
  return objects
    .filter((o) => o.ref && o.runId !== ownRunId)
    .filter((o) => o.madeAtMs !== null && nowMs - o.madeAtMs > olderThanMs)
    .map((o) => o.ref);
}

type Listed = { ref: string; runId: string | null; madeAtMs: number | null };

/**
 * `<ref> <run id> <made at>` for every labelled object of one kind.
 *
 * The **label** carries the time, not `{{.Created}}`: an image's `.Created` is
 * its config's timestamp and a cache hit copies it, so two images built three
 * seconds apart reported the same instant and a content-addressed image in use
 * today read as five days old. Measured 2026-10-20, which is also what the
 * image half of the old floor rested on without saying so.
 */
function listLabelled(kind: 'ps' | 'images'): { rows: Listed[]; ok: boolean } {
  const fmt = kind === 'ps' ? '{{.ID}}' : '{{.Repository}}:{{.Tag}}';
  // **A container's own creation time, an image's label.**
  //
  // Labelling the five builds is enough to reach every container, because a
  // container **inherits its image's labels** -- measured 2026-10-20: a
  // container started with no label of its own from an image built with
  // `--label lu-builder=1` is returned by
  // `docker ps -aq --filter label=lu-builder=1`. That is why this change is five
  // lines rather than one per `docker run` site.
  //
  // The inherited *time*, though, is the **build's**, not the container's. A
  // container started a minute ago from a three-hour-old image would read as
  // three hours old and be swept while live. A container's `{{.CreatedAt}}` is a
  // true creation time, so that is what is read for a container; an image's is
  // its config's and a cache hit copies it, so there the label is the only
  // honest answer. One asymmetry, for one measured reason each.
  const made = kind === 'ps' ? '{{.CreatedAt}}' : `{{.Label "${BUILDER_MADE_LABEL}"}}`;
  const r = sh([
    ...(kind === 'ps' ? ['docker', 'ps', '-a'] : ['docker', 'images']),
    '--filter', `label=${BUILDER_LABEL}=1`,
    '--format', `${fmt}\t{{.Label "${BUILDER_RUN_LABEL}"}}\t${made}`
  ]);
  if (r.code !== 0) return { rows: [], ok: false };
  const rows = r.stdout
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const parts = l.split('\t');
      return {
        ref: (parts[0] ?? '').trim(),
        runId: parts[1] ? parts[1].trim() || null : null,
        madeAtMs: parseDockerTime(parts[2] ?? '')
      };
    });
  return { rows, ok: true };
}

/**
 * Remove builder objects a run abandoned, and say so when docker refuses.
 *
 * Containers first: an image a container holds cannot be removed, so sweeping
 * images alone leaves exactly the gigabyte this is for. **Asserted by a case**,
 * because swapping the two kept all 24 green before.
 *
 * `docker rm` without `-f`. The daemon refuses to remove a running container,
 * and that refusal is the second guard the image half has always had -- `-f`
 * removed it, so a mistake here went from a no-op to a SIGKILL of somebody
 * else's build. And the result is **read**: the defect this whole file exists
 * against is a gigabyte staying alive with nothing saying so, and ignoring the
 * status of the call that reclaims it reproduces exactly that.
 */
function sweepAbandonedBuilderObjects(): void {
  const now = Date.now();
  const refusals: string[] = [];

  const containers = listLabelled('ps');
  if (containers.ok) {
    for (const id of sweepableObjects(containers.rows, BUILDER_RUN_ID, now)) {
      const r = sh(['docker', 'rm', id]);
      if (r.code !== 0) refusals.push(`container ${id}: ${r.output.trim().split('\n')[0]}`);
    }
  } else {
    refusals.push('docker ps could not be read, so no container was swept');
  }

  const images = listLabelled('images');
  if (images.ok) {
    for (const tag of sweepableObjects(images.rows, BUILDER_RUN_ID, now)) {
      const r = sh(['docker', 'rmi', tag]);
      // An image a concurrent run holds is refused by the daemon, which is the
      // expected and harmless case -- it is reported at the end, not thrown.
      if (r.code !== 0) refusals.push(`image ${tag}: ${r.output.trim().split('\n')[0]}`);
    }
  } else {
    refusals.push('docker images could not be read, so no image was swept');
  }

  if (refusals.length > 0) {
    process.stderr.write(
      `builder sweep left ${refusals.length} object(s) behind:\n  ${refusals.join('\n  ')}\n`
    );
  }
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
