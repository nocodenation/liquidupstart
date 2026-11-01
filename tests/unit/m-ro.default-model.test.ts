/**
 * M-RO · Unit · Under routing only, OpenCode's default model is a privacy one
 *
 * Purpose:  Under `PRIVACY_PROXY_ROUTING=only` the stack promises the agents the privacy
 *           providers and the local LLM and nothing else. OpenCode's default was the first
 *           model the local LLM lists, in every mode: on 2026-10-31, with OpenRouter as the
 *           local LLM, `particle-ai/particle-1`, a hosted model reached unmasked. The default
 *           is now a privacy model whenever the proxy offers one, and the local LLM's first
 *           model only when it offers none.
 * Given:    `config/opencode/entrypoint.sh`, copied into a sandbox per run with its two paths
 *           pointed there, run under `env -i` with stub `curl`, `sleep` and `opencode` first on
 *           `PATH` (`tests/lib/opencodefixture.ts`), and `PRIVACY_ROUTING=only`.
 * When:     It runs once per row, against the answers that row names.
 * Then:     `model` in the written `opencode.json` is, in this order: `privacy-anthropic` with
 *           the first id the proxy lists; `privacy/private-claude` when the CLI is on, also
 *           when the proxy does not answer; `privacy-openai` with the newest registered id by
 *           `created`; the local LLM's first model. With nothing discovered there is no
 *           `model`. The start line names the default together with its provider.
 * Covers:   RO-1, RO-FR1, RO-FR5
 * Negative: an id the entrypoint's own filter drops never becomes the default, although the
 *           two highest `created` values belong to such ids; and with nothing discovered no
 *           model is invented.
 * Counterpart: every step of the chain is shown to be taken when its provider is there.
 *
 * Test data, as `tests/lib/opencodefixture.ts` holds it: the local LLM lists
 * `particle-ai/particle-1`, `text-embedding-3-small` and `google/gemma-4-31b-it`. The proxy's
 * OpenAI list is `gpt-5.6-luna`, `gpt-3.5-turbo-0125`, `gpt-6.1-terra` and `gpt-5-mini`, with
 * the newest `created` in the middle so that neither first nor last passes for newest. The
 * list with dropped ids adds `gpt-6.2-2026-10-30` (a dated snapshot) and `gpt-image-2`, with
 * the two highest `created` values. The list without `created` is the plain one with the field
 * removed. The Anthropic list puts `claude-sonnet-5` before `claude-opus-5`, the reverse of
 * alphabetical order; refused, it answers 401 with `{"detail":"no ANTHROPIC_API_KEY"}`.
 */
import { test, expect, describe } from 'bun:test';
import {
  ALL_ON, BASE_ENV, LOCAL, OPENAI, OPENAI_UNDATED, OPENAI_WITH_DROPPED, REFUSED, UNREACHABLE,
  ok, runEntrypoint
} from '../lib/opencodefixture';

const only = (cli: '0' | '1') => ({ ...BASE_ENV, PRIVACY_ROUTING: 'only', ENABLE_ANTHROPIC_CLAUDE_CODE: cli });
const noAnthropic = (openai: string) => ({ local: ok(LOCAL), openai: ok(openai), anthropic: REFUSED });

describe('RO-1 the default under only', () => {
  test('RO-1 with every privacy route on offer, privacy-anthropic and the first id the proxy lists', () => {
    const r = runEntrypoint(ALL_ON, only('1'));
    expect(r.code).toBe(0);
    expect(r.config.model).toBe('privacy-anthropic/claude-sonnet-5');
    expect(r.startLine).toBe('Starting opencode web on port 4096 (model: privacy-anthropic/claude-sonnet-5)');
  });

  test('RO-1 with privacy-anthropic refused and the CLI on, privacy/private-claude', () => {
    const r = runEntrypoint(noAnthropic(OPENAI), only('1'));
    expect(r.config.model).toBe('privacy/private-claude');
    expect(r.startLine).toBe('Starting opencode web on port 4096 (model: privacy/private-claude)');
  });

  test('RO-1 with the proxy not answering and the CLI on, still privacy/private-claude', () => {
    const r = runEntrypoint({ local: ok(LOCAL), openai: UNREACHABLE, anthropic: UNREACHABLE }, only('1'));
    expect(r.config.model).toBe('privacy/private-claude');
  });

  test('RO-1 with the CLI off as well, privacy-openai and its newest registered id', () => {
    const r = runEntrypoint(noAnthropic(OPENAI), only('0'));
    expect(r.config.model).toBe('privacy-openai/gpt-6.1-terra');
    expect(r.startLine).toBe('Starting opencode web on port 4096 (model: privacy-openai/gpt-6.1-terra)');
  });

  test('RO-1 the negative: an id the filter drops never wins, though it carries the highest created', () => {
    const r = runEntrypoint(noAnthropic(OPENAI_WITH_DROPPED), only('0'));
    expect(Object.keys(r.config.provider['privacy-openai'].models)).not.toContain('gpt-image-2');
    expect(r.config.model).toBe('privacy-openai/gpt-6.1-terra');
  });

  test('RO-1 from a list without created, the first registered id', () => {
    const r = runEntrypoint(noAnthropic(OPENAI_UNDATED), only('0'));
    expect(r.config.model).toBe('privacy-openai/gpt-5.6-luna');
  });

  test('RO-1 with no privacy route at all, the local LLM\'s first model', () => {
    const r = runEntrypoint({ local: ok(LOCAL), openai: UNREACHABLE, anthropic: UNREACHABLE }, only('0'));
    expect(r.config.model).toBe('llamacpp/particle-ai/particle-1');
  });

  test('RO-1 the negative: with nothing discovered anywhere, no model and <none discovered>', () => {
    const r = runEntrypoint({ local: UNREACHABLE, openai: UNREACHABLE, anthropic: UNREACHABLE }, only('0'));
    expect(r.code).toBe(0);
    expect(r.config).not.toHaveProperty('model');
    expect(r.startLine).toBe('Starting opencode web on port 4096 (model: <none discovered>)');
  });
});
