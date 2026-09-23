/**
 * M1-1 to M1-4 — the mid-term memory is switched on by the start, in the shape
 * the running version accepts.
 *
 * Purpose: `docs/FEATURE-memory-midterm.md` §2.2. OpenClaw 2026.9.1 already
 * ships the memory this project set out to design — `memory-core` indexes and
 * ranks, `active-memory` implements Remember across conversations, and a nightly
 * consolidation promotes what survives into `MEMORY.md`. Two of the three were
 * switched off here and nobody had noticed: the consolidation wrote *"Ranked 0
 * candidate(s)"* every day from 2026-09-11 and was read by no one for nine days.
 *
 * Promotion is earned by **use** — three recalls across three distinct queries
 * inside thirty days, thresholds read out of `openclaw memory promote-explain`
 * on 2026-09-20 — so this configuration changes nothing until somebody asks
 * questions. It is written now so that the first week of real use is measured
 * rather than missed, and so that the setting survives a start rather than
 * living as a hand edit that the next `start.sh` silently removes.
 *
 * Given  the config writer taken out of config/scripts/start/openclaw.sh itself
 * When   it runs for each version's shape
 * Then   the 2026.9 config enables active-memory and carries memory.search
 * And    the 2026.7 config carries neither, because that version knows neither
 *        key and an unknown key there is a failed start rather than a warning
 * And    `sources` stays at ["memory"], because "sessions" would index transcript
 *        history — which is exactly what NFR-M1 forbids while the redaction of
 *        NFR-M4 does not exist
 * And    no embedding provider is written here, so the Copilot branch keeps
 *        owning it when that harness is on
 *
 * M1-2 is the negative half and the one that matters: the 2026.7 shape must be
 * free of both keys. A configuration that validates on the version you are
 * looking at says nothing about the one the operator is running.
 *
 * Test data: a seed config of `{}` — the writer builds every key it needs. The
 * Copilot case runs with ENABLE_COPILOT=1, which is the one path that legitimately
 * sets `memory.search.provider`, and asserts this block did not take it over.
 *
 * Requirements covered: FR-M4, FR-M5, NFR-M1, and §2.3 of the feature document.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import {
  IMAGE_NEW,
  IMAGE_OLD,
  configWriter,
  dropWorkRoot,
  newWorkRoot,
  validate,
  writeConfig as runWriter,
  type Env
} from '../lib/openclaw-writer';

let program: string;
let workRoot: string;

beforeAll(() => {
  program = configWriter();
  workRoot = newWorkRoot('lu-m1-');
});

afterAll(() => dropWorkRoot(workRoot));

// This installation has an embedding credential; M1-6 covers the one that does
// not, which .env.example:85 explicitly allows.
const M1_ENV: Env = { MEMORY_EMBEDDINGS: '1' };

function writeConfig(env: Env, seed: unknown = {}): any {
  return runWriter({ workRoot, program, env: { ...M1_ENV, ...env }, seed });
}

describe('M1-1 the 2026.9 shape switches the memory on', () => {
  let cfg: any;
  beforeAll(() => { cfg = writeConfig({ OC_SCHEMA_NEW: '1' }); });

  test('M1-1 active-memory is enabled', () => {
    // Enabled is not loaded — OC-31's lesson — but a plugin that is not enabled
    // cannot load either, and this is the half the start owns.
    //
    // `.enabled` rather than `toEqual({enabled: true})`: the exact-object form
    // codified the overwrite F2 reports, so the case would have gone red for a
    // writer that correctly preserved an operator setting.
    expect(cfg.plugins.entries['active-memory'].enabled).toBe(true);
  });

  test('M1-1 memory.search is on, and reads memory files rather than transcripts', () => {
    expect(cfg.memory.search.enabled).toBe(true);
    // **False, and this case used to require true.** The key is transcript
    // recall across private conversations, which is exactly what the `sources`
    // assertion below exists to prevent and what NFR-M1 forbids until the
    // redaction of NFR-M4 exists. F1 of 2026-09-22, and the case had been
    // asserting the defect since 2026-09-20.
    //
    // Explicitly false rather than absent: the schema default is on whenever
    // session.dmScope is unset or "main", a setting this block does not own.
    expect(cfg.memory.search.rememberAcrossConversations).toBe(false);
    // The negative that carries NFR-M1: "sessions" would index transcript
    // history, and a conversation in this stack carries .env lines and keys. It
    // may be added when the redaction of NFR-M4 exists, and not before.
    expect(cfg.memory.search.sources).toEqual(['memory']);
    expect(cfg.memory.search.sources).not.toContain('sessions');
  });

  test('M1-1 and the result is a config 2026.9.1 accepts', () => {
    // The half that says whether the stack would boot. The active-memory
    // manifest sets additionalProperties:false, so a typo in the plugin entry,
    // or a future image renaming a key, is a failed start -- and a suite that
    // only reads the JSON back passes green over it. F5 of 2026-09-22.
    expect(validate({ workRoot, config: cfg, image: IMAGE_NEW }).code).toBe(0);
  });

  test('M1-3 and no embedding provider is written here', () => {
    // It defaults to openai and the gateway has OPENAI_API_KEY. Writing one here
    // would silently win or lose against the Copilot branch depending on the
    // order of two blocks, which is not a thing to leave to line numbers.
    expect(cfg.memory.search.provider).toBeUndefined();
  });
});

describe('M1-6 an installation with no embedding credential', () => {
  let cfg: any;
  beforeAll(() => { cfg = writeConfig({ OC_SCHEMA_NEW: '1', MEMORY_EMBEDDINGS: '0' }); });

  test('M1-6 the memory is not switched on', () => {
    // memory.search defaults to the openai provider, so switching it on without
    // a key buys a failed embedding call per turn -- for a feature the operator
    // did not ask for, on an installation .env.example:85 blesses: "Don't have
    // any keys? That's fine". F4 of 2026-09-22.
    expect(cfg.memory.search.enabled).toBe(false);
    expect(cfg.plugins.entries['active-memory'].enabled).toBe(false);
  });

  test('M1-6 but the guards are written anyway', () => {
    // The counterpart, and the reason the block still runs: sources and the
    // transcript-recall switch are what keep NFR-M1, and they have to be in
    // place for whenever somebody adds a key and switches it on.
    expect(cfg.memory.search.sources).toEqual(['memory']);
    expect(cfg.memory.search.rememberAcrossConversations).toBe(false);
  });

  test('M1-6 and it is still a config 2026.9.1 accepts', () => {
    expect(validate({ workRoot, config: cfg, image: IMAGE_NEW }).code).toBe(0);
  });
});

describe('M1-2 the 2026.7 shape carries neither key', () => {
  test('M1-2 because that version knows neither, and rejects what it does not know', () => {
    // The negative half. 2026.9.1 relocated this subtree and removed the old
    // path; neither validates on both versions, and an unknown key on 2026.7.1
    // is a failed start rather than a warning — §5.1 of the migration document.
    // Seeded with both keys present, not with `{}`. Against an empty config
    // "it is absent" holds whether or not anything removes it, which is a
    // check that cannot fail -- and F8 moved the removal from an inline delete
    // to the retired sweep, so this is the case that says the sweep works.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '0' }, {
      memory: { search: { enabled: true, sources: ['memory'] } },
      plugins: { entries: { 'active-memory': { enabled: true } } }
    });
    expect(cfg.memory?.search).toBeUndefined();
    expect(cfg.plugins?.entries?.['active-memory']).toBeUndefined();
    // And the control that gives the line above its meaning: the 2026.9 shape
    // really is refused by 2026.7.1, so "it validates" is a statement about the
    // version and not about a validator that accepts anything.
    const newShape = writeConfig({ OC_SCHEMA_NEW: '1' });
    expect(validate({ workRoot, config: newShape, image: IMAGE_OLD }).code).not.toBe(0);
  });
});

describe('M1-4 the Copilot path keeps owning the provider', () => {
  test('M1-4 with Copilot on, the provider is github-copilot and the rest still applies', () => {
    // Both halves in one run: the block under test must not take the provider
    // over, and must still switch the memory on.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_COPILOT: '1' });
    expect(cfg.memory.search.provider).toBe('github-copilot');
    expect(cfg.memory.search.enabled).toBe(true);
    expect(cfg.plugins.entries['active-memory'].enabled).toBe(true);
    expect(validate({ workRoot, config: cfg, image: IMAGE_NEW }).code).toBe(0);
  });
});

describe('M1-5 the writer inherits an installation rather than a blank file', () => {
  test('M1-5 an operator setting on the plugin entry survives the start', () => {
    // F2. The manifest declares 29 keys with additionalProperties:false, and
    // assigning a fresh object discarded every one of them, silently, on the
    // next start. Measured against the unfixed writer: {enabled, mode,
    // timeoutMs} came back as {enabled} alone.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      plugins: { entries: { 'active-memory': { enabled: true, mode: 'always', timeoutMs: 9000 } } }
    });
    expect(cfg.plugins.entries['active-memory'].enabled).toBe(true);
    expect(cfg.plugins.entries['active-memory'].mode).toBe('always');
    expect(cfg.plugins.entries['active-memory'].timeoutMs).toBe(9000);
  });

  test('M1-5 and a persisted "sessions" is taken back out', () => {
    // F3, and the negative that matters most here. The comment in the writer
    // claims sources stays at ["memory"] deliberately; before this it only
    // filled the value in when absent, so a "sessions" that reached the file
    // once -- by hand, as it did on this installation on 2026-09-19, or from an
    // older version -- survived every start afterwards.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      memory: { search: { sources: ['memory', 'sessions'] } }
    });
    expect(cfg.memory.search.sources).toEqual(['memory']);
  });

  test('M1-5 and an unrelated memory setting is not disturbed', () => {
    // The counterpart: enforcing one key must not mean rewriting the subtree.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      memory: { search: { sources: ['memory'], maxResults: 7 } }
    });
    expect(cfg.memory.search.maxResults).toBe(7);
    expect(cfg.memory.search.sources).toEqual(['memory']);
  });
});
