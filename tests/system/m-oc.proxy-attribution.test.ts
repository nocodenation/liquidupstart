/**
 * OC-13, OC-14 — proxy attribution on the running stack.
 *
 * Purpose: OpenClaw 2026.9.1 refuses proxy-shaped traffic it cannot attribute,
 * and refuses a `gateway.trustedProxies` list that is too wide even when the
 * peer falls inside it. #11 already narrowed that list to this stack's own docker
 * network and kept the change through the downgrade, so this migration changes
 * nothing here — which is exactly why it needs a regression case, and a negative
 * counterpart proving the narrowing is still load-bearing rather than historical.
 *
 * Given  the running stack with trustedProxies naming its own docker network
 * When   the Control UI is requested through the nginx proxy
 * Then   it answers 200 — and when the same request is made with the wide RFC1918
 *        list this repository carried until 2026-09-05, it answers 403
 *        proxy_attribution_required.
 *
 * OC-14 restores the configuration it changed, whatever the assertions do.
 *
 * Test data: the narrow list is read from the live config, so the case cannot
 * drift from what the start script writes. The wide list is the literal
 * ["127.0.0.1/32","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"] — stated here
 * because after #11 it exists nowhere else in the repository to be read from.
 *
 * Requirements covered: OC-G4, FEATURE-openclaw-2026-9-1.md §5.4.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { compose } from '../lib/stack';
import { stackGuard } from '../lib/guard';

stackGuard(['openclaw-gateway', 'proxy']);

const CONFIG = join(repoRoot, 'volumes/_openclaw/openclaw.json');
const WIDE = ['127.0.0.1/32', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

function httpPort(): string {
  const env = readFileSync(join(repoRoot, '.env'), 'utf8');
  const m = env.match(/^SYSTEM_HTTP_PORT=(.*)$/m);
  return (m ? m[1] : '8888').replace(/["']/g, '').trim();
}

function controlUi(): { code: number; status: string; body: string } {
  const r = sh([
    'curl', '-s', '-o', '/dev/stdout', '-w', '\\n%{http_code}',
    '-H', `Host: openclaw.localhost`, `http://127.0.0.1:${httpPort()}/`,
  ]);
  const lines = r.output.trimEnd().split('\n');
  return { code: r.code, status: lines[lines.length - 1], body: lines.slice(0, -1).join('\n') };
}

function setTrustedProxies(list: string[]): void {
  const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
  cfg.gateway.trustedProxies = list;
  Bun.write(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  compose(['restart', 'openclaw-gateway']);
  // The gateway needs a moment to listen again before a request means anything.
  sh(['sh', '-c', 'for i in $(seq 1 60); do docker inspect openclaw-gateway --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy && break; sleep 1; done']);
}

const original: string[] = JSON.parse(readFileSync(CONFIG, 'utf8')).gateway.trustedProxies;

afterAll(() => {
  // Restore whatever the start script wrote, pass or fail.
  setTrustedProxies(original);
});

describe('OC-13/OC-14 proxy attribution', () => {
  test('OC-13 the narrow list the start script writes: the Control UI answers 200', () => {
    // Read, not retyped: this asserts what the stack actually configured.
    expect(original[0]).toBe('127.0.0.1/32');
    expect(original.length).toBe(2);
    expect(original[1]).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
    expect(controlUi().status).toBe('200');
  });

  test('OC-14 the wide list this repository carried until #11: 403 proxy_attribution_required', () => {
    setTrustedProxies(WIDE);
    const r = controlUi();
    expect(r.status).toBe('403');
    expect(r.body).toContain('proxy_attribution_required');
  });

  test('OC-14 and the gateway says why, in its log', () => {
    // Still on the wide list from the previous case.
    const logs = compose(['logs', '--tail', '200', 'openclaw-gateway']);
    expect(logs.output).toContain('unattributable proxy-shaped traffic');
  });
});
