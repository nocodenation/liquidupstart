import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot } from './paths';
import { sh } from './shell';
import { parseDockerTime } from './dockertime';

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

let built: string | null = null;

export function builderImage(): string {
  if (built) return built;
  const tag = `${TAG_PREFIX}:tree-${builderContextDigest()}`;
  // Before the build: a full Docker VM is the state the sweep relieves and the
  // state in which the build throws.
  sweepAbandonedBuilderObjects();
  const r = sh(['docker', 'build', '-q', '-t', tag, ...builderLabels(), BUILD_CONTEXT]);
  if (r.code !== 0) {
    throw new Error(`the builder image could not be built from ${BUILD_CONTEXT}:\n${r.output}`);
  }
  built = tag;
  return tag;
}

/**
 * Whose a builder object is, and whether it was abandoned.
 *
 * Every builder image this suite builds carries three labels, and a container
 * inherits its image's, so each listing is narrowed at the daemon and nothing of
 * the operator's is listed. The run label says which run made it, and nothing of
 * this run's is removed. The age keeps a concurrent run's objects: past two hours,
 * longer than any builder case may run, an object is abandoned.
 *
 * A killed run leaves its container running, and `--rm` never fires for it, so
 * it pins its image. That is why containers are swept, and swept first.
 */
export const BUILDER_LABEL = 'lu-builder';
export const BUILDER_RUN_LABEL = 'lu-builder-run';
export const BUILDER_MADE_LABEL = 'lu-builder-made';

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

const labelValue = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' || t === '<no value>' ? null : t;
};

const rowsOf = (out: string): Listed[] =>
  out
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const [ref, runId, made] = l.split('\t');
      return { ref: (ref ?? '').trim(), runId: labelValue(runId), madeAtMs: parseDockerTime(made ?? '') };
    });

/**
 * `<ref> <run id> <made at>` for every object of one kind that carries `<key>=1`.
 *
 * A container's age is its own `CreatedAt`, because the label it inherits is its
 * image's build time. An image's is its `lu-builder-made` label, because its
 * `.Created` is its config's and a cache hit copies it; and it is read through
 * `inspect`, because the `docker images` format has no label field. An image's
 * ref is its tags under `liquidupstart/nar-builder`, comma-separated, so a tag
 * someone else gave it stays; its id where it has no tag at all; and nothing,
 * so it is kept, where all its tags are someone else's.
 */
function listLabelled(kind: 'ps' | 'images', key: string): { rows: Listed[]; ok: boolean } {
  if (kind === 'ps') {
    const r = sh([
      'docker', 'ps', '-a', '--filter', `label=${key}=1`,
      '--format', `{{.ID}}\t{{.Label "${BUILDER_RUN_LABEL}"}}\t{{.CreatedAt}}`
    ]);
    return r.code === 0 ? { rows: rowsOf(r.stdout), ok: true } : { rows: [], ok: false };
  }
  const listed = sh(['docker', 'images', '-q', '--no-trunc', '--filter', `label=${key}=1`]);
  if (listed.code !== 0) return { rows: [], ok: false };
  const ids = [...new Set(listed.stdout.split('\n').map((l) => l.trim()).filter(Boolean))];
  if (ids.length === 0) return { rows: [], ok: true };
  const r = sh([
    'docker', 'image', 'inspect', '-f',
    `{{.Id}}|{{join .RepoTags ","}}\t{{index .Config.Labels "${BUILDER_RUN_LABEL}"}}\t{{index .Config.Labels "${BUILDER_MADE_LABEL}"}}`,
    ...ids
  ]);
  // An id removed since the listing makes inspect exit 1 and still print the rest,
  // or nothing at all when every one of them went.
  if (r.code !== 0 && r.stdout.trim() === '' && !/No such image/i.test(r.stderr)) return { rows: [], ok: false };
  const rows = rowsOf(r.stdout).map((o) => {
    const [id, tags] = o.ref.split('|');
    const all = (tags ?? '').split(',').filter(Boolean);
    const ours = all.filter((t) => t.startsWith(`${TAG_PREFIX}:`));
    return { ...o, ref: ours.length ? ours.join(',') : all.length ? '' : id };
  });
  return { rows, ok: true };
}

/**
 * Remove builder objects a run abandoned, and say so when docker refuses.
 *
 * Containers first, because an image a container holds cannot be removed. With
 * `-f`, because what a killed run leaves is a running container, and only for
 * what `sweepableObjects` chose: labelled, not this run's, and past the floor.
 * Every result is read, and what was refused is returned and written to stderr.
 * `key` and `nowMs` are for the case that puts this to docker.
 */
export function sweepAbandonedBuilderObjects(key: string = BUILDER_LABEL, nowMs: number = Date.now()): string[] {
  const refusals: string[] = [];

  const containers = listLabelled('ps', key);
  if (containers.ok) {
    for (const id of sweepableObjects(containers.rows, BUILDER_RUN_ID, nowMs)) {
      const r = sh(['docker', 'rm', '-f', id]);
      if (r.code !== 0) refusals.push(`container ${id}: ${r.output.trim().split('\n')[0]}`);
    }
  } else {
    refusals.push('docker ps could not be read, so no container was swept');
  }

  const images = listLabelled('images', key);
  if (images.ok) {
    for (const ref of sweepableObjects(images.rows, BUILDER_RUN_ID, nowMs)) {
      // An image a concurrent run's container holds is refused, which is
      // harmless; it is reported, not thrown.
      const r = sh(['docker', 'rmi', ...ref.split(',')]);
      if (r.code !== 0) refusals.push(`image ${ref}: ${r.output.trim().split('\n')[0]}`);
    }
  } else {
    refusals.push('docker images could not be read, so no image was swept');
  }

  if (refusals.length > 0) {
    process.stderr.write(
      `builder sweep left ${refusals.length} object(s) behind:\n  ${refusals.join('\n  ')}\n`
    );
  }
  return refusals;
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
