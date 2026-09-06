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

// Source only the helper definitions: the script's body needs .env and a stack.
function probe(image: string): { code: number; out: string } {
  const snippet = `
    set -uo pipefail
    eval "$(sed -n '/^with_timeout() {/,/^}/p;/^openclaw_version() {/,/^}/p;/^version_at_least() {/,/^}/p' ${SCRIPT})"
    OPENCLAW_IMAGE="liquidupstart/openclaw:latest"
    openclaw_version ${JSON.stringify(image)}
  `;
  const r = sh(['bash', '-c', snippet], repoRoot);
  return { code: r.code, out: r.stdout.trim() };
}

describe('OC-17/18/19 the version probe', () => {
  test('OC-17 reports 2026.9.1 for the 2026.9.1 image, tolerating its commit suffix', () => {
    // 2026.9.1 prints "OpenClaw 2026.9.1 (ad6fe23)"; the parser must not keep the hash.
    expect(probe('ghcr.io/openclaw/openclaw:2026.9.1').out).toBe('2026.9.1');
  });

  test('OC-18 reports 2026.7.1 for the 2026.7.1 image', () => {
    expect(probe('ghcr.io/openclaw/openclaw:2026.7.1').out).toBe('2026.7.1');
  });

  test('OC-19 reports nothing for an image that cannot be identified', () => {
    // A tag no registry can supply by accident.
    expect(probe('ghcr.io/openclaw/openclaw:0.0.0-does-not-exist').out).toBe('');
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
