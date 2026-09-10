/**
 * OC-1, OC-2, OC-5, OC-6, OC-7, OC-12 — the configuration shape per version.
 *
 * Purpose: OpenClaw 2026.9.1 removed `agents.defaults.cliBackends` from its
 * schema, relocated `agents.defaults.memorySearch` to `memory.search`, and
 * retired `gateway.controlUi.dangerouslyDisableDeviceAuth` — the last of which
 * still validates, so nothing warns about it. The start script therefore writes
 * a different shape per version. These cases prove the writer produces the right
 * one, and — the negative half — that the wrong one really is rejected, in both
 * directions.
 *
 * Given  the config writer taken out of config/scripts/start/openclaw.sh itself,
 *        not a copy of it, run over an empty seed config
 * When   it runs once for each version's shape, and each result is validated by
 *        `openclaw config validate` inside both versions' images
 * Then   each shape validates on its own version and is refused by the other.
 *
 * The negatives carry the weight. OC-2 and OC-6 show the removals were necessary
 * rather than cosmetic; OC-7 shows the incompatibility is symmetric, which is the
 * measured reason the start script probes the version instead of picking one
 * shape and pinning to it.
 *
 * Test data: a seed config of `{}` — the writer builds every key it needs. Copilot
 * cases run with ENABLE_COPILOT=1, which no installation here has ever used, and
 * which is why the relocation is a latent break rather than an observed one.
 *
 * Requirements covered: OC-G1, OC-G2, §5.1, §5.2, §5.3.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync as read } from 'node:fs';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const IMAGE_NEW = 'ghcr.io/openclaw/openclaw:2026.9.1';
const IMAGE_OLD = 'ghcr.io/openclaw/openclaw:2026.7.1';

/**
 * The config writer as the start script actually holds it. Extracted by content
 * rather than by line number, and never copied into this file: a test carrying
 * its own copy of the thing under test stops testing it the moment the two drift.
 */
function configWriter(): string {
  const script = read(join(repoRoot, 'config/scripts/start/openclaw.sh'), 'utf8');
  const lines = script.split('\n');
  // A block opens on a line that is only `-e '` and closes on the next line
  // whose first non-space character is the closing quote. The two sibling
  // blocks close with `' || true)"`, so the terminator cannot be matched as a
  // bare quote — doing that swallowed both of them and produced a program that
  // was half shell.
  const isOpen = (l: string) => /^\s*-e '\s*$/.test(l);
  const isClose = (l: string) => /^\s*'/.test(l);
  for (let start = 0; start < lines.length; start++) {
    if (!isOpen(lines[start])) continue;
    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
      if (isClose(lines[i])) { end = i; break; }
    }
    if (end === -1) continue;
    const body = lines.slice(start + 1, end).join('\n');
    if (body.includes('/state/openclaw.json')) return body;
  }
  throw new Error('config writer not found in config/scripts/start/openclaw.sh');
}

let program: string;
let workRoot: string;

beforeAll(() => {
  program = configWriter();
  workRoot = mkdtempSync(join(tmpdir(), 'lu-oc-'));
});

afterAll(() => rmSync(workRoot, { recursive: true, force: true }));

type Env = Record<string, string>;

function writeConfig(env: Env): any {
  const dir = mkdtempSync(join(workRoot, 'state-'));
  writeFileSync(join(dir, 'openclaw.json'), '{}\n');
  const progFile = join(dir, 'writer.js');
  writeFileSync(progFile, program);
  const envArgs: string[] = [];
  const full: Env = {
    OC_SCHEMA_NEW: '0',
    OPENCLAW_VERSION: 'test',
    ENABLE_CLAUDE_CLI: '0',
    ENABLE_COPILOT: '0',
    ENABLE_CODEX: '0',
    ENABLE_GROK: '0',
    ENABLE_LOCAL: '0',
    LU_NETWORK_SUBNET: '172.18.0.0/16',
    PLUGIN_PATHS: '',
    MODEL_WILDCARDS: '',
    OPENROUTER_MODELS_JSON: '[]',
    LOCAL_LLM_MODELS_JSON: '[]',
    ...env,
  };
  for (const [k, v] of Object.entries(full)) envArgs.push('-e', `${k}=${v}`);
  const r = sh([
    'docker', 'run', '--rm', '--user', '0:0',
    '-v', `${dir}:/state`, ...envArgs,
    '--entrypoint', 'node', IMAGE_NEW, `/state/writer.js`,
  ]);
  if (r.code !== 0) throw new Error(`config writer failed: ${r.output}`);
  return JSON.parse(readFileSync(join(dir, 'openclaw.json'), 'utf8'));
}

/** Validate a config document with a given version's own validator. */
function validate(config: any, image: string): { code: number; output: string } {
  const home = mkdtempSync(join(workRoot, 'home-'));
  mkdirSync(join(home, '.openclaw'), { recursive: true });
  writeFileSync(join(home, '.openclaw/openclaw.json'), JSON.stringify(config, null, 2));
  return sh([
    'docker', 'run', '--rm', '--user', '0:0',
    '-v', `${home}:/home/node`, '-e', 'HOME=/home/node', '-e', 'OPENCLAW_HOME=/home/node',
    '--entrypoint', 'openclaw', image, 'config', 'validate',
  ]);
}

describe('OC-1/OC-12 the 2026.9 shape', () => {
  let cfg: any;
  beforeAll(() => { cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_CLAUDE_CLI: '1' }); });

  test('OC-1 carries no agents.defaults.cliBackends, and validates on 2026.9.1', () => {
    expect(cfg.agents?.defaults?.cliBackends).toBeUndefined();
    expect(validate(cfg, IMAGE_NEW).code).toBe(0);
  });

  test('OC-12 carries no dangerouslyDisableDeviceAuth, and does carry its replacement', () => {
    // The retired key still validates, so only an explicit assertion catches it:
    // a config claiming to disable device auth on a version that ignores the claim.
    expect(cfg.gateway.controlUi.dangerouslyDisableDeviceAuth).toBeUndefined();
    expect(cfg.gateway.auth.trustedProxy.deviceAutoApprove).toEqual({
      enabled: true,
      scopes: [
        'operator.admin',
        'operator.read',
        'operator.write',
        'operator.talk',
        'operator.pairing',
        'operator.approvals',
        'operator.questions',
      ],
    });
  });

  test('OC-12 the scope set contains operator.admin, and that is the decision', () => {
    // Reversed on 2026-09-10, by measurement rather than by preference. This list
    // is a CAP on what an auto-approval may grant, and the Control UI requests
    // operator.admin: without it a freshly approved browser does not lose pages,
    // it cannot connect at all — "Role upgrade pending" — and the recovery the
    // interface names answers `unauthorized` from every container that could run
    // it. OC-38 is that measurement; §5.3 of the feature document carries the
    // reasoning it overturned. The price is a SECURITY WARNING from the gateway,
    // which OC-11 now requires to be present rather than absent: if it ever
    // disappears, somebody has taken the scope back out and the next fresh
    // browser is locked out.
    expect(cfg.gateway.auth.trustedProxy.deviceAutoApprove.scopes).toContain('operator.admin');
  });
});

describe('OC-2 the retired key really is refused', () => {
  test('OC-2 adding cliBackends back makes 2026.9.1 reject the config', () => {
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_CLAUDE_CLI: '1' });
    cfg.agents.defaults.cliBackends = { 'claude-cli': { command: '/usr/local/bin/openclaw-claude' } };
    const r = validate(cfg, IMAGE_NEW);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('Unrecognized key: "cliBackends"');
  });
});

describe('OC-1 the 2026.7 shape still works on 2026.7.1', () => {
  let cfg: any;
  beforeAll(() => { cfg = writeConfig({ OC_SCHEMA_NEW: '0', ENABLE_CLAUDE_CLI: '1' }); });

  test('it writes cliBackends pointing at the wrapper, and validates on 2026.7.1', () => {
    expect(cfg.agents.defaults.cliBackends['claude-cli'].command).toBe('/usr/local/bin/openclaw-claude');
    expect(validate(cfg, IMAGE_OLD).code).toBe(0);
  });

  test('it writes dangerouslyDisableDeviceAuth and not the 2026.9 replacement', () => {
    expect(cfg.gateway.controlUi.dangerouslyDisableDeviceAuth).toBe(true);
    expect(cfg.gateway.auth.trustedProxy.deviceAutoApprove).toBeUndefined();
  });

  test('and 2026.9.1 refuses that same document — the shapes are not interchangeable', () => {
    expect(validate(cfg, IMAGE_NEW).code).not.toBe(0);
  });
});

describe('OC-5/OC-6/OC-7 memory search, in both directions', () => {
  test('OC-5 with Copilot on 2026.9, the config carries memory.search and validates', () => {
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_COPILOT: '1' });
    expect(cfg.memory.search.provider).toBe('github-copilot');
    expect(cfg.memory.search.model).toBe('text-embedding-3-small');
    expect(cfg.agents?.defaults?.memorySearch).toBeUndefined();
    expect(validate(cfg, IMAGE_NEW).code).toBe(0);
  });

  test('OC-6 the old path is refused by 2026.9.1', () => {
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_COPILOT: '1' });
    delete cfg.memory;
    cfg.agents.defaults.memorySearch = { provider: 'github-copilot', model: 'text-embedding-3-small' };
    const r = validate(cfg, IMAGE_NEW);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('memorySearch');
  });

  test('OC-7 and the new path is refused by 2026.7.1 — so no single config serves both', () => {
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_COPILOT: '1' });
    expect(validate(cfg, IMAGE_OLD).code).not.toBe(0);
  });

  test('OC-5 with Copilot on 2026.7, the old path is written and validates there', () => {
    const cfg = writeConfig({ OC_SCHEMA_NEW: '0', ENABLE_COPILOT: '1' });
    expect(cfg.agents.defaults.memorySearch.provider).toBe('github-copilot');
    expect(cfg.memory?.search).toBeUndefined();
    expect(validate(cfg, IMAGE_OLD).code).toBe(0);
  });
});

describe('OC-31 a plugin the operator did not ask for does not stay enabled', () => {
  test('codex is removed from plugins.entries when ENABLE_OPENAI_CODEX is 0', () => {
    // 2026.9.1 enables the codex plugin during its own startup migration --
    // absent from a 2026.7.1 config, present after the first 2026.9.1 boot --
    // and then cannot load it: @openai/codex is bundled in the 2026.7.1 image
    // and gone from the 2026.9.1 one. The operator sees a permanent plugin error
    // for a feature they switched off.
    const dir = mkdtempSync(join(workRoot, 'codex-'));
    // The route is the part that matters, and it was missing from this fixture:
    // agents.defaults.models["openai/*"].agentRuntime.id === "codex" is what
    // makes the gateway re-enable the plugin on the next boot, and a config
    // holding only the entry could never show that. OC-39 is the assertion.
    writeFileSync(join(dir, 'openclaw.json'), JSON.stringify({
      plugins: { entries: { codex: { enabled: true }, xai: { enabled: true } } },
      agents: { defaults: { models: {
        'openai/*': { agentRuntime: { id: 'codex' } },
        'xai/*': { agentRuntime: { id: 'xai' } },
      } } },
    }));
    writeFileSync(join(dir, 'writer.js'), program);
    const r = sh([
      'docker', 'run', '--rm', '--user', '0:0', '-v', `${dir}:/state`,
      '-e', 'OC_SCHEMA_NEW=1', '-e', 'OPENCLAW_VERSION=test',
      '-e', 'ENABLE_CLAUDE_CLI=0', '-e', 'ENABLE_COPILOT=0', '-e', 'ENABLE_CODEX=0',
      '-e', 'ENABLE_GROK=0', '-e', 'ENABLE_LOCAL=0',
      '-e', 'LU_NETWORK_SUBNET=172.18.0.0/16', '-e', 'PLUGIN_PATHS=',
      '-e', 'MODEL_WILDCARDS=', '-e', 'OPENROUTER_MODELS_JSON=[]', '-e', 'LOCAL_LLM_MODELS_JSON=[]',
      '--entrypoint', 'node', IMAGE_NEW, '/state/writer.js',
    ]);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'openclaw.json'), 'utf8'));
    // OC-39. Deleting the entry does not stop the re-enable: the gateway runs
    // applyPluginAutoEnable on every boot and takes any harness named by an
    // agentRuntime route as a candidate, and the only skip in the built image is
    // an explicit `enabled === false`. So both halves are required — the route is
    // gone, and the decision is recorded where the auto-enable reads it.
    expect(cfg.agents?.defaults?.models?.['openai/*']).toBeUndefined();
    expect(cfg.agents?.defaults?.models?.['xai/*']).toBeUndefined();
    expect(cfg.plugins?.entries?.codex).toEqual({ enabled: false });
    expect(cfg.plugins?.entries?.xai).toEqual({ enabled: false });
  });

  test('OC-31 and it stays enabled when the operator did ask for it', () => {
    // The counterpart. A sweep that removes it unconditionally would break the
    // feature rather than fix the symptom.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', ENABLE_CODEX: '1' });
    expect(cfg.plugins.entries.codex.enabled).toBe(true);
  });
});

describe('the sweep: a key left by the other version does not survive', () => {
  test('a stale 2026.7 key is removed even when its feature is now off', () => {
    // The per-feature branches only clean up inside their own `if`. Turning
    // ENABLE_CLAUDE_CLI off after an earlier start wrote cliBackends would
    // otherwise leave the key behind and fail validation on the next start.
    const dir = mkdtempSync(join(workRoot, 'stale-'));
    writeFileSync(join(dir, 'openclaw.json'), JSON.stringify({
      agents: { defaults: { cliBackends: { 'claude-cli': { command: '/x' } }, memorySearch: { provider: 'x' } } },
      gateway: { controlUi: { dangerouslyDisableDeviceAuth: true } },
    }));
    writeFileSync(join(dir, 'writer.js'), program);
    const r = sh([
      'docker', 'run', '--rm', '--user', '0:0', '-v', `${dir}:/state`,
      '-e', 'OC_SCHEMA_NEW=1', '-e', 'OPENCLAW_VERSION=test',
      '-e', 'ENABLE_CLAUDE_CLI=0', '-e', 'ENABLE_COPILOT=0', '-e', 'ENABLE_CODEX=0',
      '-e', 'ENABLE_GROK=0', '-e', 'ENABLE_LOCAL=0',
      '-e', 'LU_NETWORK_SUBNET=172.18.0.0/16', '-e', 'PLUGIN_PATHS=',
      '-e', 'MODEL_WILDCARDS=', '-e', 'OPENROUTER_MODELS_JSON=[]', '-e', 'LOCAL_LLM_MODELS_JSON=[]',
      '--entrypoint', 'node', IMAGE_NEW, '/state/writer.js',
    ]);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'openclaw.json'), 'utf8'));
    expect(cfg.agents?.defaults?.cliBackends).toBeUndefined();
    expect(cfg.agents?.defaults?.memorySearch).toBeUndefined();
    expect(cfg.gateway.controlUi.dangerouslyDisableDeviceAuth).toBeUndefined();
    expect(validate(cfg, IMAGE_NEW).code).toBe(0);
  });
});
