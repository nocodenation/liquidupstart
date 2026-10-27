/**
 * A8-35 · Unit · One run's free range is never another run's taken one
 *
 * Purpose:  `runSubnets` gives each run two /24s, one it creates (`taken`) and one
 *           it only probes (`free`). It handed out adjacent pairs from any third
 *           octet, so a run starting one above another took the other's `free`:
 *           that run's probe then failed on "Pool overlaps" and
 *           `m-oc.subnet-preflight` read it as the preflight refusing a free range
 *           -- a wrong verdict, while the comment above the function promised "a
 *           loud `docker network create` error rather than a wrong verdict".
 *           Measured on #19's review, 2026-10-20, and recomputed on #45 on
 *           2026-10-21: exact clash 0.0039%, neighbour clash 0.0079%, so the case
 *           the comment denied was the likelier one. Since 2026-10-22 a pair starts
 *           on an even third octet, so two pairs are the same or apart.
 * Given:    `subnetsFor`, the choice as a function of the run id; and 20 000 ids
 *           of `RUN_ID`'s shape.
 * When:     Every id's pair is computed.
 * Then:     No `free` is any other id's `taken`; every pair is a `taken` and the
 *           /24 after it, inside 10.128.0.0 to 10.227.255.0; and `runSubnets` is
 *           this run's pair.
 * Covers:   A8-35
 * Negative: a free range that is another run's taken one.
 * Counterpart: the pairs stay well-formed and in their range, so a choice that
 *           avoided the clash by handing out nonsense cannot pass.
 *
 * Test data: 20 000 different ids `<pid>-<six base-36 characters>`, `RUN_ID`'s
 * shape, from a fixed linear congruential sequence (seed 20261022, multiplier
 * 1103515245, increment 12345, modulus 2^31, computed in BigInt and read from its
 * bits 15 and up, so 0 to 65535) so a run is the same run every time; pids 1000
 * to 66535.
 */
import { test, expect, describe } from 'bun:test';
import { RUN_ID, runSubnets, subnetsFor } from '../lib/dashboardserver';

// In BigInt: the product passes 2^53, where a JS number rounds, and the sequence
// stops being the one stated. The high bits, because an LCG's low ones repeat soon.
let seed = 20261022n;
const next = () => Number((seed = (seed * 1103515245n + 12345n) % 2n ** 31n) >> 15n);
const ids = Array.from({ length: 20_000 }, () => {
  const pid = 1000 + (next() % 99000);
  const tail = Array.from({ length: 6 }, () => (next() % 36).toString(36)).join('');
  return `${pid}-${tail}`;
});
const pairs = ids.map(subnetsFor);
const octets = (cidr: string) => cidr.replace('/24', '').split('.').map(Number);

describe('A8-35 two runs\' subnet pairs are the same or apart, never neighbours', () => {
  test('A8-35 the premise: the ids are twenty thousand different ones, of every base-36 character', () => {
    expect({ distinct: new Set(ids).size, characters: new Set(ids.flatMap((id) => [...id.split('-')[1]])).size }).toEqual({
      distinct: 20_000,
      characters: 36
    });
  });

  test('A8-35 the negative: no run\'s free range is another run\'s taken one', () => {
    const taken = new Set(pairs.map((p) => p.taken));
    const clashes = [...new Set(pairs.map((p) => p.free))].filter((f) => taken.has(f));
    expect(clashes.slice(0, 5)).toEqual([]);
  });

  test('A8-35 the counterpart: each pair is a taken /24 and the one after it, inside the range kept for this', () => {
    const wrong = pairs.filter((p) => {
      const [t0, t1, t2, t3] = octets(p.taken);
      const [f0, f1, f2, f3] = octets(p.free);
      return !(t0 === 10 && f0 === 10 && t1 === f1 && t1 >= 128 && t1 <= 227 && f2 === t2 + 1 && f2 <= 255 && t3 === 0 && f3 === 0);
    });
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  test('A8-35 and runSubnets is this run\'s pair', () => {
    expect(runSubnets()).toEqual(subnetsFor(RUN_ID));
  });
});
