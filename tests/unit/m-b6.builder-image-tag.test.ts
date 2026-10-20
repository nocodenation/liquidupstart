/**
 * M-B6 · Unit · The builder image is tagged by its content, and old ones are swept
 *
 * Purpose:  The out-of-scope note on the 2026-10-14 re-review: *"`tests/lib/builderimage.ts`
 *           leaked its `nar-builder:run-*` image on **normal** exits too: two
 *           runs, two leftovers, in bun 1.4.2."* Measured here: a single passing
 *           file left its image behind, and the day left **21** at about 1 GB
 *           each — 9 of them from one default-tier round. `process.on('exit')`,
 *           where the cleanup was registered, **does not run** in bun 1.4.2.
 *
 *           It matters beyond disk. Earlier the same day the Docker VM filled to
 *           100% (57 of 59 GB), and a build failing with `No space left on
 *           device` is indistinguishable from a product failure in that output —
 *           which cost one measurement round.
 * Given:    `builderContextDigest` and `sweepable`, the two decisions behind the
 *           tag, as pure functions
 * When:     the build context's content changes, and when a list of images on the
 *           host is offered for sweeping
 * Then:     the digest follows the content and not the path; and the sweep never
 *           takes the image in use, never takes a recent one, and never takes
 *           something that is not ours
 * Covers:   B6-39, B6-41
 * Unhappy:  The sweep's three refusals are the negative halves, and they are the
 *           point: a sweep that removed the image in use, or a concurrent run's,
 *           would turn a disk problem into a flaky suite. The positive halves
 *           keep it from being a sweep that removes nothing.
 *
 * Why not an `afterAll`: `dropBuilderImage` says it, and it was measured — every
 *           file captures the tag at module load, so the first file's `afterAll`
 *           pulls the image out from under the rest. 8 fail across three files.
 *           The repair is therefore not deleting more reliably but minting fewer:
 *           one image per distinct build context instead of one per run.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { builderContextDigest, sweepable, sweepableContainers, parseDockerTime } from '../lib/builderimage';

const dirs: string[] = [];
const copyOfContext = () => {
  const d = mkdtempSync(join(tmpdir(), 'm-b6-ctx-'));
  dirs.push(d);
  cpSync(join(repoRoot, 'config/nar_builder'), join(d, 'ctx'), { recursive: true });
  return join(d, 'ctx');
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const HOUR = 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

describe('B6-39 the tag follows the content of the build context', () => {
  test('B6-39 the same content in two places gives the same digest', () => {
    // The property the per-run tag could not have: a second run over the same
    // tree reuses one image instead of minting another. And it is the isolation
    // the per-run tag was for -- two checkouts that differ cannot collide --
    // provided by the thing that actually distinguishes them.
    expect(builderContextDigest(copyOfContext())).toBe(builderContextDigest(copyOfContext()));
  });

  test('B6-39 and the real context agrees with a copy of itself', () => {
    expect(builderContextDigest()).toBe(builderContextDigest(copyOfContext()));
  });

  test('B6-39 a changed file changes it', () => {
    const a = copyOfContext();
    const before = builderContextDigest(a);
    writeFileSync(join(a, 'entrypoint.sh'), '#!/bin/sh\nexit 0\n');
    expect(builderContextDigest(a)).not.toBe(before);
  });

  test('B6-39 and so does a new file, which a digest over names alone would miss', () => {
    const a = copyOfContext();
    const before = builderContextDigest(a);
    mkdirSync(join(a, 'extra'), { recursive: true });
    writeFileSync(join(a, 'extra', 'added.txt'), 'x');
    expect(builderContextDigest(a)).not.toBe(before);
  });
});

describe('B6-41 and a container left behind by a killed run is swept too', () => {
  // Found 2026-10-16: `festive_wescoff` had been up for two days holding
  // `liquidupstart/nar-builder:run-47099-xoirn1`, a probe container from a run
  // that was killed mid-flight. `--rm` does not help -- it removes a container
  // when it exits, and this one never did -- and an image a container holds
  // cannot be removed, so the image sweep above was quietly powerless. One
  // killed run kept about a gigabyte alive with nothing saying so.
  const keep = 'liquidupstart/nar-builder:tree-abc123abc123';
  const ctr = (id: string, image: string, ageHours: number) => ({
    id,
    image,
    createdAtMs: NOW - ageHours * HOUR
  });

  test('B6-41 a container on a superseded builder tag is swept, by id', () => {
    const drop = sweepableContainers(
      [
        ctr('aaa1', 'liquidupstart/nar-builder:run-47099-xoirn1', 48),
        ctr('bbb2', 'liquidupstart/nar-builder:tree-older0000000', 5)
      ],
      keep,
      NOW
    );
    expect(drop.sort()).toEqual(['aaa1', 'bbb2']);
  });

  test('B6-41 the counterpart: a container of the run in flight is never swept', () => {
    // Without this, the sweep would remove the container the case that triggered
    // it is using, which is a worse failure than the leak.
    expect(sweepableContainers([ctr('ccc3', keep, 48)], keep, NOW)).toEqual([]);
  });

  test('B6-41 and nothing that is not a builder image, whatever its name', () => {
    // The tag is the discriminator rather than the name, because the names are
    // docker's own when a case passes none -- which is exactly why the leak was
    // invisible: nothing about `festive_wescoff` says it belongs to this suite.
    // The operator's own stack must survive a suite run.
    expect(
      sweepableContainers(
        [
          ctr('ddd4', 'liquidupstart/nar-builder:latest', 48),
          ctr('eee5', 'ghcr.io/nocodenation/liquid-nifi:latest', 48),
          ctr('fff6', 'postgres:17', 48),
          ctr('ggg7', 'liquidupstart/liquid:latest', 48)
        ],
        keep,
        NOW
      )
    ).toEqual([]);
  });

  test('B6-41 the negative: a concurrent run\'s container is not this run\'s litter', () => {
    // **What stood here asserted the opposite**, on the argument that the run in
    // flight is excluded by tag and a concurrent run holds a different tree tag.
    // True, and beside the point: a different tag is exactly what was then
    // removed. The reviewer measured that shape on #19 -- one sweep from a second
    // clone, while a run's first container was up, and that run died with
    // `never answered on port 32780: … No such container`. Half an hour old here,
    // which is what a run in progress looks like.
    expect(
      sweepableContainers([ctr('hhh8', 'liquidupstart/nar-builder:tree-fresh0000000', 0.5)], keep, NOW)
    ).toEqual([]);
  });

  test('B6-41 and the boundary: just past the floor it is taken', () => {
    // So the floor is a boundary and not a veto -- without this, the sweep could
    // be met by never taking anything, which is the leak it exists against.
    expect(
      sweepableContainers([ctr('iii9', 'liquidupstart/nar-builder:tree-fresh0000000', 2.1)], keep, NOW)
    ).toEqual(['iii9']);
    expect(
      sweepableContainers([ctr('jj10', 'liquidupstart/nar-builder:tree-fresh0000000', 1.9)], keep, NOW)
    ).toEqual([]);
  });

  test('B6-41 and a container whose age docker would not give is kept', () => {
    // "Cannot measure" is not "stale", and here it is also the only direction
    // that cannot remove a live run's container.
    expect(
      sweepableContainers(
        [{ id: 'kk11', image: 'liquidupstart/nar-builder:tree-fresh0000000', createdAtMs: null }],
        keep,
        NOW
      )
    ).toEqual([]);
  });
});

describe('B6-41 and the clock both sweeps read is docker\'s own wording', () => {
  // The decisions above are pure functions of a number, and a number is what
  // every one of their scenarios hands them. **That leaves the reading itself
  // untested**, and the reading is where a floor quietly stops working: a stamp
  // that does not parse dates the object *now*, so nothing is ever old enough.
  // CLAUDE.md's rule about test data applies to the input of a decision as much
  // as to its subject -- these are the strings this host's daemon actually
  // printed on 2026-10-20, docker 29.8.1, copied rather than composed.
  test.each([
    ['docker images --format {{.CreatedAt}}', '2026-06-16 02:01:20 +0200 CEST', '2026-06-16T00:01:20.000Z'],
    ['docker ps -a --format {{.CreatedAt}}', '2026-10-16 08:00:32 +0200 CEST', '2026-10-16T06:00:32.000Z'],
    ['docker container inspect {{.Created}}', '2026-10-20T12:22:29.90022963Z', '2026-10-20T12:22:29.900Z'],
    ['docker image inspect {{.Created}}', '2026-06-16T00:01:20.474100947Z', '2026-06-16T00:01:20.474Z']
  ])('B6-41 %s is read', (_name, stamp, expected) => {
    const ms = parseDockerTime(stamp as string);
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).toISOString()).toBe(expected);
  });

  test.each([
    ['the empty answer', ''],
    ['a date with no time', '2026-06-16'],
    ['a time with no offset, which no docker format prints', '2026-06-16 02:01:20'],
    ['prose', 'two days ago']
  ])('B6-41 the negative: %s is no time at all', (_name, stamp) => {
    // `null` and not a guess. A guess here is what makes an age floor look like
    // it is working.
    expect(parseDockerTime(stamp as string)).toBeNull();
  });

  test('B6-41 and a zone name of any length cannot reach the parser', () => {
    // The pattern this replaced stripped `[A-Z]{3,4}`, so a five-letter
    // abbreviation left a word behind for Date.parse to refuse. Anchoring on the
    // offset instead means everything after it is ignored, whatever it says.
    const ms = parseDockerTime('2026-06-16 02:01:20 +0545 NEPAL');
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).toISOString()).toBe('2026-06-15T20:16:20.000Z');
  });
});

describe('B6-39 the sweep takes predecessors and nothing else', () => {
  const keep = 'liquidupstart/nar-builder:tree-abc123abc123';
  const img = (tag: string, ageHours: number) => ({ tag, createdAtMs: NOW - ageHours * HOUR });

  test('B6-39 an old superseded image is swept, and the legacy run-* tags with it', () => {
    const drop = sweepable(
      [img(keep, 0), img('liquidupstart/nar-builder:tree-older0000000', 5), img('liquidupstart/nar-builder:run-123-abcdef', 30)],
      keep,
      NOW
    );
    expect(drop.sort()).toEqual(
      ['liquidupstart/nar-builder:run-123-abcdef', 'liquidupstart/nar-builder:tree-older0000000'].sort()
    );
  });

  test('B6-39 the image this run is using is never swept, however old it is', () => {
    // It is content-addressed, so an unchanged builder config means the image can
    // be weeks old and still be the right one. A sweep by age alone would delete
    // it out from under the run that just decided to use it.
    expect(sweepable([img(keep, 24 * 90)], keep, NOW)).toEqual([]);
  });

  test('B6-39 a recent image is never swept, because another run may be holding it', () => {
    // The concurrency guard. A run using an image built it seconds or minutes
    // ago, not hours, so the floor is what keeps this from turning a disk problem
    // into a flaky suite.
    expect(sweepable([img('liquidupstart/nar-builder:tree-fresh0000000', 0.5)], keep, NOW)).toEqual([]);
    expect(sweepable([img('liquidupstart/nar-builder:tree-fresh0000000', 1.9)], keep, NOW)).toEqual([]);
    // And just past the floor it is taken, so the floor is a boundary and not a veto.
    expect(sweepable([img('liquidupstart/nar-builder:tree-fresh0000000', 2.1)], keep, NOW)).toEqual([
      'liquidupstart/nar-builder:tree-fresh0000000'
    ]);
  });

  test('B6-39 and an image whose age docker would not give is kept', () => {
    // The same rule as the containers, and the same reason: an unreadable stamp
    // used to be read as `Date.now()`, which kept the image by arriving at the
    // right answer sideways. Now it is the rule, and a case puts it to it.
    expect(sweepable([{ tag: 'liquidupstart/nar-builder:tree-older0000000', createdAtMs: null }], keep, NOW))
      .toEqual([]);
  });

  test('B6-39 and something that is not ours is never swept', () => {
    // `docker images <repo>` is asked for one repository, but the rule must not
    // depend on that: a tag outside the two schemes this file has ever used --
    // `latest`, which the stack's own build writes -- is not this sweep's to take.
    expect(
      sweepable(
        [img('liquidupstart/nar-builder:latest', 999), img('someone/else:tree-abc123abc123', 999)],
        keep,
        NOW
      )
    ).toEqual([]);
  });
});
