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
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import {
  IMAGE_NEW,
  IMAGE_OLD,
  configWriter,
  dropWorkRoot,
  newWorkRoot,
  validate as validateWith,
  writeConfig as runWriter,
  type Env
} from '../lib/openclaw-writer';

let program: string;
let workRoot: string;

beforeAll(() => {
  program = configWriter();
  workRoot = newWorkRoot('lu-oc-');
});

afterAll(() => dropWorkRoot(workRoot));

// The subnet this suite was written against, before the default moved to
// 10.99.0.0/24 -- its cases are about the shape, not the range.
//
// `LU_PROXY_IDENTITY` is the identity nginx asserts, and it belongs here rather
// than in the shared `BASE_ENV`: it is this file's subject, and `m-m1` has no use
// for it. It was never passed at all once, and the grant then landed under the
// literal key `"undefined"` while the assertion -- which read
// `Object.values(...)[0]` -- found it anyway, so a grant to nobody read as a
// grant. Minor of the 2026-09-29 review. The merge of 2026-10-20 dropped it a
// second time, because this file's own env map went to the shared helper and the
// shared map does not carry it: `OC-75` and `OC-57` went red with
// `undefined is not an object`, which is the same defect saying so loudly
// instead of passing. One case overrides it with `''` on purpose.
const OC_ENV: Env = {
  LU_NETWORK_SUBNET: '172.18.0.0/16',
  LU_PROXY_IDENTITY: 'user@nocodenation.org'
};

function writeConfig(env: Env): any {
  return runWriter({ workRoot, program, env: { ...OC_ENV, ...env } });
}

function validate(config: any, image: string): { code: number; output: string } {
  return validateWith({ workRoot, config, image });
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
        'operator.read',
        'operator.write',
        'operator.talk',
        'operator.pairing',
        'operator.approvals',
        'operator.questions',
      ],
    });
  });

  test('OC-75 admin is not in the cap, and is granted per identity instead', () => {
    // **Renumbered from OC-46 on 2026-10-14.** B6 of the 2026-10-01 review: the
    // overview carries `OC-46` as a *manual system* case -- the fresh browser
    // connecting in a private window on 2026-09-19 -- and this automated case
    // carried the same id, so a report showed a pass under `OC-46` for a run in
    // which no browser connected at all. Same precedent as `OC-40`/`OC-42`
    // becoming `OC-63`/`OC-64`: the later case moves. The manual run keeps the id
    // it was signed off under, and what this one reads about the written config
    // is `OC-75`.
    //
    // Reversed twice, and this is the reversal that has both halves measured.
    //
    // 2026-09-10 put operator.admin IN the cap, because without it a fresh
    // browser could not connect and "no documented recovery worked". OC-38
    // measured the first half correctly and the second half wrongly: the
    // recovery does work, through nginx, which is R1. With that reason gone,
    // what was left was the gateway telling us at every start to grant admin per
    // identity instead — advice logged since 2026-09-10 and read by nobody.
    //
    // 2026-09-19 measured the replacement in a private window, end to end: the
    // device was auto-approved with five scopes and no admin, the connection was
    // elevated by the identity grant, and the Control UI connected on the first
    // try with its admin-gated pages working. Twelve milliseconds, no approval.
    //
    // Both assertions together are the decision. The cap alone would be
    // satisfied by granting nothing anywhere, which locks every browser out.
    const d = cfg.gateway.auth.trustedProxy.deviceAutoApprove;
    expect(d.scopes).not.toContain('operator.admin');
    // By key, not by position: Object.values(...)[0] passed over a grant written
    // under the key "undefined".
    const identity = cfg.gateway.auth.identityScopes;
    expect(Object.keys(identity)).toEqual(['user@nocodenation.org']);
    expect(identity['user@nocodenation.org']).toContain('operator.admin');
    // And the cap still admits a browser at all: the scopes it does carry are
    // what the device receives, so an empty cap is not the same decision.
    expect(d.enabled).toBe(true);
    expect(d.scopes.length).toBeGreaterThan(0);
  });

  test('OC-56 nothing is granted when no identity is named', () => {
    // The grant used to be written unconditionally, so without LU_PROXY_IDENTITY
    // it landed under the literal key "undefined" -- a grant to nobody that reads
    // as a grant, and one no reader of the file would question. Minor of the
    // 2026-09-29 review.
    const cfg = writeConfig({ OC_SCHEMA_NEW: '1', LU_PROXY_IDENTITY: '' });
    const identity = cfg.gateway.auth.identityScopes ?? {};
    expect(Object.keys(identity)).not.toContain('undefined');
    expect(Object.keys(identity)).toEqual([]);
  });

  test('OC-57 and an identity the operator granted by hand survives a start', () => {
    // The rest of this writer preserves what the operator edited; this line
    // replaced the whole map, so a grant they had added was lost on the next
    // start with nothing said. Minor of the 2026-09-29 review.
    //
    // Seeded through the shared helper's `seed`, which is what this case wrote
    // its own `writeConfigIn` for before that option existed on `main`. The
    // merge of 2026-10-20 took the shared shape: two readers of one state
    // directory is how they come to disagree about what is in it.
    const cfg = runWriter({
      workRoot,
      program,
      env: { ...OC_ENV, OC_SCHEMA_NEW: '1' },
      seed: { gateway: { auth: { identityScopes: { 'ops@example.invalid': ['operator.read'] } } } }
    });
    const identity = cfg.gateway.auth.identityScopes;
    expect(identity['ops@example.invalid']).toEqual(['operator.read']);
    expect(identity['user@nocodenation.org']).toContain('operator.admin');
  });

  test('N10 and the rationale in the writer does not contradict it', () => {
    // The paragraph above the block once kept the pre-measurement reasoning --
    // admin "is excluded" -- while the code three lines down granted it. A
    // reader or a security review takes the prose at face value; the code is
    // what runs. The direction has flipped since, so the assertion flips with
    // it: the code now excludes admin from the cap, and the prose must not claim
    // it is granted there.
    const script = readFileSync(join(repoRoot, 'config/scripts/start/openclaw.sh'), 'utf8');
    const claimsGranted = /so operator\.admin is in|admin is in the cap|granting it restores/i.test(script);
    expect({ excluded: true, claimsGranted }).toEqual({ excluded: true, claimsGranted: false });
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
    // N2 corrected this on 2026-09-11. The first version deleted the whole
    // wildcard entry, and openai/* is also written by the plain OPENAI_API_KEY
    // route — so an API-key user with codex off lost their models on every start
    // while modelPolicy.allow still listed openai/*. Only the route goes.
    expect(cfg.agents?.defaults?.models?.['openai/*']).toEqual({});
    expect(cfg.agents?.defaults?.models?.['xai/*']).toEqual({});
    expect(cfg.plugins?.entries?.codex).toEqual({ enabled: false });
    expect(cfg.plugins?.entries?.xai).toEqual({ enabled: false });
  });

  test('N2 a wildcard that is not a codex route is left alone', () => {
    // The counterpart. A cleanup that removes the wildcard whenever codex is off
    // passes the case above and takes the API-key route with it.
    const dir = mkdtempSync(join(workRoot, 'apikey-'));
    writeFileSync(join(dir, 'openclaw.json'), JSON.stringify({
      plugins: { entries: { xai: { enabled: true } } },
      agents: { defaults: { models: { 'openai/*': { some: 'setting' } } } },
    }));
    writeFileSync(join(dir, 'writer.js'), program);
    const r = sh([
      'docker', 'run', '--rm', '--init', '--user', '0:0', '-v', `${dir}:/state`,
      '-e', 'OC_SCHEMA_NEW=1', '-e', 'OPENCLAW_VERSION=test',
      '-e', 'ENABLE_CLAUDE_CLI=0', '-e', 'ENABLE_COPILOT=0', '-e', 'ENABLE_CODEX=0',
      '-e', 'ENABLE_GROK=0', '-e', 'ENABLE_LOCAL=0',
      '-e', 'LU_NETWORK_SUBNET=172.18.0.0/16', '-e', 'PLUGIN_PATHS=',
      '-e', 'MODEL_WILDCARDS=openai/*', '-e', 'OPENROUTER_MODELS_JSON=[]',
      '-e', 'LOCAL_LLM_MODELS_JSON=[]',
      '--entrypoint', 'node', IMAGE_NEW, '/state/writer.js',
    ]);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'openclaw.json'), 'utf8'));
    expect(cfg.agents.defaults.models['openai/*']).toEqual({ some: 'setting' });
  });

  test('N2 plugins.entries is created rather than required', () => {
    // With the map absent both halves used to be skipped, so the route stayed
    // behind for applyPluginAutoEnable to find — the very hole the fix describes.
    const dir = mkdtempSync(join(workRoot, 'noentries-'));
    writeFileSync(join(dir, 'openclaw.json'), JSON.stringify({
      agents: { defaults: { models: { 'openai/*': { agentRuntime: { id: 'codex' } } } } },
    }));
    writeFileSync(join(dir, 'writer.js'), program);
    const r = sh([
      'docker', 'run', '--rm', '--init', '--user', '0:0', '-v', `${dir}:/state`,
      '-e', 'OC_SCHEMA_NEW=1', '-e', 'OPENCLAW_VERSION=test',
      '-e', 'ENABLE_CLAUDE_CLI=0', '-e', 'ENABLE_COPILOT=0', '-e', 'ENABLE_CODEX=0',
      '-e', 'ENABLE_GROK=0', '-e', 'ENABLE_LOCAL=0',
      '-e', 'LU_NETWORK_SUBNET=172.18.0.0/16', '-e', 'PLUGIN_PATHS=',
      '-e', 'MODEL_WILDCARDS=', '-e', 'OPENROUTER_MODELS_JSON=[]',
      '-e', 'LOCAL_LLM_MODELS_JSON=[]',
      '--entrypoint', 'node', IMAGE_NEW, '/state/writer.js',
    ]);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'openclaw.json'), 'utf8'));
    expect(cfg.plugins.entries.codex).toEqual({ enabled: false });
    expect(cfg.agents.defaults.models['openai/*'].agentRuntime).toBeUndefined();
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
