/**
 * OC-31 — a plugin the operator switched off must not error at them.
 *
 * Purpose: 2026.9.1 writes `plugins.entries.codex.enabled = true` into the
 * configuration during its own startup migration — the key is absent from a
 * 2026.7.1 config and present after the first 2026.9.1 boot, and this stack's
 * start script only writes it when ENABLE_OPENAI_CODEX=1, which is 0 here. It
 * then cannot load the plugin: `@openai/codex` is bundled in the 2026.7.1 image
 * and gone from the 2026.9.1 one. The operator gets a permanent error badge in
 * the Control UI for a feature they never asked for.
 *
 * Given  a running 2026.9.1 stack with ENABLE_OPENAI_CODEX unset
 * When   `plugins.entries.codex` is present, and again when it is not
 * Then   doctor reports the plugin load error in the first case and nothing in
 *        the second — which is what shows the removal is the fix, rather than
 *        the error having gone away for some other reason.
 *
 * This is the A/B the component case cannot do. `m-oc.config-shape.test.ts`
 * proves the start script removes the key; only a running gateway proves that
 * removing it is what silences the error.
 *
 * Test data: `{"plugins":{"entries":{"codex":{"enabled":true}}}}` merged into the
 * live config — the exact shape 2026.9.1 wrote by itself, observed rather than
 * invented. The assertion string is the plugin loader's own: `ERROR codex:`.
 *
 * The case restores the configuration it changed, pass or fail.
 *
 * Requirements covered: OC-G1, OC-G4.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { compose } from '../lib/stack';
import { stackGuard } from '../lib/guard';

stackGuard(['openclaw-gateway']);

const CONFIG = join(repoRoot, 'volumes/_openclaw/openclaw.json');
const original = readFileSync(CONFIG, 'utf8');

function restartWith(cfg: any): void {
  Bun.write(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  compose(['restart', 'openclaw-gateway']);
  sh(['sh', '-c', 'for i in $(seq 1 60); do docker inspect openclaw-gateway --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy && break; sleep 1; done']);
}

function doctorPluginErrors(): string {
  const out = compose(['exec', '-T', 'openclaw-gateway', 'openclaw', 'doctor']).output;
  return out.replace(/\x1b\[[0-9;]*m/g, '');
}

afterAll(() => {
  Bun.write(CONFIG, original);
  compose(['restart', 'openclaw-gateway']);
  sh(['sh', '-c', 'for i in $(seq 1 60); do docker inspect openclaw-gateway --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy && break; sleep 1; done']);
});

describe('OC-31 the codex plugin error', () => {
  test('with the key 2026.9.1 writes by itself, doctor reports the load error', () => {
    const cfg = JSON.parse(original);
    cfg.plugins = cfg.plugins || {};
    cfg.plugins.entries = cfg.plugins.entries || {};
    cfg.plugins.entries.codex = { enabled: true };
    restartWith(cfg);
    expect(doctorPluginErrors()).toContain('ERROR codex:');
  });

  test('and with the key removed, as the start script now does, it reports none', () => {
    const cfg = JSON.parse(original);
    if (cfg.plugins?.entries) delete cfg.plugins.entries.codex;
    restartWith(cfg);
    expect(doctorPluginErrors()).not.toContain('ERROR codex:');
  });
});
