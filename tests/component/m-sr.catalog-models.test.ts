/**
 * M-SR · Component · The privacy providers offer the models a manifest declares, and nothing else
 *
 * Purpose:  `catalogOf()` in OpenClaw's config writer collected every node of a bundled plugin
 *           manifest with a string `id` and a numeric `contextWindow`. In 2026.9.1's anthropic
 *           manifest that includes sixteen entries under the `contextWindows` lists of four
 *           models, such as `{"id":"200k","label":"200K","contextWindow":200000}`, so the picker
 *           offered `200k` and `1m` as models of `privacy-anthropic`. It now reads
 *           `modelCatalog.providers.*.models` (SR-FR3). It must lose no model, and must not
 *           change `privacy-openai` or the Claude CLI's list.
 * Given:    The writer as `config/scripts/start/openclaw.sh` holds it, run with node in
 *           `ghcr.io/openclaw/openclaw:2026.9.1` against the manifests that image ships.
 * When:     Two starts under `opt-in` on `{}`: start a with the CLI `0` and both privacy
 *           providers `1`; start b the same with the CLI `1`.
 * Then:     After start a, `privacy-anthropic` holds the ten models of the anthropic manifest in
 *           its order and `privacy-openai` the nine of the openai manifest; after start b,
 *           `claude-cli` holds the six models it pinned before.
 * Covers:   SR-2, SR-FR3
 * Negative: neither `200k` nor `1m` is offered by `privacy-anthropic`.
 * Counterpart: `claude-opus-4-7`, `claude-sonnet-4-6` and `claude-opus-4-6`, which the manifest
 *           lists under `claude-cli` alone, are still offered, so the read spans every provider of
 *           the manifest; and the other two lists are what they were.
 *
 * Test data, measured on 2026-11-02 in the image and deduplicated as `catalogOf()` does:
 * anthropic, today, `claude-opus-5`, `200k`, `1m`, `claude-sonnet-5`, `claude-fable-5-1`,
 * `claude-fable-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-opus-4-6`,
 * `claude-mythos-5`, `claude-haiku-4-5`; read from the providers, the same without `200k` and
 * `1m`. openai both ways: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.5-pro`,
 * `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`. `claude-cli` both ways:
 * `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1`, `claude-fable-5`, `claude-opus-4-8`,
 * `claude-mythos-5`. Environment: `BASE_ENV` with `OC_SCHEMA_NEW=1`, `PRIVACY_ROUTING=opt-in`,
 * `ENABLE_CODEX=0` and `PRIVACY_PROXY_URL=http://privacy-proxy:8080`.
 *
 * Precondition: docker and `ghcr.io/openclaw/openclaw:2026.9.1`; without the image every case is
 * skipped and one named case says so.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { IMAGE_NEW, configWriter, dropWorkRoot, newWorkRoot, writeConfig, type Env } from '../lib/openclaw-writer';
import { sh } from '../lib/shell';

const HAVE_IMAGE = sh(['docker', 'image', 'inspect', IMAGE_NEW]).code === 0;
const LONG = 120_000;

const ANTHROPIC = [
  'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-fable-5', 'claude-opus-4-8',
  'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-mythos-5', 'claude-haiku-4-5'
];
const OPENAI = [
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-pro',
  'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'gpt-5.4-nano'
];
const CLAUDE_CLI = ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-fable-5', 'claude-opus-4-8', 'claude-mythos-5'];

const ENV: Env = {
  OC_SCHEMA_NEW: '1', PRIVACY_ROUTING: 'opt-in', ENABLE_CODEX: '0',
  PRIVACY_OPENAI: '1', PRIVACY_ANTHROPIC: '1', PRIVACY_PROXY_URL: 'http://privacy-proxy:8080'
};
const ids = (config: any, provider: string): string[] =>
  (config?.models?.providers?.[provider]?.models ?? []).map((m: any) => m.id);

let root = '';
let a: any = null;
let b: any = null;

describe.skipIf(!HAVE_IMAGE)('SR-2 the models the privacy providers offer', () => {
  if (!HAVE_IMAGE) return;
  beforeAll(() => {
    root = newWorkRoot('lu-sr2-');
    const program = configWriter();
    a = writeConfig({ workRoot: root, program, env: { ...ENV, ENABLE_CLAUDE_CLI: '0' } });
    b = writeConfig({ workRoot: root, program, env: { ...ENV, ENABLE_CLAUDE_CLI: '1' } });
  }, LONG);
  afterAll(() => dropWorkRoot(root));

  test('SR-2 the negative: privacy-anthropic offers neither 200k nor 1m', () => {
    expect(ids(a, 'privacy-anthropic')).not.toContain('200k');
    expect(ids(a, 'privacy-anthropic')).not.toContain('1m');
  });

  test('SR-2 privacy-anthropic offers exactly the ten models of the anthropic manifest, in its order', () => {
    expect(ids(a, 'privacy-anthropic')).toEqual(ANTHROPIC);
  });

  test('SR-2 privacy-openai offers the nine models of the openai manifest, as before', () => {
    expect(ids(a, 'privacy-openai')).toEqual(OPENAI);
  });

  test('SR-2 with the Claude subscription on, claude-cli pins the same six models as before', () => {
    expect(ids(b, 'claude-cli')).toEqual(CLAUDE_CLI);
  });
});

test.skipIf(HAVE_IMAGE)(`SR-2 needs ${IMAGE_NEW}, which is not present here`, () => {
  expect(HAVE_IMAGE).toBe(false);
});
