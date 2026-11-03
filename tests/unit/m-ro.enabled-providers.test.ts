/**
 * M-RO · Unit · Under routing only, OpenCode may offer the local LLM and the privacy providers
 *
 * Purpose:  OpenCode Zen, OpenCode's own provider, has free models that need no key, so the
 *           override withholding every provider key does not remove it. Measured 2026-10-31: an
 *           OpenCode started on the stack's own configuration listed `opencode` with
 *           `big-pickle` and seven `*-free` models. Under `only` the entrypoint now writes
 *           `enabled_providers`, an allowlist, which also keeps out a provider OpenCode finds by
 *           itself in its environment or in a stored login.
 * Given:    `config/opencode/entrypoint.sh`, run as `tests/lib/opencodefixture.ts` runs it.
 * When:     Four runs under `PRIVACY_ROUTING=only` and one under `opt-in`.
 * Then:     Under `only`, `enabled_providers` names `llamacpp` and each privacy provider that
 *           registered, in the order written, and nothing else. Under `opt-in` it is absent.
 * Covers:   RO-3, RO-FR3
 * Negative: a privacy provider the proxy refuses is not listed; `privacy`, the CLI's door, is not
 *           listed with the CLI off (added in round 1 of the review on #59); `openai` is not
 *           listed although `OPENAI_API_KEY` reached the container and its provider block is
 *           written, which is what makes the row test the allowlist rather than a missing
 *           block; and `opt-in` carries no allowlist.
 * Counterpart: the first row, every provider the mode keeps is listed.
 *
 * Test data: as RO-1's. All on is all three answers 200 with `ENABLE_ANTHROPIC_CLAUDE_CODE=1`.
 * The refused row answers the Anthropic list with 401 and `{"detail":"no ANTHROPIC_API_KEY"}`.
 * The stray key is `OPENAI_API_KEY=sk-ro-stray`. The CLI-off row is all on with
 * `ENABLE_ANTHROPIC_CLAUDE_CODE=0`.
 */
import { test, expect, describe } from 'bun:test';
import { ALL_ON, BASE_ENV, LOCAL, OPENAI, REFUSED, ok, runEntrypoint } from '../lib/opencodefixture';

const ONLY = { ...BASE_ENV, PRIVACY_ROUTING: 'only', ENABLE_ANTHROPIC_CLAUDE_CODE: '1' };

describe('RO-3 under only, the providers OpenCode may offer', () => {
  test('RO-3 llamacpp and every privacy provider that registered, in the order written', () => {
    const r = runEntrypoint(ALL_ON, ONLY);
    expect(r.config.enabled_providers).toEqual(['llamacpp', 'privacy-openai', 'privacy-anthropic', 'privacy']);
  });

  test('RO-3 the negative: privacy-anthropic is left out when the proxy refuses it', () => {
    const r = runEntrypoint({ local: ok(LOCAL), openai: ok(OPENAI), anthropic: REFUSED }, ONLY);
    expect(r.config.enabled_providers).toEqual(['llamacpp', 'privacy-openai', 'privacy']);
  });

  test('RO-3 the negative: openai is left out although its key reached the container', () => {
    const r = runEntrypoint(ALL_ON, { ...ONLY, OPENAI_API_KEY: 'sk-ro-stray' });
    expect(Object.keys(r.config.provider)).toContain('openai');
    expect(r.config.enabled_providers).toEqual(['llamacpp', 'privacy-openai', 'privacy-anthropic', 'privacy']);
  });

  test('RO-3 the negative: under opt-in there is no enabled_providers', () => {
    const { PRIVACY_ROUTING: _, ...optIn } = ONLY;
    const r = runEntrypoint(ALL_ON, optIn);
    expect(r.config).not.toHaveProperty('enabled_providers');
  });

  test('RO-3 the negative: privacy is left out when the CLI is off', () => {
    const r = runEntrypoint(ALL_ON, { ...ONLY, ENABLE_ANTHROPIC_CLAUDE_CODE: '0' });
    expect(r.config.enabled_providers).toEqual(['llamacpp', 'privacy-openai', 'privacy-anthropic']);
  });
});
