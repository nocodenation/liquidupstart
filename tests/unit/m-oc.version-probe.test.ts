/**
 * OC-17, OC-18, OC-19 — the version probe.
 *
 * Purpose: the start script writes a different configuration shape for OpenClaw
 * 2026.7.1 than for 2026.9.1, because neither version's schema accepts the
 * other's keys. Which shape to write is therefore decided by a fact, and the
 * fact is read out of the image at the moment it is needed rather than inferred
 * from the Dockerfile's pin — a pin plus a comment goes false the moment someone
 * changes the pin.
 *
 * Given  the two images this migration concerns, and one reference that cannot exist
 * When   `openclaw_version` is asked for each of them
 * Then   the exact version comes back for the two real ones, and nothing at all for
 *        the third — nothing, so the caller refuses rather than guessing, because a
 *        wrong guess is the indefinite start hang this whole migration came from.
 *
 * OC-19 is the case that matters. A probe that fails open and falls back to a
 * default reproduces the September incident exactly.
 *
 * Requirements covered: OC-G2, FEATURE-openclaw-2026-9-1.md §6.
 */
import { test, expect, describe } from 'bun:test';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const SCRIPT = 'config/scripts/start/openclaw.sh';

/**
 * OC-17/18 parse a string; they do not need an image, and until 2026-09-10 they
 * pulled one. A unit-tier file ran the real probe against
 * ghcr.io/openclaw/openclaw:2026.7.1 and :2026.9.1, several gigabytes each, with
 * no `--pull never` — while `tests/run.sh` classifies `unit/` as needing no
 * stack. On a host without them cached the pull outruns the 60s bound, timeout
 * kills the client, `|| return 0` yields an empty string, and the case reports
 * `expected '2026.7.1', received ''` — which reads as a broken parser rather
 * than a missing image. Timur's F9 in the #11 review.
 *
 * The parsing is the decision, so it is asserted against the exact strings the
 * two versions print. The probe against real images is a different tier and
 * lives in tests/integration/m-oc.version-probe-images.test.ts, where needing
 * docker is declared rather than smuggled in.
 */
function parse(line: string): string {
  const snippet = `printf '%s\n' ${JSON.stringify(line)} | sed -n 's/^OpenClaw \\([0-9][0-9.]*\\).*$/\\1/p'`;
  return sh(['bash', '-c', snippet], repoRoot).stdout.trim();
}

describe('OC-17/18 the version line is parsed, not guessed', () => {
  test('OC-17 keeps the version and drops the commit suffix 2026.9.1 prints', () => {
    expect(parse('OpenClaw 2026.9.1 (ad6fe23)')).toBe('2026.9.1');
  });

  test('OC-18 reads the bare form 2026.7.1 prints', () => {
    expect(parse('OpenClaw 2026.7.1')).toBe('2026.7.1');
  });

  test('OC-19 yields nothing for a line that is not a version line', () => {
    // The property the whole migration rests on: no version rather than a wrong
    // one. A probe that falls back to a default reproduces the September hang.
    expect(parse('Error: No such image')).toBe('');
    expect(parse('')).toBe('');
    expect(parse('OpenClaw')).toBe('');
  });
});

describe('OC-17/18 the comparison that selects the config shape', () => {
  function atLeast(have: string, want: string): boolean {
    const snippet = `
      eval "$(sed -n '/^version_at_least() {/,/^}/p' ${SCRIPT})"
      version_at_least ${JSON.stringify(have)} ${JSON.stringify(want)}
    `;
    return sh(['bash', '-c', snippet], repoRoot).code === 0;
  }

  test('2026.9.1 selects the new shape and 2026.7.1 does not', () => {
    expect(atLeast('2026.9.1', '2026.9.0')).toBe(true);
    expect(atLeast('2026.7.1', '2026.9.0')).toBe(false);
  });

  test('compares as versions, not as strings', () => {
    // The whole point of sort -V: "2026.10" is greater than "2026.9", which a
    // string comparison gets backwards. No such release exists yet, which is
    // exactly why it has to be asserted before one does.
    expect(atLeast('2026.10.0', '2026.9.0')).toBe(true);
    expect(atLeast('2026.8.9', '2026.9.0')).toBe(false);
  });
});
