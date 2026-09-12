/**
 * OC-17, OC-18, OC-19 against real images — the tier where needing docker is declared.
 *
 * Purpose: the start script writes a different configuration shape for 2026.7.1
 * than for 2026.9.1, and decides which by asking the image rather than by
 * trusting the Dockerfile's pin. The parsing of that answer is asserted without
 * docker in tests/unit/m-oc.version-probe.test.ts; this file asserts that the
 * real images actually answer, which the parser cannot show.
 *
 * Given  the two images this migration concerns, and one reference that cannot exist
 * When   openclaw_version is asked for each
 * Then   the exact version comes back for the two real ones, and nothing for the
 *        third — nothing, so the caller refuses rather than guessing
 *
 * It moved here from unit/ on 2026-09-10. Timur's F9 in the #11 review: a
 * unit-tier case was pulling several gigabytes with no `--pull never`, while
 * tests/run.sh classifies unit/ as needing no stack. On a host without them
 * cached the pull outran the 60s bound and the case reported
 * `expected '2026.7.1', received ''` — a missing image reading as a broken
 * parser.
 *
 * The images are a precondition, and this file says so rather than discovering
 * it: when one is absent the guard names it and the command that fetches it,
 * instead of failing inside an assertion about versions.
 *
 * Requirements covered: OC-G2, FEATURE-openclaw-2026-9-1.md §6.
 */
import { test, expect, describe } from 'bun:test';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const SCRIPT = 'config/scripts/start/openclaw.sh';
const NEW_IMAGE = 'ghcr.io/openclaw/openclaw:2026.9.1';
const OLD_IMAGE = 'ghcr.io/openclaw/openclaw:2026.7.1';

function cached(image: string): boolean {
  return sh(['docker', 'image', 'inspect', image]).code === 0;
}

function probe(image: string): string {
  const snippet = `
    set -uo pipefail
    eval "$(sed -n '/^with_timeout() {/,/^}/p;/^openclaw_version() {/,/^}/p' ${SCRIPT})"
    OPENCLAW_IMAGE="liquidupstart/openclaw:latest"
    openclaw_version ${JSON.stringify(image)}
  `;
  return sh(['bash', '-c', snippet], repoRoot).stdout.trim();
}

describe('OC-17/18/19 the probe against the images themselves', () => {
  test('both images are cached, which this tier requires and does not fetch', () => {
    const missing = [NEW_IMAGE, OLD_IMAGE].filter((i) => !cached(i));
    expect({
      missing,
      hint: missing.length ? `docker pull ${missing.join(' && docker pull ')}` : ''
    }).toEqual({ missing: [], hint: '' });
  });

  test('OC-17 reports 2026.9.1, tolerating the commit suffix it prints', () => {
    expect(probe(NEW_IMAGE)).toBe('2026.9.1');
  });

  test('OC-18 reports 2026.7.1', () => {
    expect(probe(OLD_IMAGE)).toBe('2026.7.1');
  });

  test('OC-19 reports nothing for an image that cannot be identified', () => {
    // A tag no registry can supply by accident. Nothing, not a default: a probe
    // that falls back reproduces the September hang this migration came from.
    expect(probe('ghcr.io/openclaw/openclaw:0.0.0-does-not-exist')).toBe('');
  });
});
