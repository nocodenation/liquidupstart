/**
 * M-SR · Unit · OpenCode's warning tells a missing key from a refused one
 *
 * Purpose:  On any 401 from the privacy proxy's model list, `_discover_ids` in
 *           `config/opencode/entrypoint.sh` said that no key was set. On 2026-10-29 the key was
 *           set and OpenAI had refused it. The proxy answers 401 itself only with
 *           `provider_key_missing`, and passes a provider's refusal through. The warning now
 *           recognises those answers in the shapes measured, and says that either is possible for
 *           a body of any other shape (SR-FR8). No body is printed or left in /tmp.
 * Given:    `config/opencode/entrypoint.sh`, run as `tests/lib/opencodefixture.ts` runs it, with
 *           one proxy list answering 401 (403 in row 15) and the other 200.
 * When:     Eleven runs, shared by the fifteen unit rows of SR-6: rows 5, 12, 13 and 14 read the
 *           runs of rows 1, 3 and 4 again. Each run is made when a row first needs it, so a run
 *           that throws fails the rows that read it rather than the whole file.
 * Then:     The proxy's own answer gives the missing-key line, a provider's refusal the refusal
 *           line, any other body the line naming both; each names the URL it was for, the
 *           provider is skipped after one warning, and the start carries on.
 * Covers:   SR-6, SR-FR8
 * Negative: neither refusal's message reaches stderr, stdout or `opencode.json`, OpenAI's
 *           quoting part of the key; a body that is not JSON, valid JSON followed by more, one
 *           shaped like a wrapped missing-key answer, an error object of an unmeasured shape and
 *           an empty body are taken for neither; with every list answered
 *           200 there is no 401 line; a 401 is not asked again; no body is left in /tmp, after a
 *           401 or after a list that never answered 200.
 * Counterpart: the two missing-key rows and the two refusal rows, each asserting the others'
 *           lines are absent; row 12, which finds the provider that did answer in
 *           `opencode.json`; and row 14, which finds the list that did answer in /tmp.
 *
 * Test data: `BASE_ENV`, `PRIVACY_ROUTING` unset, the CLI off. The bodies are measured on
 * 2026-11-03: the missing-key answer from the running proxy 0.3.0 for `anthropic`, and for
 * `openai` the same handler's answer, which that installation could not give since it holds an
 * OpenAI key; the two refusals from OpenAI and Anthropic, asked with the made-up key
 * `lu-sr-not-a-key`. OpenAI's quotes it as `lu-sr-no***-key`, which row 5 looks for. The body
 * with more after it, the wrapped body, the error object carrying `provider_key_missing` as a code
 * and the 403 are invented on purpose: shapes a changed proxy or provider could send, which
 * nothing measured.
 */
import { test, expect, describe } from 'bun:test';
import {
  ALL_ON, ANTHROPIC, ANTHROPIC_KEY_MISSING, BASE_ENV, LOCAL, OPENAI, ok, runEntrypoint, type Answer
} from '../lib/opencodefixture';

const ENV = { ...BASE_ENV, ENABLE_ANTHROPIC_CLAUDE_CODE: '0' };
const OPENAI_URL = `${BASE_ENV.PRIVACY_PROXY_URL}/openai/v1/models`;
const ANTHROPIC_URL = `${BASE_ENV.PRIVACY_PROXY_URL}/anthropic/v1/models`;

const OPENAI_KEY_MISSING = '{"error":"provider_key_missing","provider":"openai"}';
const OPENAI_REFUSAL =
  '{"error":{"message":"Incorrect API key provided: lu-sr-no***-key. You can find your API key at https://platform.openai.com/account/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}';
const ANTHROPIC_REFUSAL =
  '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011Cgg9ReqgB89TncJDxGBcD"}';
const WRAPPED = '{"detail":{"error":"provider_key_missing"}}';
const UNMEASURED_OBJECT = '{"error":{"code":"provider_key_missing"}}';
const TRAILING = '{"error":"provider_key_missing"} junk';

const unauthorized = (body?: string): Answer => (body === undefined ? { status: '401' } : { status: '401', body });
const line = (url: string, why: string) => `WARNING: ${url} -> HTTP 401: ${why} (.env section 5) — provider skipped.`;
const noKey = (url: string) => line(url, 'the privacy proxy holds no key for that provider');
const refused = (url: string) => line(url, 'the provider refused the key the privacy proxy sent');
const either = (url: string) => line(url, 'the privacy proxy holds no key for that provider, or the provider refused it');

const anthropicSays = (a: Answer) => runEntrypoint({ local: ok(LOCAL), openai: ok(OPENAI), anthropic: a }, ENV);
const openaiSays = (a: Answer) => runEntrypoint({ local: ok(LOCAL), openai: a, anthropic: ok(ANTHROPIC) }, ENV);

const once = <T>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};
const anthropicMissing = once(() => anthropicSays(unauthorized(ANTHROPIC_KEY_MISSING)));
const openaiMissing = once(() => openaiSays(unauthorized(OPENAI_KEY_MISSING)));
const openaiRefusal = once(() => openaiSays(unauthorized(OPENAI_REFUSAL)));
const anthropicRefusal = once(() => anthropicSays(unauthorized(ANTHROPIC_REFUSAL)));

describe('SR-6 the 401 warning tells a missing key from a refused one', () => {
  test('SR-6 the proxy holds no Anthropic key: the warning says so, and nothing of a refusal', () => {
    expect(anthropicMissing().stderr).toContain(noKey(ANTHROPIC_URL));
    expect(anthropicMissing().stderr).not.toContain('refused');
  });

  test('SR-6 and likewise for OpenAI, whose answer is written to a file of its own', () => {
    expect(openaiMissing().stderr).toContain(noKey(OPENAI_URL));
    expect(openaiMissing().stderr).not.toContain('refused');
  });

  test('SR-6 OpenAI refuses the key: the warning says refused, and nothing of a missing key', () => {
    expect(openaiRefusal().stderr).toContain(refused(OPENAI_URL));
    expect(openaiRefusal().stderr).not.toContain('holds no key');
  });

  test('SR-6 and likewise Anthropic refusing the key', () => {
    expect(anthropicRefusal().stderr).toContain(refused(ANTHROPIC_URL));
    expect(anthropicRefusal().stderr).not.toContain('holds no key');
  });

  test('SR-6 the negative: neither refusal message reaches stderr, stdout or opencode.json', () => {
    const all = [openaiRefusal(), anthropicRefusal()].map((r) => r.stderr + r.stdout + r.raw).join('');
    expect(all).not.toContain('Incorrect API key');
    expect(all).not.toContain('lu-sr-no***-key');
    expect(all).not.toContain('invalid x-api-key');
  });

  test('SR-6 the negative: a 401 whose body is not JSON is taken for neither', () => {
    expect(anthropicSays(unauthorized('Unauthorized')).stderr).toContain(either(ANTHROPIC_URL));
  });

  test('SR-6 the negative: nor is valid JSON with more after it, which jq cannot read whole', () => {
    expect(anthropicSays(unauthorized(TRAILING)).stderr).toContain(either(ANTHROPIC_URL));
  });

  test('SR-6 the negative: nor is a body shaped like a wrapped missing-key answer', () => {
    expect(anthropicSays(unauthorized(WRAPPED)).stderr).toContain(either(ANTHROPIC_URL));
  });

  test('SR-6 the negative: nor an error object no provider was measured giving', () => {
    expect(anthropicSays(unauthorized(UNMEASURED_OBJECT)).stderr).toContain(either(ANTHROPIC_URL));
  });

  test('SR-6 the negative: nor a 401 with an empty body', () => {
    expect(anthropicSays(unauthorized()).stderr).toContain(either(ANTHROPIC_URL));
  });

  test('SR-6 the negative: with every list answered 200, no HTTP 401 line', () => {
    expect(runEntrypoint(ALL_ON, ENV).stderr).not.toContain('HTTP 401');
  });

  test('SR-6 either way the provider is left out and the start carries on', () => {
    expect([anthropicMissing().code, openaiRefusal().code]).toEqual([0, 0]);
    expect(Object.keys(anthropicMissing().config.provider)).not.toContain('privacy-anthropic');
    expect(Object.keys(anthropicMissing().config.provider)).toContain('privacy-openai');
    expect(Object.keys(openaiRefusal().config.provider)).not.toContain('privacy-openai');
    expect(Object.keys(openaiRefusal().config.provider)).toContain('privacy-anthropic');
  });

  test('SR-6 the negative: a 401 ends that list after one warning, without retrying', () => {
    for (const r of [anthropicMissing(), openaiRefusal()]) {
      expect(r.stderr.split('\n').filter((l) => l.includes('HTTP 401'))).toHaveLength(1);
      expect(r.stderr).not.toContain('unreachable');
    }
  });

  test('SR-6 the negative: the refusal body is not left in /tmp, while the list that answered is', () => {
    expect(openaiRefusal().tmp).not.toContain('privacy_openai_models.json');
    expect(openaiRefusal().tmp).toContain('privacy_models.json');
    expect(anthropicRefusal().tmp).not.toContain('privacy_models.json');
    expect(anthropicRefusal().tmp).toContain('privacy_openai_models.json');
  });

  test('SR-6 the negative: nor is the body of a list that never answered 200', () => {
    const r = openaiSays({ status: '403', body: OPENAI_REFUSAL });
    expect(r.stderr).toContain(`WARNING: ${OPENAI_URL} unreachable (HTTP 403)`);
    expect(r.tmp).not.toContain('privacy_openai_models.json');
  });
});
