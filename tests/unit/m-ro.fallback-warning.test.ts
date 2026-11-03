/**
 * M-RO · Unit · Under routing only, falling back to the local LLM is announced
 *
 * Purpose:  With the CLI off, a proxy that holds no key or answers later than discovery waits
 *           leaves the local LLM as OpenCode's default under `only`. With OpenRouter as the
 *           local LLM that is a hosted model reached unmasked. Round 1 of the review on #59
 *           asked for the start to say so; the entrypoint now prints a warning on stderr
 *           naming the model it fell back to (RO-FR6, decision 8).
 * Given:    `config/opencode/entrypoint.sh`, run as `tests/lib/opencodefixture.ts` runs it.
 * When:     Four runs under `PRIVACY_ROUTING=only` and one under `opt-in`.
 * Then:     Under `only` with no privacy route and the CLI off, the default is
 *           `llamacpp/particle-ai/particle-1` and stderr carries the warning naming it.
 * Covers:   RO-7, RO-FR6, UC4
 * Negative: no warning with a privacy model as the default; none with nothing discovered,
 *           since no model is reached; and none under `opt-in` from the first row's answers,
 *           where the same local model is the default by design.
 * Counterpart: the first row, the fallback the warning is for, and the last, the same fallback
 *           with no proxy URL at all.
 *
 * Test data: as RO-1's. The fallback row and the `opt-in` row answer the local list with 200
 * and both proxy lists with `000`, CLI off. The privacy row is all three answers 200 with the
 * CLI on; the empty row answers every URL with `000`. The last row is all three answers 200
 * with the CLI on and `PRIVACY_PROXY_URL` unset, so discovery never runs. The case looks for
 * the sentence `privacy routing only, but no privacy model was found`, not for `WARNING`: the
 * runs with the proxy unreachable also carry discovery's own `unreachable` lines on stderr.
 */
import { test, expect, describe } from 'bun:test';
import { ALL_ON, BASE_ENV, LOCAL, UNREACHABLE, ok, runEntrypoint } from '../lib/opencodefixture';

const SENTENCE = 'privacy routing only, but no privacy model was found';
const only = (cli: '0' | '1') => ({ ...BASE_ENV, PRIVACY_ROUTING: 'only', ENABLE_ANTHROPIC_CLAUDE_CODE: cli });
const NO_PROXY = { local: ok(LOCAL), openai: UNREACHABLE, anthropic: UNREACHABLE };

describe('RO-7 under only, falling back to the local LLM is announced', () => {
  test('RO-7 with no privacy route and the CLI off, the warning names the local model', () => {
    const r = runEntrypoint(NO_PROXY, only('0'));
    expect(r.config.model).toBe('llamacpp/particle-ai/particle-1');
    expect(r.stderr).toContain(`${SENTENCE}: the default is llamacpp/particle-ai/particle-1`);
  });

  test('RO-7 the negative: with a privacy model as the default, no warning', () => {
    const r = runEntrypoint(ALL_ON, only('1'));
    expect(r.config.model).toBe('privacy-anthropic/claude-sonnet-5');
    expect(r.stderr).not.toContain(SENTENCE);
  });

  test('RO-7 the negative: with nothing discovered anywhere, no warning either', () => {
    const r = runEntrypoint({ local: UNREACHABLE, openai: UNREACHABLE, anthropic: UNREACHABLE }, only('0'));
    expect(r.config).not.toHaveProperty('model');
    expect(r.stderr).not.toContain(SENTENCE);
  });

  test('RO-7 the negative: under opt-in, the same local default and no warning', () => {
    const { PRIVACY_ROUTING: _, ...optIn } = only('0');
    const r = runEntrypoint(NO_PROXY, optIn);
    expect(r.config.model).toBe('llamacpp/particle-ai/particle-1');
    expect(r.stderr).not.toContain(SENTENCE);
  });

  test('RO-7 with PRIVACY_PROXY_URL unset, the same warning', () => {
    const { PRIVACY_PROXY_URL: _, ...noUrl } = only('1');
    const r = runEntrypoint(ALL_ON, noUrl);
    expect(r.config.model).toBe('llamacpp/particle-ai/particle-1');
    expect(r.stderr).toContain(`${SENTENCE}: the default is llamacpp/particle-ai/particle-1`);
  });
});
