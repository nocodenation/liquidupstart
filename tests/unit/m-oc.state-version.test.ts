/**
 * OC-21, OC-28 — reading which OpenClaw last wrote the state, and deciding.
 *
 * Purpose: the state directory and the image can disagree in two directions and
 * both failures are silent-looking. An image newer than the state needs a
 * migration, and without it the gateway crash-loops until its own restart-loop
 * breaker trips — `docker compose up` then fails with "dependency failed to
 * start" and nothing says why. An image *older* than the state is refused
 * outright: "Refusing to run automatic gateway startup migrations", again as a
 * crash loop rather than a message.
 *
 * Given  a state directory carrying meta.lastTouchedVersion, and an image version
 * When   the two are compared
 * Then   the newer-image case is recognised as needing migration, the
 *        older-image case as a downgrade that must be refused with an
 *        explanation, and the equal case as nothing to do.
 *
 * This is the decision, not the migration. The migration itself tears down the
 * stack and is OC-28/OC-29's manual procedure; what is unit-tested here is the
 * reading and the comparison, because those are the parts that can be wrong
 * without anything appearing to break.
 *
 * Test data: real values, taken from real state directories rather than invented
 * — "2026.7.1" as the 2026-09-05 baseline left it, "2026.9.1" as the image
 * reports it. A config with no `meta` at all stands for one written before
 * OpenClaw recorded the field, which must count as older rather than as equal.
 *
 * Requirements covered: OC-G1, FEATURE-openclaw-2026-9-1.md §6.
 */
import { test, expect, describe } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const SCRIPT = 'config/scripts/start/openclaw.sh';

/** Run `openclaw_state_version` from the start script against a state dir. */
function stateVersion(config: unknown | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'lu-sv-'));
  try {
    if (config !== null) writeFileSync(join(dir, 'openclaw.json'), JSON.stringify(config));
    const snippet = `
      set -uo pipefail
      eval "$(sed -n '/^with_timeout() {/,/^}/p;/^openclaw_state_version() {/,/^}/p' ${SCRIPT})"
      OPENCLAW_IMAGE="liquidupstart/openclaw:latest"
      CONFIG_JSON=${JSON.stringify(join(dir, 'openclaw.json'))}
      STATE_DIR=${JSON.stringify(dir)}
      openclaw_state_version
    `;
    return sh(['bash', '-c', snippet], repoRoot).stdout.trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function atLeast(have: string, want: string): boolean {
  const snippet = `
    eval "$(sed -n '/^version_at_least() {/,/^}/p' ${SCRIPT})"
    version_at_least ${JSON.stringify(have)} ${JSON.stringify(want)}
  `;
  return sh(['bash', '-c', snippet], repoRoot).code === 0;
}

describe('OC-28 reading which version wrote the state', () => {
  test('it reads meta.lastTouchedVersion', () => {
    // The exact shape the 2026-09-05 baseline left behind.
    expect(stateVersion({ meta: { lastTouchedVersion: '2026.7.1', lastTouchedAt: '2026-09-05T16:27:56.699Z' } }))
      .toBe('2026.7.1');
  });

  test('and the version the current image writes', () => {
    expect(stateVersion({ meta: { lastTouchedVersion: '2026.9.1', migrations: { modelPolicyAllowlist: true } } }))
      .toBe('2026.9.1');
  });

  test('a config without meta reads as empty, which counts as older', () => {
    // Predates the field. Treating it as equal would skip a migration it needs.
    expect(stateVersion({ gateway: { auth: { mode: 'trusted-proxy' } } })).toBe('');
  });

  test('and so does a state directory with no config at all', () => {
    // A fresh install: there is nothing to migrate, and nothing to refuse either.
    expect(stateVersion(null)).toBe('');
  });

  test('malformed JSON reads as empty rather than crashing the start', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lu-sv-'));
    writeFileSync(join(dir, 'openclaw.json'), '{ this is not json');
    const snippet = `
      set -uo pipefail
      eval "$(sed -n '/^with_timeout() {/,/^}/p;/^openclaw_state_version() {/,/^}/p' ${SCRIPT})"
      OPENCLAW_IMAGE="liquidupstart/openclaw:latest"
      CONFIG_JSON=${JSON.stringify(join(dir, 'openclaw.json'))}
      STATE_DIR=${JSON.stringify(dir)}
      openclaw_state_version
    `;
    const r = sh(['bash', '-c', snippet], repoRoot);
    rmSync(dir, { recursive: true, force: true });
    expect(r.stdout.trim()).toBe('');
  });
});

describe('OC-21/OC-28 the decision the two versions produce', () => {
  test('a newer image than the state means migrate', () => {
    expect(atLeast('2026.9.1', '2026.7.1')).toBe(true);
  });

  test('an older image than the state means refuse — the one-way door', () => {
    // OpenClaw will not run its startup migrations backwards, and it expresses
    // that as a crash loop rather than a message. The start script refuses first
    // and says how to recover.
    expect(atLeast('2026.7.1', '2026.9.1')).toBe(false);
  });

  test('equal versions mean nothing to do', () => {
    expect(atLeast('2026.9.1', '2026.9.1')).toBe(true);
  });
});
