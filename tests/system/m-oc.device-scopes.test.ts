/**
 * OC-10, OC-11, OC-22 — what the auto-approved device is allowed to do.
 *
 * Purpose: `gateway.auth.trustedProxy.deviceAutoApprove` approves a browser once
 * the reverse proxy has authenticated the user. This stack's nginx authenticates
 * nobody — it sets a constant `X-Forwarded-User` — so auto-approval admits
 * whoever reaches the proxy. That is the posture 2026.7.1 already had with the
 * device check disabled, so it is not a new exposure; the scopes are what is new,
 * and they decide how far an admitted device reaches.
 *
 * Given  the running 2026.9.1 stack configured by the start script
 * When   operator.admin is added to the scopes and the gateway restarted
 * Then   the gateway logs the security warning that guard exists for — and with
 *        the scopes the start script writes, it does not.
 *
 * Measured correction to the specification: OC-10 was written expecting
 * `openclaw doctor` to raise `gateway.trusted_proxy_device_auto_approve_admin`
 * at severity critical. It does not, in this configuration — the check exists in
 * the bundle but never surfaced across repeated runs. The gateway logs the
 * warning verbatim at startup, every time. Asserting the doctor finding would
 * have been a guard that never fires, which is worse than none.
 *
 * OC-10 is the negative and the important one: it keeps us honest. Without it we
 * would know only that our chosen scopes pass, not that the check would have
 * caught us granting too much. OC-10 restores the configuration afterwards
 * whatever the assertions do.
 *
 * OC-22 rides along because it asks the other half of "did the migration
 * succeed": an interface that is reachable but whose model has been degraded has
 * not succeeded. #11 recorded claude-cli/claude-opus-5 with a 1M context window
 * on 2026.7.1; the same must hold after.
 *
 * Test data: the scope set the start script writes, read from the live config
 * rather than retyped, plus the literal "operator.admin" for the negative — the
 * one scope the bundle's own warning names.
 *
 * Requirements covered: OC-G1, OC-G3, FEATURE-openclaw-2026-9-1.md §5.3.
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

function readConfig(): any {
  return JSON.parse(readFileSync(CONFIG, 'utf8'));
}

/**
 * Write the config, restart the gateway, and return the moment the restart began.
 *
 * The timestamp is the point of the exercise. The gateway log is a rolling
 * buffer, so a warning from an *earlier* case — or from someone probing by hand
 * ten minutes ago — is still in it, and a case that greps the whole buffer reads
 * a stale line as its own result. Everything asserted below is scoped to the
 * lines this restart produced.
 */
function writeConfig(cfg: any): string {
  const since = new Date(Date.now() - 1000).toISOString();
  Bun.write(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  compose(['restart', 'openclaw-gateway']);
  sh(['sh', '-c', 'for i in $(seq 1 60); do docker inspect openclaw-gateway --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy && break; sleep 1; done']);
  return since;
}

function doctor(): string {
  return compose(['exec', '-T', 'openclaw-gateway', 'openclaw', 'doctor']).output;
}

function gatewayLogSince(since: string): string {
  return compose(['logs', '--since', since, 'openclaw-gateway']).output;
}

const originalScopes: string[] =
  readConfig().gateway.auth.trustedProxy.deviceAutoApprove.scopes;

afterAll(() => {
  const cfg = readConfig();
  cfg.gateway.auth.trustedProxy.deviceAutoApprove.scopes = originalScopes;
  writeConfig(cfg);
});

describe('OC-11 the scopes we grant', () => {
  test('auto-approval is on, and operator.admin is not among the scopes', () => {
    const d = readConfig().gateway.auth.trustedProxy.deviceAutoApprove;
    expect(d.enabled).toBe(true);
    expect(d.scopes).not.toContain('operator.admin');
    expect(d.scopes.length).toBeGreaterThan(0);
  });

  test('OC-11 the gateway raises no admin warning with the scopes we write', () => {
    // The positive counterpart to OC-10. Restarted here so the log line, if it
    // were coming, would be recent rather than left over from another case.
    const since = writeConfig(readConfig());
    expect(gatewayLogSince(since)).not.toContain('deviceAutoApprove.scopes includes operator.admin');
  });

  test('OC-11 doctor reports no critical finding against the live configuration', () => {
    expect(doctor().toLowerCase()).not.toContain('critical');
  });

  test('OC-12 doctor reports no legacy config key', () => {
    // dangerouslyDisableDeviceAuth still validates on 2026.9.1, so the validator
    // is silent about it and only doctor notices. This is the case that would
    // catch the key surviving an upgrade.
    expect(doctor()).not.toContain('dangerouslyDisableDeviceAuth');
  });
});

describe('OC-10 the guard still bites', () => {
  test('adding operator.admin makes doctor raise the critical finding', () => {
    const cfg = readConfig();
    cfg.gateway.auth.trustedProxy.deviceAutoApprove.scopes = ['operator.admin'];
    const since = writeConfig(cfg);
    // The gateway, not doctor — see the header. Verbatim from the bundle.
    expect(gatewayLogSince(since)).toContain(
      'SECURITY WARNING: gateway.auth.trustedProxy.deviceAutoApprove.scopes includes operator.admin'
    );
  });
});

describe('OC-22 the model survives the move', () => {
  test('claude-cli/* is allowed by the model policy, not merely listed', () => {
    // Added 2026-09-06, after this case passed while the model was unusable.
    // 2026.9.1 introduced agents.defaults.modelPolicy.allow and built it once
    // from a map that never mentioned claude-cli, so /models listed all nine
    // claude-cli models and selecting one answered "model not allowed:
    // claude-cli/claude-opus-5". Being catalogued is not being usable, and only
    // this assertion tells the two apart.
    const allow = readConfig().agents?.defaults?.modelPolicy?.allow ?? [];
    expect(allow).toContain('claude-cli/*');
  });

  test('claude-cli/claude-opus-5 is offered with its 1M context window', () => {
    const cfg = readConfig();
    // models.providers["claude-cli"].models, not agents.defaults.models — the
    // latter only routes provider wildcards to a runtime and carries no context
    // window at all. The first version of this case asserted against it and
    // failed for that reason, not because anything had regressed.
    const cli = cfg.models?.providers?.['claude-cli']?.models ?? [];
    const opus5 = cli.find((m: any) => m.id === 'claude-opus-5');
    expect(opus5).toBeDefined();
    expect(opus5.contextWindow).toBe(1000000);
  });
});
