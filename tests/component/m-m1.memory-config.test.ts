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

  test('M1-8 and an unrelated per-agent setting survives', () => {
    // The counterpart: forcing two keys must not mean rewriting the subtree.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1' }, {
      agents: { list: [{ id: 'main', memory: { search: { sources: ['memory'], maxResults: 9 } } }] }
    });
    expect(cfg.agents.list[0].memory.search.maxResults).toBe(9);
  });
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
