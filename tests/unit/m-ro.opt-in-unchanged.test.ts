/**
 * M-RO · Unit · Under opt-in, and with the proxy off, OpenCode's configuration is what it was
 *
 * Purpose:  The privacy default and the allowlist belong to `only`. Under `opt-in` the operator
 *           picks a privacy model when they want one, and with a local LLM that really is local
 *           today's default sends nothing off the machine. The strongest form of "nothing
 *           changes" is the same file, byte for byte, so the entrypoint is compared with itself
 *           as it stood at `ed7fd46`, its last change before this feature.
 * Given:    `config/opencode/entrypoint.sh` and `tests/fixtures/ed7fd46/opencode-entrypoint.sh`,
 *           each run as `tests/lib/opencodefixture.ts` runs it, with the same answers, and no
 *           `PRIVACY_ROUTING`.
 * When:     Both run under `opt-in` with every privacy route on offer, then both with
 *           `PRIVACY_PROXY_URL` unset.
 * Then:     The two `opencode.json` files are equal in both configurations, and `model` is
 *           `llamacpp/particle-ai/particle-1`. The start line names the default together with
 *           its provider, the one thing that does change. Where the history holds `ed7fd46`,
 *           the fixture is that commit's file.
 * Covers:   RO-2, RO-FR2, RO-FR5
 * Negative: none in this file; it is the counterpart of RO-1 and RO-3. A rule that took
 *           effect in every mode would pass both of those and fail here.
 *
 * Test data: as RO-1's, with all three answers 200, `ENABLE_ANTHROPIC_CLAUDE_CODE=1` and
 * `OPENAI_API_KEY=sk-ro-stray`, so that every block the entrypoint can write is written.
 * Precondition for the fixture row only: `git cat-file -e ed7fd46` succeeds; a release
 * installation has no history, and the row is skipped there.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ALL_ON, BASELINE, BASE_ENV, runEntrypoint } from '../lib/opencodefixture';
import { sh } from '../lib/shell';

const OPT_IN = { ...BASE_ENV, ENABLE_ANTHROPIC_CLAUDE_CODE: '1', OPENAI_API_KEY: 'sk-ro-stray' };
const { PRIVACY_PROXY_URL: _, ...PROXY_OFF } = OPT_IN;
const HAS_ED7FD46 = sh(['git', 'cat-file', '-e', 'ed7fd46^{commit}']).code === 0;

describe('RO-2 opt-in and the proxy off write what they wrote before', () => {
  test('RO-2 under opt-in, opencode.json is byte for byte what ed7fd46 writes', () => {
    const now = runEntrypoint(ALL_ON, OPT_IN);
    const before = runEntrypoint(ALL_ON, OPT_IN, BASELINE);
    expect(now.raw).not.toBeNull();
    expect(now.raw).toBe(before.raw);
    expect(now.config.model).toBe('llamacpp/particle-ai/particle-1');
  });

  test('RO-2 with the proxy off, likewise', () => {
    const now = runEntrypoint(ALL_ON, PROXY_OFF);
    const before = runEntrypoint(ALL_ON, PROXY_OFF, BASELINE);
    expect(now.raw).not.toBeNull();
    expect(now.raw).toBe(before.raw);
    expect(Object.keys(now.config.provider)).not.toContain('privacy');
  });

  test('RO-2 the start line names the default together with its provider', () => {
    expect(runEntrypoint(ALL_ON, OPT_IN).startLine).toBe(
      'Starting opencode web on port 4096 (model: llamacpp/particle-ai/particle-1)'
    );
  });

  test.skipIf(!HAS_ED7FD46)('RO-2 the fixture is ed7fd46\'s file, byte for byte (needs that commit in the history)', () => {
    expect(readFileSync(BASELINE, 'utf8')).toBe(sh(['git', 'show', 'ed7fd46:config/opencode/entrypoint.sh']).stdout);
  });
});
