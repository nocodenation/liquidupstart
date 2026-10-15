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
 * Covers:   B6-39
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
import { builderContextDigest, sweepable } from '../lib/builderimage';

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
