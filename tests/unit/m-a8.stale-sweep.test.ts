/**
 * M-A8 · Unit · The start-of-run sweep removes what is abandoned, not what is running
 *
 * Purpose:  This decision has been wrong in both directions, a fortnight apart,
 *           and until now it had no case at all.
 *
 *           **First direction, 2026-09-30.** Container names and image tags were
 *           fixed strings and `startDashboard` ran `docker rm -f <name>` before
 *           starting, so a second checkout destroyed the first one's fixtures.
 *           Measured with two checkouts running `m-a8.served-card` at once:
 *           `could not start lu-a8-unprepared: … No such container`, and before
 *           that a page served from the other run's project directory, which read
 *           as `A8-20` failing. That is `A2` of the 2026-10-01 review.
 *
 *           **Second direction, 2026-10-20, through the repair for the first.**
 *           Per-run names fixed the collision and broke the reclaim: nothing ever
 *           names an interrupted run's litter again, so a sweep was added — and it
 *           removed every `lu-test=1` object that was not *this* run's. "Not this
 *           run" is not "stale". The reviewer ran one `sweepStaleFixtures()` from
 *           a second clone while a run's first container was up, and that run
 *           failed with `lu-a8-ready-1-vyc8xo never answered on port 32780: …
 *           No such container`. The headline defect of #19, arriving back through
 *           the repair for `A2`.
 *
 *           So the question the sweep answers is an **age**, and age is the thing
 *           neither version measured. `staleIds` is that question alone, separated
 *           from the docker call: a decision that exists only inside `docker rm`
 *           can be tested only by destroying something.
 * Given:    rows of `{ id, created }` as `docker <kind> inspect` prints them, a
 *           set of this run's own ids, and a fixed clock — so nothing here touches
 *           docker and no answer depends on how long the suite has been running
 * When:     each row is put to `staleIds`
 * Then:     only what is both somebody else's and older than the floor is named,
 *           and anything whose age cannot be read is kept
 * Covers:   A8-31
 * Negative: The live sibling and the unreadable timestamp. Their counterpart is
 *           the genuinely abandoned container, because a sweep that names nothing
 *           is also a defect — it is what leaks three dashboards and a tag per
 *           interrupted run, which is what `A2` asked to have fixed.
 *
 * Test data, stated. The clock is `2026-10-20T12:00:00Z` throughout, and the floor
 *           is `STALE_AFTER_MS` = 3 h, so the boundary sits at `09:00:00Z`:
 *
 *     mine-1       11:59:00Z   this run's own, one minute old   -> kept (it is ours)
 *     mine-stale   06:00:00Z   this run's own, six hours old    -> kept (it is ours)
 *     live-1       11:58:00Z   another run, two minutes old     -> kept
 *     edge-1       09:00:00Z   another run, exactly at the floor -> swept
 *     just-under   09:00:01Z   another run, a second inside it  -> kept
 *     old-1        06:00:00Z   another run, six hours old       -> swept
 *     unreadable   "not a date"                                 -> kept
 *
 * `mine-stale` is the one that looks surprising and is not: a run longer than the
 *           floor would otherwise start deleting its own containers out from under
 *           itself, and this suite's longest measured run is 17 minutes against a
 *           3 h floor — so the floor is a distance from a run, not an estimate of
 *           one, and that distance is what makes the exemption cheap.
 */

import { test, expect, describe } from 'bun:test';
import { staleIds, isOwn, STALE_AFTER_MS } from '../lib/dashboardserver';
import { parseDockerTime } from '../lib/dockertime';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const at = (iso: string) => `2026-10-20T${iso}Z`;

const MINE = new Set(['mine-1', 'mine-stale']);
const ROWS = [
  { id: 'mine-1', created: at('11:59:00') },
  { id: 'mine-stale', created: at('06:00:00') },
  { id: 'live-1', created: at('11:58:00') },
  { id: 'edge-1', created: at('09:00:00') },
  { id: 'just-under', created: at('09:00:01') },
  { id: 'old-1', created: at('06:00:00') },
  { id: 'unreadable', created: 'not a date' }
];

describe('A8-31 only an abandoned fixture is swept', () => {
  test('A8-31 the whole decision, over one record', () => {
    // Asserted as a set rather than one id at a time: what matters is that these
    // two are named *and the other five are not*, and a per-id assertion would
    // stay green against a sweep that also took the live sibling.
    expect(staleIds(ROWS, MINE, NOW).sort()).toEqual(['edge-1', 'old-1']);
  });

  test('A8-31 the negative: a live sibling from another run is not swept', () => {
    // The measured defect, as a single row. Two minutes old, not ours, running.
    expect(staleIds([{ id: 'live-1', created: at('11:58:00') }], MINE, NOW)).toEqual([]);
  });

  test('A8-31 the counterpart: an abandoned one is', () => {
    // And a sweep that names nothing is the other defect -- three dashboards and
    // a tag per interrupted run, for good, because per-run names mean nothing
    // ever names them again.
    expect(staleIds([{ id: 'old-1', created: at('06:00:00') }], MINE, NOW)).toEqual(['old-1']);
  });

  test('A8-31 the negative: a timestamp that cannot be read keeps the object', () => {
    // "Cannot measure" is not "stale" -- the rule SP-4 carries for the disk and
    // B5-33 for the image. Here it is also the only direction that cannot destroy
    // a live run, so the cost of being wrong is litter rather than a false red.
    expect(staleIds([{ id: 'unreadable', created: 'not a date' }], MINE, NOW)).toEqual([]);
    expect(staleIds([{ id: 'empty', created: '' }], MINE, NOW)).toEqual([]);
  });

  test('A8-31 and this run owns its fixtures whatever their age', () => {
    // A run longer than the floor must not sweep itself. Six hours old and ours.
    expect(staleIds([{ id: 'mine-stale', created: at('06:00:00') }], MINE, NOW)).toEqual([]);
  });

  test('A8-31 the boundary is at the floor, and a second inside it is not stale', () => {
    // Where an off-by-one would live, and the only pair here that distinguishes
    // >= from >. The floor is read from the export rather than restated, so the
    // case cannot drift from the value the sweep uses.
    expect(STALE_AFTER_MS).toBe(3 * 60 * 60 * 1000);
    const floor = new Date(NOW - STALE_AFTER_MS).toISOString();
    const inside = new Date(NOW - STALE_AFTER_MS + 1000).toISOString();
    expect(staleIds([{ id: 'edge', created: floor }], MINE, NOW)).toEqual(['edge']);
    expect(staleIds([{ id: 'inside', created: inside }], MINE, NOW)).toEqual([]);
  });
});

describe('A8-32 the stamp is read, and docker spells it three ways', () => {
  // **The decision above is a pure function of a number, and every scenario in
  // it hands over a number it computed itself.** That left the reading untested,
  // and the reading was wrong: a network's `{{.Created}}` is a Go `time.Time`
  // with spaces, so taking the second field kept the bare date -- midnight UTC
  // -- and after 03:00 UTC every foreign lu-test=1 network read as older than
  // the floor. Found by a review of this branch on 2026-10-20 and reproduced
  // end to end: a network four seconds old was removed by one sweep.
  //
  // The strings here are what this host's daemon printed on 2026-10-20, docker
  // 29.8.1, copied rather than composed. The belief that all three kinds answer
  // RFC 3339 came from a measurement taken through `cut -c1-70`, which hid the
  // rest of the network's line.
  test.each([
    ['a container, RFC 3339', '2026-10-20T15:04:44.737820000Z', '2026-10-20T15:04:44.737Z'],
    ['an image label, written by the build', '2026-10-20T15:05:21.259Z', '2026-10-20T15:05:21.259Z'],
    ['a network, a Go time.Time with spaces', '2026-10-20 15:04:44.637957344 +0000 UTC', '2026-10-20T15:04:44.637Z'],
    ['a non-UTC offset', '2026-06-16 02:01:20 +0200 CEST', '2026-06-16T00:01:20.000Z']
  ])('A8-32 %s is read', (_name, stamp, expected) => {
    const ms = parseDockerTime(stamp as string);
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).toISOString()).toBe(expected);
  });

  test.each([
    ['the empty answer, which an unlabelled image gives', ''],
    ['a date with no time', '2026-10-20'],
    ['a time with no offset', '2026-10-20 15:04:44'],
    ['prose', 'two days ago']
  ])('A8-32 the negative: %s is no time at all', (_name, stamp) => {
    // `null`, not a guess. A guess is what makes an age floor look like it works.
    expect(parseDockerTime(stamp as string)).toBeNull();
  });

  test('A8-32 the negative that was the defect: the bare date is not a time', () => {
    // What `split(' ')[1]` produced from a network line. It parses, to midnight,
    // which is why the defect was silent: the answer was a number and the number
    // was hours old.
    expect(parseDockerTime('2026-10-20')).toBeNull();
    // And the whole line does parse, so nothing is lost by keeping it.
    expect(parseDockerTime('2026-10-20 15:04:44.637957344 +0000 UTC')).not.toBeNull();
  });
});

describe('A8-33 an id is ours whichever way docker spells it', () => {
  // **`mine.has(r.id)` could never fire in production.** The listings are
  // `docker ps -aq` and `docker images -q`, which print the short form, while
  // `inspect -f '{{.Id}}'` prints the long one -- and `sha256:` in front of it
  // for an image. Measured on docker 29.8.1, 2026-10-20. The scenarios that
  // certified the exemption passed because synthetic ids spell the same on both
  // sides, so the data was what made the case useless.
  const SHORT_CONTAINER = 'b7bcf6f51023';
  const LONG_CONTAINER = 'b7bcf6f510238f74e62846eb2ad2a937f5b59b52dd251d62a5f80e3892a11b2f';
  const SHORT_IMAGE = '28bd5fe8b56d';
  const LONG_IMAGE = 'sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b';

  test('A8-33 a long container id is ours when the short one is listed', () => {
    expect(isOwn(LONG_CONTAINER, new Set([SHORT_CONTAINER]))).toBe(true);
  });

  test('A8-33 and an image id is ours across the sha256 prefix', () => {
    expect(isOwn(LONG_IMAGE, new Set([SHORT_IMAGE]))).toBe(true);
  });

  test('A8-33 the negative: another run\'s id is not ours', () => {
    // The counterpart that carries the weight. A prefix match that answered true
    // for everything would exempt every object and make the sweep do nothing,
    // which is the leak this branch exists against.
    expect(isOwn(LONG_CONTAINER, new Set(['a1b2c3d4e5f6']))).toBe(false);
    expect(isOwn(LONG_IMAGE, new Set(['ffffffffffff']))).toBe(false);
  });

  test('A8-33 and an empty ownership set exempts nothing', () => {
    // Which is why the sweep now refuses to run at all when the ownership
    // listing fails: this function cannot tell "nothing is ours" from "we could
    // not ask", so the caller has to.
    expect(isOwn(LONG_CONTAINER, new Set())).toBe(false);
  });

  test('A8-33 and the real pair is exercised through staleIds', () => {
    // The defect in place: the row carries the long id, the ownership set the
    // short one, and the object is six hours old. Before this it was swept.
    const rows = [{ id: LONG_CONTAINER, created: '2026-10-20T06:00:00.000Z' }];
    expect(staleIds(rows, new Set([SHORT_CONTAINER]), Date.parse('2026-10-20T12:00:00Z'))).toEqual([]);
    // And the counterpart, so this is not an exemption that swallows everything.
    expect(staleIds(rows, new Set(['a1b2c3d4e5f6']), Date.parse('2026-10-20T12:00:00Z'))).toEqual([
      LONG_CONTAINER
    ]);
  });
});
