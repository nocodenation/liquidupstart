/**
 * M-SP · Unit · A full Docker VM says so, instead of looking like a defect
 *
 * Purpose:  Twice — 2026-10-14 and 2026-10-15 — a Docker VM at 0 bytes free was
 *           diagnosed as something else. The second time it surfaced as **34
 *           failing cases** across M-B5 and M-B6: refusals that did not refuse,
 *           builds exiting 2, `AFTER=0` where a build should have succeeded. Most
 *           of an incompatibility analysis between #10 and #25 was written before
 *           anybody probed the build by hand and read
 *           `java.nio.file.FileSystemException: /m2/org: No space left on device`.
 *           The morning before, the same condition was reported to a reviewer as
 *           a "harness artifact".
 *
 *           `docker system df` does not say it. It reported *20% reclaimable*
 *           while the filesystem had nothing left — it measures what images
 *           occupy, not what the VM has free — and the space was in the build
 *           cache, 39.7 GB of it, which nothing in the suite accounts for.
 * Given:    `spaceVerdict`, the decision as a pure function of a reading, and
 *           `requireSpaceForDockerBuild` with an injected reader
 * When:     the reading is below the floor, at it, above it, or unavailable
 * Then:     below it refuses and the message names the cause and the remedy; at
 *           and above it proceeds; unavailable proceeds, because "cannot measure"
 *           and "no space" must not be the same answer
 * Covers:   SP-3
 * Unhappy:  The refusal is the negative half. Two of the three positives exist to
 *           stop it being met by a guard that refuses whenever it is unsure — a
 *           machine without docker must not be told its disk is full, and a
 *           reading exactly at the floor is not below it.
 *
 * Why the floor is 2 GiB: one cold builder image build costs about **305 MB**,
 *           measured on 2026-10-15 by reading `df` inside a container either side
 *           of `docker build --no-cache`. The floor is several of those plus the
 *           Maven downloads a real build makes into a container filesystem. It is
 *           a floor chosen from a measurement, not a prediction of need, and
 *           `LU_DISK_FLOOR_BYTES` moves it deliberately.
 */
import { test, expect, describe } from 'bun:test';
import { spaceVerdict, requireSpaceForDockerBuild, vmFreeBytes, FLOOR_BYTES } from '../lib/dockerspace';

const GiB = 1024 * 1024 * 1024;

describe('SP-3 a reading below the floor refuses, and says why', () => {
  test('SP-3 nothing left is refused, and the message names the cause', () => {
    const v = spaceVerdict(0, 2 * GiB);
    expect(v.ok).toBe(false);
    // The sentence a reader would otherwise have had to infer from a Maven stack
    // trace. Asserted by name because its absence is the whole defect.
    expect(v.message).toContain('No space left on device');
    expect(v.message).toContain('reads as a product failure');
    expect(v.message).toContain('docker builder prune -af');
    // And it says the thing `docker system df` gets wrong, since that is what
    // misled the diagnosis twice.
    expect(v.message).toContain('"reclaimable" while the filesystem has nothing left');
  });

  test('SP-3 and so is a reading that is merely low', () => {
    expect(spaceVerdict(1 * GiB, 2 * GiB).ok).toBe(false);
  });
});

describe('SP-3 and it proceeds whenever it should', () => {
  test('SP-3 a reading at the floor is not below it', () => {
    // The boundary, which is where an off-by-one would live.
    expect(spaceVerdict(2 * GiB, 2 * GiB).ok).toBe(true);
  });

  test('SP-3 plenty of room proceeds, and the message says how much', () => {
    const v = spaceVerdict(20 * GiB, 2 * GiB);
    expect(v.ok).toBe(true);
    expect(v.message).toMatch(/has \d+ MB free/);
  });

  test('SP-3 and a reading that could not be taken proceeds', () => {
    // **A guard that stops a run because it could not measure is worse than the
    // thing it guards against.** A machine without docker is already reported by
    // every case that needs docker; being told its disk is full would be a
    // second, false reason. So `null` is not `0`.
    const v = spaceVerdict(null, 2 * GiB);
    expect(v.ok).toBe(true);
    expect(v.message).toContain('could not be asked');
  });
});

describe('SP-3 the guard throws with that message, and only then', () => {
  test('SP-3 an empty VM stops a build with the sentence', () => {
    expect(() => requireSpaceForDockerBuild('the builder image', () => 0, 2 * GiB)).toThrow(
      /the builder image: the Docker VM has 0 MB free/
    );
  });

  test('SP-3 and a healthy one does not throw', () => {
    expect(() => requireSpaceForDockerBuild('the builder image', () => 20 * GiB, 2 * GiB)).not.toThrow();
  });
});

describe('SP-3 and the reading is of the VM, not of this machine', () => {
  test('SP-3 the live reading is a number or an honest null, and the floor is set', () => {
    // Read rather than asserted against a figure: this runs on machines of
    // different sizes. What is asserted is that the reading is *of something* —
    // a `0` here would mean the parse broke, which is how a guard like this
    // starts refusing every run.
    const free = vmFreeBytes();
    if (free === null) {
      expect(spaceVerdict(free).ok).toBe(true);
    } else {
      expect(free).toBeGreaterThan(0);
    }
    expect(FLOOR_BYTES).toBeGreaterThan(0);
  }, 120_000);
});
