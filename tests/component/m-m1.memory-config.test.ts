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
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import {
  IMAGE_NEW,
  activeMemoryGates,
  IMAGE_OLD,
  configWriter,
  dropWorkRoot,
  newWorkRoot,
  validate,
  doctorFix,
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
const M1_ENV: Env = { MEMORY_OPENAI_KEY: '1' };

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
  beforeAll(() => { cfg = writeConfig({ OC_SCHEMA_NEW: '1', MEMORY_OPENAI_KEY: '0' }); });

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

    // The control, and it has to be specific. Validating the whole 2026.9
    // shape on 2026.7.1 fails over `deviceAutoApprove` alone, so it said
    // nothing about the memory keys at all -- point 5 of the 2026-09-28
    // review. This takes the 2026.7 output, which that version accepts, and
    // adds only the two keys.
    expect(validate({ workRoot, config: cfg, image: IMAGE_OLD }).code).toBe(0);
    const withMemory = JSON.parse(JSON.stringify(cfg));
    withMemory.memory = { search: { enabled: true, sources: ['memory'] } };
    withMemory.plugins = withMemory.plugins || {};
    withMemory.plugins.entries = withMemory.plugins.entries || {};
    withMemory.plugins.entries['active-memory'] = { enabled: true };
    const refused = validate({ workRoot, config: withMemory, image: IMAGE_OLD });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toMatch(/memory|active-memory/i);
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
    // Under `config`, which is where the manifest puts plugin settings. The
    // first version of this case seeded them on the entry itself, a shape
    // 2026.9.1 rejects with `Unrecognized keys: "mode", "timeoutMs"` -- so it
    // proved the merge on a config that cannot exist, and never validated.
    // Point 5 of the 2026-09-28 review.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      plugins: { entries: { 'active-memory': { enabled: true, config: { mode: 'always', timeoutMs: 9000 } } } }
    });
    expect(cfg.plugins.entries['active-memory'].enabled).toBe(true);
    expect(cfg.plugins.entries['active-memory'].config.mode).toBe('always');
    expect(cfg.plugins.entries['active-memory'].config.timeoutMs).toBe(9000);
    expect(validate({ workRoot, config: cfg, image: IMAGE_NEW }).code).toBe(0);
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

describe('M1-7 enabled is not the same as acting', () => {
  test('M1-7 the plugin is active for the default agent', () => {
    // The plugin opens on `isEnabledForAgent(config, agentId) ||
    // (config.enabled && shouldRememberAcrossConversations(...))`. NFR-M1 keeps
    // the second shut, and config.agents defaults to an empty list -- which
    // names nobody. So `enabled: true` was written and nothing was ever
    // gathered: the shape §2.1 calls "it looks the same whether it ran or not".
    // Measured with the image's own functions, not by reading ours.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' });
    const gates = activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW });
    expect(gates.pluginEnabled).toBe(true);
    expect(gates.namesAgent).toBe(true);
    expect(gates.active).toBe(true);
  });

  test('M1-7 and it is active for an agent that is not called main', () => {
    // **N1 of the 2026-10-13 re-review.** The writer wrote `agents: ["main"]`
    // whatever the roster said, so on an installation whose agent is `ops` the
    // config validated and `isEnabledForAgent(..., "ops")` was false — blocker 1
    // again for every install off the stock roster. The operator decided the
    // rule: the plugin covers **every agent the roster names**, computed from
    // `agents.entries`, because NFR-M1 closes transcripts and says nothing about
    // which agents may have a memory.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      agents: { entries: { ops: { memory: { search: { sources: ['memory'] } } } } }
    });
    expect(cfg.plugins.entries['active-memory'].config.agents).toEqual(['ops']);
    const gates = activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW, agentId: 'ops' });
    expect(gates.namesAgent).toBe(true);
    expect(gates.active).toBe(true);
    // And still no transcripts, which is the thing being protected.
    expect(gates.remembers).toBe(false);
    expect(validate({ workRoot, config: cfg, image: IMAGE_NEW }).code).toBe(0);
  }, 600_000);

  test('M1-7 and with two agents it covers both, not whichever is first', () => {
    // `openclaw agents add ops` on a stock install gives exactly this, and the
    // plugin then acted for `main` alone. Both ids are asserted **and** both are
    // asked of the image, because a list containing an id says nothing about
    // whether the gate opens for it.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      agents: { entries: {
        main: { memory: { search: { sources: ['memory'] } } },
        ops: { memory: { search: { sources: ['memory'] } } }
      } }
    });
    expect(cfg.plugins.entries['active-memory'].config.agents.sort()).toEqual(['main', 'ops']);
    for (const id of ['main', 'ops']) {
      expect(activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW, agentId: id }).active).toBe(true);
    }
  }, 900_000);

  test('M1-7 and an operator list is still left alone', () => {
    // The counterpart: computing the roster must not mean overwriting a choice
    // the operator made. M1-4 holds this for the stock shape; this one holds it
    // against a roster that would otherwise have supplied a different answer.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      agents: { entries: { main: {}, ops: {} } },
      plugins: { entries: { 'active-memory': { config: { agents: ['ops'] } } } }
    });
    expect(cfg.plugins.entries['active-memory'].config.agents).toEqual(['ops']);
  }, 600_000);

  test('M1-7 and the probe agrees with the runtime when the operator has switched it off', () => {
    // **N2 of the 2026-10-13 re-review: the probe re-implemented the gate it
    // claims to measure.** `namesAgent` was
    // `Boolean(entry.enabled) && agents.includes(agent)`, while the runtime calls
    // `isEnabledForAgent(normalizePluginConfig(entry.config), agent)` — the
    // **inner** flag. An operator who has typed `/active-memory off --global`
    // has `config.enabled: false` written, and the writer preserves it; the probe
    // said `active: true` and the runtime says the plugin does nothing.
    //
    // This scenario is about the measuring instrument, which is why it exists at
    // all: every M1 gate reading rests on it, and a probe that is wrong in this
    // direction makes the other cases green over a stack that is not working.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      plugins: { entries: { 'active-memory': { config: { enabled: false } } } }
    });
    const gates = activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW });
    expect(gates.namesAgent).toBe(false);
    expect(gates.active).toBe(false);
  }, 600_000);

  test('M1-7 and a denied plugin is not active, whatever the entry says', () => {
    // The second shape, and it is why `active` has to include `pluginEnabled`:
    // `isEnabledForAgent` is given the plugin's own config, which cannot know
    // about `plugins.deny`. So `namesAgent` is **true** here and the plugin still
    // does nothing — a reading the old definition of `active` could not produce.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, { plugins: { deny: ['active-memory'] } });
    const gates = activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW });
    expect(gates.pluginEnabled).toBe(false);
    expect(gates.active).toBe(false);
  }, 600_000);

  test('M1-7 and it still does not recall transcripts to get there', () => {
    // The counterpart. Opening the first gate must not be done by opening the
    // second, which is what NFR-M1 forbids.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' });
    expect(activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW }).remembers).toBe(false);
  });

  test('M1-7 and an agent list the operator set is left alone', () => {
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      plugins: { entries: { 'active-memory': { enabled: true, config: { agents: ['main', 'second'] } } } }
    });
    expect(cfg.plugins.entries['active-memory'].config.agents).toEqual(['main', 'second']);
  });
});

describe('M1-8 a per-agent override does not bring transcripts back', () => {
  test('M1-8 the guard reaches agents.list too', () => {
    // OpenClaw resolves these as agents.list[i].memory.search.X ?? memory.search.X,
    // so a per-agent block walked straight past a guard that only wrote the
    // defaults level. Blocker 2 of 2026-09-28.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      agents: { list: [{ id: 'main', memory: { search: {
        rememberAcrossConversations: true, sources: ['memory', 'sessions']
      } } }] }
    });
    const a = cfg.agents.list[0].memory.search;
    expect(a.rememberAcrossConversations).toBe(false);
    expect(a.sources).toEqual(['memory']);
    expect(activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW }).remembers).toBe(false);
  });

  test('M1-8 the guard reaches agents.entries, which is the shape that persists', () => {
    // **C1 of the 2026-10-13 re-review: blocker 2 was only half closed.** The
    // guard walked `agents.list`, and in 2026.9.1 that is the *legacy* roster:
    // `listAgentEntries` reads `agents.entries` first, the validator reports
    // `agents.list` problems under `agents.entries.<id>`, `config validate` warns
    // about any `agents.list`, and the image calls the keyed map canonical.
    //
    // Reproduced before the repair, with this seed: the block came through the
    // writer **untouched** -- `{"rememberAcrossConversations":true,"sources":["memory","sessions"]}`
    // -- the config validated, and the image resolver answered
    // `remembers: true`. The guard protected the one representation that cannot
    // persist and missed the one every tool writes.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      agents: { entries: { main: { memory: { search: {
        rememberAcrossConversations: true, sources: ['memory', 'sessions']
      } } } } }
    });
    const a = cfg.agents.entries.main.memory.search;
    expect(a.rememberAcrossConversations).toBe(false);
    expect(a.sources).toEqual(['memory']);
    expect(activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW }).remembers).toBe(false);
  }, 600_000);

  test('M1-8 and experimental.sessionMemory is a third route to the same outcome', () => {
    // The resolver turns transcript indexing on when this flag is true and
    // `sessions` is in the agent sources -- **even with
    // rememberAcrossConversations false**, so forcing two keys left a way in
    // that `remembers` does not report. Measured before the repair: the flag
    // survived the writer with `sources` intact.
    //
    // Asserted on the written config rather than on a gate, deliberately:
    // `shouldRememberAcrossConversations` reads the other key, so a gate reading
    // would be green here in both worlds and say nothing. The flag itself is the
    // observable.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      agents: { entries: { main: { memory: { search: {
        rememberAcrossConversations: false, sources: ['memory', 'sessions'],
        experimental: { sessionMemory: true }
      } } } } }
    });
    const a = cfg.agents.entries.main.memory.search;
    expect(a.experimental.sessionMemory).toBe(false);
    expect(a.sources).toEqual(['memory']);
  }, 600_000);

  test('M1-8 and the stack own upgrade path does not open it either', () => {
    // The sequence the stack really performs: a roster an operator wrote on
    // 2026.7.1, through `doctor --fix` -- which `openclaw_migrate_state` runs
    // **before** this writer whenever the state came from an older version --
    // and then through the writer. One of the migration rules is literally
    // "agents.list moved to keyed agents.entries", so this is how an ordinary
    // installation arrives at the keyed shape without anybody choosing it.
    const seeded = {
      agents: { list: [{ id: 'main', memory: { search: {
        rememberAcrossConversations: true, sources: ['memory', 'sessions'],
        experimental: { sessionMemory: true }
      } } } ] }
    };
    const migrated = doctorFix({ workRoot, config: seeded, image: IMAGE_NEW });
    // What the migration did is the premise of the case, so it is read rather
    // than assumed: if a later image stops moving the roster, this says so
    // instead of quietly testing the legacy path twice.
    const movedToEntries = Boolean(migrated.config?.agents?.entries?.main);
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, migrated.config);
    const block = movedToEntries
      ? cfg.agents.entries.main.memory.search
      : cfg.agents.list[0].memory.search;
    expect(block.rememberAcrossConversations).toBe(false);
    expect(block.sources).toEqual(['memory']);
    expect(activeMemoryGates({ workRoot, config: cfg, image: IMAGE_NEW }).remembers).toBe(false);
  }, 900_000);

  test('M1-8 and an unrelated per-agent setting survives', () => {
    // The counterpart: forcing three keys must not mean rewriting the subtree.
    //
    // **The seed was invalid, which N4 of the 2026-10-13 re-review found.** It
    // was `maxResults: 9` directly under `memory.search`, and 2026.9.1 rejects
    // that — `× agents.entries.main.memory.search: Unrecognized key:
    // "maxResults"`, exit 1. So the counterpart proved a subtree survives on a
    // configuration that cannot exist, and it never called `validate`. The real
    // key is `query.maxResults`, and the seed is on `agents.entries`, the shape
    // that persists (C1). Validation is asserted here rather than assumed,
    // because that is the half whose absence let the wrong shape through.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      agents: { entries: { main: { memory: { search: {
        sources: ['memory'], query: { maxResults: 9 }
      } } } } }
    });
    expect(cfg.agents.entries.main.memory.search.query.maxResults).toBe(9);
    expect(validate({ workRoot, config: cfg, image: IMAGE_NEW }).code).toBe(0);
  }, 600_000);
});

describe('M1-12 a credential the operator configured is a credential', () => {
  test('M1-12 an own OpenAI-compatible endpoint is not switched off for having no env key', () => {
    // **N3 of the 2026-10-13 re-review**, and it is blocker 3 for a shape the
    // schema supports: `provider: "openai"` with `memory.search.remote.baseUrl`
    // and `remote.apiKey` — an endpoint the operator runs — and no
    // `OPENAI_API_KEY` in the environment. The gate read the environment only,
    // so this was switched off on every start with a line claiming there was no
    // embedding credential. There was one; we looked in the wrong place.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', MEMORY_OPENAI_KEY: '0' }, {
      memory: { search: { enabled: true, provider: 'openai', remote: {
        baseUrl: 'http://embeddings.localhost:8080/v1', apiKey: 'operator-own-key'
      } } }
    });
    expect(cfg.memory.search.enabled).toBe(true);
    expect(cfg.plugins.entries['active-memory'].enabled).toBe(true);
    // The operator settings are theirs and survive.
    expect(cfg.memory.search.remote.baseUrl).toBe('http://embeddings.localhost:8080/v1');
    expect(validate({ workRoot, config: cfg, image: IMAGE_NEW }).code).toBe(0);
  }, 600_000);

  test('M1-12 the counterpart: no key anywhere is still no credential', () => {
    // Without this the repair could be "always on", which is the thing
    // `.env.example:85` promises against — an installation with no keys at all
    // must not buy a failed embedding call per turn. An empty string is not a
    // key either, which is the shape a half-filled `.env` leaves.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', MEMORY_OPENAI_KEY: '0' }, {
      memory: { search: { enabled: true, provider: 'openai', remote: { baseUrl: 'http://x/v1', apiKey: '   ' } } }
    });
    expect(cfg.memory.search.enabled).toBe(false);
  }, 600_000);
});

describe('M1-9 a provider this stack does not hold credentials for is not ours to switch', () => {
  test('M1-9 ollama on a key-less install keeps memory search as it was', () => {
    // The gate knew only OPENAI_API_KEY and Copilot, and wrote `enabled` on
    // every start -- so an operator using ollama had their memory switched off
    // each time, with a log line claiming there was no credential. Before this
    // PR the script never touched the key at all. Blocker 3 of 2026-09-28.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', MEMORY_OPENAI_KEY: '0' }, {
      memory: { search: { provider: 'ollama', enabled: true } }
    });
    expect(cfg.memory.search.provider).toBe('ollama');
    expect(cfg.memory.search.enabled).toBe(true);
  });

  test('M1-9 while openai with no key is still switched off', () => {
    // The counterpart: the gate still does its job where it knows the answer.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', MEMORY_OPENAI_KEY: '0' });
    expect(cfg.memory.search.enabled).toBe(false);
  });
});

describe('M1-10 a provider left by a harness that is off does not count as a credential', () => {
  test('M1-10 a leftover github-copilot is removed and the gate falls back', () => {
    // The Copilot branch writes the provider and nothing removed it when
    // Copilot was switched off, so the gate enabled memory on a provider with
    // no auth. Should-fix 4 of 2026-09-28.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_COPILOT: '0', MEMORY_OPENAI_KEY: '0' }, {
      memory: { search: { provider: 'github-copilot', enabled: true } }
    });
    expect(cfg.memory.search.provider).toBeUndefined();
    expect(cfg.memory.search.enabled).toBe(false);
  });

  test('M1-10 and with Copilot on it is kept and used', () => {
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_COPILOT: '1', MEMORY_OPENAI_KEY: '0' });
    expect(cfg.memory.search.provider).toBe('github-copilot');
    expect(cfg.memory.search.enabled).toBe(true);
  });
});

describe('M1-11 the shell half of the gate is executed, not read', () => {
  test('M1-11 the key in .env becomes the flag, and its absence does not', () => {
    // Injecting MEMORY_OPENAI_KEY into the writer leaves the computation that
    // produces it untested: deleting it, or the `-e` line that hands it over,
    // left every case green. Point 5 of the 2026-09-28 review. The lines are
    // lifted out of the script and run, so this fails if they go.
    const script = readFileSync(join(repoRoot, 'config/scripts/start/openclaw.sh'), 'utf8');
    const compute = script
      .split('\n')
      .filter((l) => /^MEMORY_OPENAI_KEY=|^\[\[ -n "\$\(get_env OPENAI_API_KEY\)" \]\]/.test(l.trim()))
      .join('\n');
    expect(compute).toContain('MEMORY_OPENAI_KEY=0');
    expect(compute).toContain('get_env OPENAI_API_KEY');

    const run = (envBody: string) => {
      const dir = mkdtempSync(join(workRoot, 'shell-'));
      writeFileSync(join(dir, '.env'), envBody);
      const harness = [
        'set -uo pipefail',
        // No quote-stripping in the stub: what is under test is the
        // computation, and the fixture writes bare values.
        `get_env() { grep -E "^$1=" ${JSON.stringify(join(dir, '.env'))} 2>/dev/null | head -n1 | cut -d= -f2- || true; }`,
        compute,
        'printf %s "$MEMORY_OPENAI_KEY"'
      ].join('\n');
      return sh(['bash', '-c', harness]).stdout.trim();
    };

    expect(run('OPENAI_API_KEY=sk-test-value\n')).toBe('1');
    expect(run('OPENAI_API_KEY=\n')).toBe('0');
    expect(run('SOMETHING_ELSE=1\n')).toBe('0');
  });

  test('M1-11 and the writer is actually handed it', () => {
    // A contract check, deliberately: the alternative is running the whole
    // start. It fails if the `-e` line is removed, which is the case point 5
    // names.
    const script = readFileSync(join(repoRoot, 'config/scripts/start/openclaw.sh'), 'utf8');
    expect(script).toMatch(/-e MEMORY_OPENAI_KEY="\$\{MEMORY_OPENAI_KEY\}"/);
  });
});
