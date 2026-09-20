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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const IMAGE_NEW = 'ghcr.io/openclaw/openclaw:2026.9.1';

/**
 * The config writer as the start script actually holds it — extracted by
 * content, never copied here. A test carrying its own copy of the thing under
 * test stops testing it the moment the two drift.
 */
function configWriter(): string {
  const script = readFileSync(join(repoRoot, 'config/scripts/start/openclaw.sh'), 'utf8');
  const lines = script.split('\n');
  const isOpen = (l: string) => /^\s*-e '\s*$/.test(l);
  const isClose = (l: string) => /^\s*'/.test(l);
  for (let start = 0; start < lines.length; start++) {
    if (!isOpen(lines[start])) continue;
    for (let i = start + 1; i < lines.length; i++) {
      if (!isClose(lines[i])) continue;
      const body = lines.slice(start + 1, i).join('\n');
      if (body.includes('/state/openclaw.json')) return body;
      break;
    }
  }
  throw new Error('config writer not found in config/scripts/start/openclaw.sh');
}

let program: string;
let workRoot: string;

beforeAll(() => {
  program = configWriter();
  workRoot = mkdtempSync(join(tmpdir(), 'lu-m1-'));
});

afterAll(() => rmSync(workRoot, { recursive: true, force: true }));

function writeConfig(env: Record<string, string>): any {
  const dir = mkdtempSync(join(workRoot, 'state-'));
  writeFileSync(join(dir, 'openclaw.json'), '{}\n');
  writeFileSync(join(dir, 'writer.js'), program);
  const full: Record<string, string> = {
    OC_SCHEMA_NEW: '0',
    OPENCLAW_VERSION: 'test',
    ENABLE_CLAUDE_CLI: '0',
    ENABLE_COPILOT: '0',
    ENABLE_CODEX: '0',
    ENABLE_GROK: '0',
    ENABLE_LOCAL: '0',
    LU_PROXY_IP: '10.99.0.2',
    LU_PROXY_IDENTITY: 'user@example.invalid',
    LU_NETWORK_SUBNET: '10.99.0.0/24',
    PLUGIN_PATHS: '',
    MODEL_WILDCARDS: '',
    OPENROUTER_MODELS_JSON: '[]',
    LOCAL_LLM_MODELS_JSON: '[]',
    ...env
  };
  const envArgs: string[] = [];
  for (const [k, v] of Object.entries(full)) envArgs.push('-e', `${k}=${v}`);
  const r = sh([
    'docker', 'run', '--rm', '--user', '0:0',
    '-v', `${dir}:/state`, ...envArgs,
    '--entrypoint', 'node', IMAGE_NEW, '/state/writer.js'
  ]);
  if (r.code !== 0) throw new Error(`config writer failed: ${r.output}`);
  return JSON.parse(readFileSync(join(dir, 'openclaw.json'), 'utf8'));
}

describe('M1-1 the 2026.9 shape switches the memory on', () => {
  let cfg: any;
  beforeAll(() => { cfg = writeConfig({ OC_SCHEMA_NEW: '1' }); });

  test('M1-1 active-memory is enabled', () => {
    // Enabled is not loaded — OC-31's lesson — but a plugin that is not enabled
    // cannot load either, and this is the half the start owns.
    expect(cfg.plugins.entries['active-memory']).toEqual({ enabled: true });
  });

  test('M1-1 memory.search is on, and reads memory files rather than transcripts', () => {
    expect(cfg.memory.search.enabled).toBe(true);
    expect(cfg.memory.search.rememberAcrossConversations).toBe(true);
    // The negative that carries NFR-M1: "sessions" would index transcript
    // history, and a conversation in this stack carries .env lines and keys. It
    // may be added when the redaction of NFR-M4 exists, and not before.
    expect(cfg.memory.search.sources).toEqual(['memory']);
    expect(cfg.memory.search.sources).not.toContain('sessions');
  });

  test('M1-3 and no embedding provider is written here', () => {
    // It defaults to openai and the gateway has OPENAI_API_KEY. Writing one here
    // would silently win or lose against the Copilot branch depending on the
    // order of two blocks, which is not a thing to leave to line numbers.
    expect(cfg.memory.search.provider).toBeUndefined();
  });
});

describe('M1-2 the 2026.7 shape carries neither key', () => {
  test('M1-2 because that version knows neither, and rejects what it does not know', () => {
    // The negative half. 2026.9.1 relocated this subtree and removed the old
    // path; neither validates on both versions, and an unknown key on 2026.7.1
    // is a failed start rather than a warning — §5.1 of the migration document.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '0' });
    expect(cfg.memory?.search).toBeUndefined();
    expect(cfg.plugins?.entries?.['active-memory']).toBeUndefined();
  });
});

describe('M1-4 the Copilot path keeps owning the provider', () => {
  test('M1-4 with Copilot on, the provider is github-copilot and the rest still applies', () => {
    // Both halves in one run: the block under test must not take the provider
    // over, and must still switch the memory on.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_COPILOT: '1' });
    expect(cfg.memory.search.provider).toBe('github-copilot');
    expect(cfg.memory.search.enabled).toBe(true);
    expect(cfg.plugins.entries['active-memory']).toEqual({ enabled: true });
  });
});
