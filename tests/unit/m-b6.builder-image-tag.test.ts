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
 * Given:    `builderContextDigest`, `sweepableObjects` and `parseDockerTime`, the
 *           decisions behind the tag and the sweep, as pure functions; and
 *           `builderLabels` and `builderImage`'s source, read
 * When:     the build context's content changes; labelled objects of this run, of
 *           a concurrent run, of an abandoned one and of none are offered for
 *           sweeping; and docker's own time strings are read
 * Then:     the digest follows the content and not the path; the sweep takes an
 *           abandoned object, even on this run's tree tag, and never one of this
 *           run's, a recent one or one whose age cannot be read; docker's times
 *           are read and anything else is not; every object carries the three labels;
 *           and the sweep runs before the build
 * Covers:   B6-39, B6-41; `m-b6.builder-sweep` puts the sweep to docker
 * Unhappy:  The sweep's refusals are the negative halves, and they are the point:
 *           a sweep that removed this run's objects, or a concurrent run's, would
 *           turn a disk problem into a flaky suite. The positive halves keep it
 *           from being a sweep that removes nothing.
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
import {
  builderContextDigest,
  sweepableObjects,
  builderLabels,
  BUILDER_LABEL,
  BUILDER_RUN_LABEL,
  BUILDER_RUN_ID
} from '../lib/builderimage';
import { parseDockerTime } from '../lib/dockertime';
import { readFileSync } from 'node:fs';

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

describe('B6-41 ownership is a label, so the leak that recurs is reachable', () => {
  // **The two previous answers guessed ownership from the image name**, and each
  // guess cost something measured on 2026-10-20:
  //
  //   - `c.image !== keep` protects the run in flight, and B6-39 made the tag
  //     content-addressed -- so `keep` is the same string on every run over an
  //     unchanged context, and a container a killed run left behind sits on
  //     exactly `keep`. A 48h leftover there gave `[]` at any age, while the
  //     legacy `run-47099-xoirn1` tag gave `['old_leak']`. Nothing has minted
  //     the `run-` scheme since B6-39, so the sweep reached only the shape that
  //     no longer happens.
  //   - Four sibling files mint `b6-`, `b6s2-`, `b6s7-` and `b6c-`, none of them
  //     in the allow-list. `…:b6c-10699-o4032x`, 1.02 GB, was five days old on
  //     this host.
  //   - `docker ps -a` enumerated the operator's 21 live stack containers, in
  //     the default tier, against what tests/run.sh promises.
  //
  // The label answers *whose*. The age still answers *abandoned or in flight*,
  // because a concurrent run's objects are not ours either.
  const OURS = BUILDER_RUN_ID;
  const THEIRS = '999-zzzzzz';
  const obj = (ref: string, runId: string | null, ageHours: number | null) => ({
    ref,
    runId,
    madeAtMs: ageHours === null ? null : NOW - ageHours * HOUR
  });

  test('B6-41 the leak that used to be exempt: an abandoned container on THIS tree tag', () => {
    // The whole point. Same tag as the run in flight, 48 hours old, another run's
    // label -- which is what a killed run over an unchanged context leaves.
    expect(sweepableObjects([obj('festive_wescoff', THEIRS, 48)], OURS, NOW)).toEqual([
      'festive_wescoff'
    ]);
  });

  test('B6-41 the counterpart: nothing of this run, whatever its age', () => {
    // Without this the sweep would remove the container the case that triggered
    // it is using, which is worse than the leak.
    expect(sweepableObjects([obj('mine_old', OURS, 48), obj('mine_new', OURS, 0)], OURS, NOW)).toEqual(
      []
    );
  });

  test('B6-41 the negative: nothing of a concurrent run, which is what the age is still for', () => {
    // Half an hour old and somebody else's: a run in progress. This is #19's
    // measured defect, which is why the floor survives the redesign.
    expect(sweepableObjects([obj('live_elsewhere', THEIRS, 0.5)], OURS, NOW)).toEqual([]);
  });

  test('B6-41 and the boundary: just past the floor it is taken', () => {
    expect(sweepableObjects([obj('aged', THEIRS, 2.1)], OURS, NOW)).toEqual(['aged']);
    expect(sweepableObjects([obj('fresh', THEIRS, 1.9)], OURS, NOW)).toEqual([]);
  });

  test('B6-41 and an object whose age cannot be read is kept', () => {
    // "Cannot measure" is not "abandoned", and it is the only direction that
    // cannot take a live run's image away.
    expect(sweepableObjects([obj('unstamped', THEIRS, null)], OURS, NOW)).toEqual([]);
  });

  test('B6-41 and an object with no run label at all is somebody else\'s, not ours', () => {
    // `null` is not `OURS`, so it is eligible -- and only once it is past the
    // floor, which is what keeps a hand-built labelled image from vanishing.
    expect(sweepableObjects([obj('nolabel', null, 48)], OURS, NOW)).toEqual(['nolabel']);
    expect(sweepableObjects([obj('nolabel', null, 0.5)], OURS, NOW)).toEqual([]);
  });

  test('B6-41 images and containers are one decision, not two', () => {
    // There were two: a 2h floor with a strict `>` for images and, on the sibling
    // branch, a 3h floor with `>=`. One function answers both kinds here, so a
    // 2.5h object cannot be litter to one half and live to the other.
    const mixed = [obj('liquidupstart/nar-builder:tree-older', THEIRS, 48), obj('ctr1', THEIRS, 48)];
    expect(sweepableObjects(mixed, OURS, NOW).sort()).toEqual(
      ['ctr1', 'liquidupstart/nar-builder:tree-older'].sort()
    );
  });
});

describe('B6-41 what the sweep reads is labelled, and it runs before the build', () => {
  // That the daemon narrows each listing by the label, and that the sweep removes
  // what it chose, is m-b6.builder-sweep's, against docker.
  const body = readFileSync(join(repoRoot, 'tests/lib/builderimage.ts'), 'utf8');

  test('B6-41 and the three labels every created object carries', () => {
    const args = builderLabels();
    expect(args.filter((a) => a === '--label').length).toBe(3);
    expect(args.join(' ')).toContain(`${BUILDER_LABEL}=1`);
    expect(args.join(' ')).toContain(`${BUILDER_RUN_LABEL}=${BUILDER_RUN_ID}`);
    // The time is a label because an image's own {{.Created}} is its config's,
    // which a cache hit copies -- measured, two images three seconds apart with
    // one timestamp.
    expect(args.join(' ')).toMatch(/lu-builder-made=\d{4}-\d{2}-\d{2}T/);
  });

  test('B6-41 and the sweep runs before the build, not after it', () => {
    // It ran after, so the disk-full state it relieves is the state in which the
    // build throws and the sweep is never reached.
    const sweepAt = body.indexOf('sweepAbandonedBuilderObjects();');
    const buildAt = body.indexOf("sh(['docker', 'build', '-q', '-t', tag");
    expect(sweepAt).toBeGreaterThan(0);
    expect(buildAt).toBeGreaterThan(sweepAt);
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

// `B6-39`'s sweep scenarios are gone, and that is a decision rather than a loss.
// They tested `sweepable()`, which decided ownership from the tag and is replaced
// by `sweepableObjects()` above: keeping it would have left two age floors with
// opposite boundaries in one file, which is the defect the review named. What
// those scenarios asserted -- never the image in use, never a recent one, never a
// foreign tag -- is now either identity (the run label) or the daemon's filter,
// and each has a scenario above. The digest cases that make `B6-39` what it is
// are untouched at the top of this file.
