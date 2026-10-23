/**
 * M-B6 · Integration · The builder sweep removes what a killed run left running
 *
 * Purpose:  B6-41's unit cases hold the decision; this holds the docker around it.
 *           Until 2026-10-22 neither half removed anything real, with every case
 *           green: the `docker images` format has no label field, so the image
 *           listing failed on the first labelled image, and `docker rm` without
 *           `-f` is refused for a running container, which is the only kind a
 *           killed run leaves -- `festive_wescoff` was up for two days. Items 1 to
 *           3 of the review of #40.
 * Given:    Three images built `FROM alpine:3` under a label key of this run's
 *           own, so nothing else on the host can be selected: `old`, made three
 *           hours ago by run `999-zzzzzz`; `new`, made now by this run; and
 *           `fresh`, made now by `999-zzzzzz`. A `sleep 600` container from `old`
 *           and from `new`; `fresh` also tagged `lu-b641-other:<BUILDER_RUN_ID>`, a tag
 *           the suite does not give; and a `docker` first on PATH that records every
 *           call and refuses a listing without a label filter.
 * When:     The sweep runs with that key twice: on the real clock, and with the
 *           clock three hours on.
 * Then:     On the real clock the old container still runs, because its own age
 *           is minutes, and the old image is tried, because its label makes it
 *           three hours old, and refused while that container holds it; `fresh`
 *           is kept, although its config's own date is alpine's, five weeks back.
 *           Three hours on, the old container and the old image are gone, and so is
 *           `fresh`'s own tag, while the image stays under the other tag;
 *           the new container still runs and the new image is still there; nothing
 *           else that existed before is gone; and every listing carried the filter.
 * Covers:   B6-41
 * Negative: what is kept: on the real clock the old container and `fresh`; the run
 *           in flight's container and image; a tag the suite did not give; and every
 *           other container and image on the host.
 * Counterpart: three hours on, the running old container, its image and `fresh`'s
 *           tag removed, so a sweep that removes nothing cannot pass.
 *
 * Test data: the key `lu-builder-b641-<BUILDER_RUN_ID>`, which the sweep is run with,
 * so it cannot select anything else on the host. The images also carry
 * `lu-builder=1`, and the containers `--rm`, so what a killed run of this case leaves
 * is reclaimed like any other builder object; the other tag, which no sweep takes,
 * is removed by the next run of this case before it builds. The labels `lu-builder-run` =
 * `999-zzzzzz` and `lu-builder-made` = three hours before the build on `old`, and
 * this run's id and the build's time on `new`, `999-zzzzzz` and the build's time on
 * `fresh`; tags `liquidupstart/nar-builder:b6-41-old-<BUILDER_RUN_ID>`, `…:b6-41-new-<BUILDER_RUN_ID>`
 * and `…:b6-41-fresh-<BUILDER_RUN_ID>`. Built `FROM alpine:3` alone, an image's `.Created`
 * is alpine's: 2026-09-17 on this host, measured 2026-10-22, which is the cache copy the
 * made label exists for. Containers
 * `lu-b641-old-<BUILDER_RUN_ID>` and `lu-b641-new-<BUILDER_RUN_ID>`. The clock is moved
 * rather than the objects, because a container's age is its own creation time, which
 * a case cannot set.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import {
  sweepAbandonedBuilderObjects,
  BUILDER_RUN_ID,
  BUILDER_RUN_LABEL,
  BUILDER_MADE_LABEL
} from '../lib/builderimage';
import { parseDockerTime } from '../lib/dockertime';

const KEY = `lu-builder-b641-${BUILDER_RUN_ID}`;
const HOUR = 60 * 60 * 1000;
const OLD = { tag: `liquidupstart/nar-builder:b6-41-old-${BUILDER_RUN_ID}`, name: `lu-b641-old-${BUILDER_RUN_ID}` };
const NEW = { tag: `liquidupstart/nar-builder:b6-41-new-${BUILDER_RUN_ID}`, name: `lu-b641-new-${BUILDER_RUN_ID}` };
const FRESH = { tag: `liquidupstart/nar-builder:b6-41-fresh-${BUILDER_RUN_ID}`, name: '' };
const OTHER = `lu-b641-other:${BUILDER_RUN_ID}`;

const work = mkdtempSync(join(tmpdir(), 'lu-b641-'));
const log = join(work, 'docker.log');
const ids = { oldImage: '', freshImage: '', oldContainer: '' };
const before = { containers: [] as string[], images: [] as string[] };
const after = { containers: [] as string[], images: [] as string[] };
let setup = '';
let first: string[] = [];
let second: string[] = [];
let running = { old: '', new: '' };
let tagged = { old: '', new: '', fresh: '', other: '' };
let freshAfterFirst = '';
let freshCreated = 0;

const list = (args: string[]) => sh(['docker', ...args]).stdout.split('\n').map((l) => l.trim()).filter(Boolean);
const state = (name: string) => sh(['docker', 'inspect', '-f', '{{.State.Status}}', name]).stdout.trim();
const image = (tag: string) => sh(['docker', 'image', 'inspect', '-f', '{{.Id}}', tag]).stdout.trim();

function withRecordingDocker<T>(fn: () => T): T {
  const bin = join(work, 'bin');
  sh(['mkdir', '-p', bin]);
  const real = sh(['sh', '-c', 'command -v docker']).stdout.trim();
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh
printf '%s\\n' "$*" >> '${log}'
case "$1" in
  ps|images) case "$*" in *"--filter label="*) ;; *) echo "unfiltered listing refused by the case" >&2; exit 97 ;; esac ;;
esac
exec '${real}' "$@"
`
  );
  chmodSync(join(bin, 'docker'), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${bin}:${saved ?? ''}`;
  try {
    return fn();
  } finally {
    process.env.PATH = saved;
  }
}

beforeAll(() => {
  // A killed run's other tag, which no sweep takes, and nothing but this case makes.
  const left = list(['images', 'lu-b641-other', '--format', '{{.Repository}}:{{.Tag}}']);
  if (left.length) sh(['docker', 'rmi', ...left]);
  const build = (o: typeof OLD, run: string, made: string) => {
    const ctx = mkdtempSync(join(work, 'ctx-'));
    writeFileSync(join(ctx, 'Dockerfile'), 'FROM alpine:3\n');
    const b = sh(['docker', 'build', '-q', '--label', `${KEY}=1`, '--label', 'lu-builder=1', '--label', `${BUILDER_RUN_LABEL}=${run}`,
      '--label', `${BUILDER_MADE_LABEL}=${made}`, '-t', o.tag, ctx]);
    const r = b.code !== 0 || !o.name ? b : sh(['docker', 'run', '-d', '--rm', '--name', o.name, o.tag, 'sleep', '600']);
    if (r.code !== 0) setup += `${o.tag}: ${r.output}\n`;
  };
  build(OLD, '999-zzzzzz', new Date(Date.now() - 3 * HOUR).toISOString());
  build(NEW, BUILDER_RUN_ID, new Date().toISOString());
  build(FRESH, '999-zzzzzz', new Date().toISOString());
  const tag = sh(['docker', 'tag', FRESH.tag, OTHER]);
  if (tag.code !== 0) setup += `${OTHER}: ${tag.output}\n`;
  ids.oldImage = image(OLD.tag);
  ids.freshImage = image(FRESH.tag);
  freshCreated = parseDockerTime(sh(['docker', 'image', 'inspect', '-f', '{{.Created}}', FRESH.tag]).stdout) ?? Date.now();
  ids.oldContainer = sh(['docker', 'inspect', '-f', '{{.Id}}', OLD.name]).stdout.trim();
  before.containers = list(['ps', '-aq', '--no-trunc']);
  before.images = list(['images', '-aq', '--no-trunc']);

  first = withRecordingDocker(() => sweepAbandonedBuilderObjects(KEY));
  running = { old: state(OLD.name), new: state(NEW.name) };
  freshAfterFirst = image(FRESH.tag);
  second = withRecordingDocker(() => sweepAbandonedBuilderObjects(KEY, Date.now() + 3 * HOUR));
  tagged = { old: image(OLD.tag), new: image(NEW.tag), fresh: image(FRESH.tag), other: image(OTHER) };

  after.containers = list(['ps', '-aq', '--no-trunc']);
  after.images = list(['images', '-aq', '--no-trunc']);
}, 120_000);

afterAll(() => {
  sh(['docker', 'rm', '-f', OLD.name, NEW.name]);
  sh(['docker', 'rmi', '-f', OLD.tag, NEW.tag, FRESH.tag, OTHER]);
  rmSync(work, { recursive: true, force: true });
});

describe('B6-41 the sweep, put to docker', () => {
  test('B6-41 the premise: the three images were built and both containers started', () => {
    expect(setup).toBe('');
    expect([ids.oldImage, ids.freshImage].every((i) => i.startsWith('sha256:'))).toBe(true);
    // And `fresh`'s own `.Created` is past the floor, or keeping it shows nothing.
    expect(Date.now() - freshCreated).toBeGreaterThan(2 * HOUR);
  });

  test('B6-41 on the real clock the old container still runs, and its image is refused while it does', () => {
    expect({ running, refusals: first.map((r) => r.slice(0, `image ${OLD.tag}:`.length)) }).toEqual({
      running: { old: 'running', new: 'running' },
      refusals: [`image ${OLD.tag}:`]
    });
  });

  test('B6-41 and on the real clock an image made minutes ago is kept, although its own date is weeks back', () => {
    expect(freshAfterFirst).toBe(ids.freshImage);
  });

  test('B6-41 three hours on, the running old container and its image are gone in one sweep', () => {
    expect({ refusals: second, container: state(OLD.name), image: tagged.old, fresh: tagged.fresh }).toEqual({
      refusals: [],
      container: '',
      image: '',
      fresh: ''
    });
  });

  test('B6-41 and a tag the suite did not give is left, with the image it names', () => {
    expect(tagged.other).toBe(ids.freshImage);
  });

  test('B6-41 and the new container still runs and its image is still there', () => {
    expect({ container: state(NEW.name), image: tagged.new !== '' }).toEqual({ container: 'running', image: true });
  });

  test('B6-41 and nothing else that existed before is gone', () => {
    expect({
      containers: before.containers.filter((c) => !after.containers.includes(c)),
      images: before.images.filter((i) => !after.images.includes(i)).sort()
    }).toEqual({ containers: [ids.oldContainer], images: [ids.oldImage] });
  });

  test('B6-41 and every listing it made carried the label filter', () => {
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    const listings = calls.filter((c) => /^(ps|images)\b/.test(c));
    expect({
      ps: listings.some((c) => c.startsWith('ps ')),
      images: listings.some((c) => c.startsWith('images ')),
      unfiltered: listings.filter((c) => !c.includes(`--filter label=${KEY}=1`))
    }).toEqual({ ps: true, images: true, unfiltered: [] });
  });
});
