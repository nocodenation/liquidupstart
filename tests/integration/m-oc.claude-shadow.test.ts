/**
 * N8 — the start verifies the thing the gateway will actually resolve.
 *
 * Purpose: on the 2026.9 schema `agents.defaults.cliBackends` is deleted, so the
 * Claude backend command cannot be configured. What still routes `claude` through
 * our wrapper is a file baked into the image at build time,
 * /home/node/.local/bin/claude, first on the PATH the gateway's login shell builds
 * under HOME=/home/node. An image built before that step existed has none, and
 * nothing rebuilds on a Dockerfile change.
 *
 * The start could not see the difference: its own preflight names the wrapper by
 * absolute path, so it passes either way, while the gateway spawns bare `claude`
 * as root with bypassPermissions and no IS_SANDBOX and Claude Code refuses every
 * turn. Measured 2026-09-11 in liquidupstart/openclaw:latest — with the shadow,
 * `sh -lc 'command -v claude'` gives /home/node/.local/bin/claude; with the same
 * directory masked by an empty mount it gives /usr/local/bin/claude.
 *
 * Given  the built image, with and without the shadow
 * When   claude_wrapper_shadowed is run against it
 * Then   it passes only when the wrapper is what a login shell resolves
 * And    the start fails rather than warns when it does not
 *
 * Requirements covered: OC-G2, N8 of the #11 second review.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = 'config/scripts/start/openclaw.sh';
const IMAGE = 'liquidupstart/openclaw:latest';
const BODY = readFileSync(join(repoRoot, SCRIPT), 'utf8');

// The function out of the script itself, not a copy of it: a copy would keep
// passing after the original changed.
function probe(image: string): number {
  const snippet = `
    set -uo pipefail
    eval "$(sed -n '/^with_timeout() {/,/^}/p;/^claude_wrapper_shadowed() {/,/^}/p' ${SCRIPT})"
    claude_wrapper_shadowed ${image}
  `;
  return sh(['bash', '-c', snippet], repoRoot).code;
}

// An image derived from the real one with the shadow taken out, standing in for
// one built before the step that writes it.
function withoutShadow(): string {
  const tag = 'liquidupstart/openclaw:n8-no-shadow';
  const df = `FROM ${IMAGE}\nUSER root\nRUN rm -rf /home/node/.local/bin\n`;
  const r = sh(['bash', '-c', `printf '%b' ${JSON.stringify(df)} | docker build -q -t ${tag} -`], repoRoot);
  if (r.code !== 0) throw new Error(`could not derive the image: ${r.output}`);
  return tag;
}

describe('N8 the claude PATH shadow is verified, not assumed', () => {
  test('the image is built, which this tier requires and does not build', () => {
    const present = sh(['docker', 'image', 'inspect', IMAGE]).code === 0;
    expect({ present, hint: present ? '' : './config/scripts/build/openclaw.sh' }).toEqual({
      present: true,
      hint: ''
    });
  });

  test('it passes against the built image', () => {
    expect(probe(IMAGE)).toBe(0);
  });

  test('and fails when the shadow is not there', () => {
    const tag = withoutShadow();
    try {
      expect(probe(tag)).not.toBe(0);
    } finally {
      sh(['docker', 'image', 'rm', '-f', tag]);
    }
  });

  test('a missing shadow ends the start rather than warning past it', () => {
    const call = BODY.split('\n').findIndex((l) => l.includes('! claude_wrapper_shadowed;'));
    expect(call).toBeGreaterThan(-1);
    const block = BODY.split('\n').slice(call, call + 12).join('\n');
    expect(block).toContain('exit 1');
    expect(block).toContain('./config/scripts/build/openclaw.sh');
  });
});
