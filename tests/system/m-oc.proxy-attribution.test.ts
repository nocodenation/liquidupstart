/**
 * OC-13, OC-14 — proxy attribution on the running stack.
 *
 * Purpose: OpenClaw 2026.9.1 refuses proxy-shaped traffic it cannot attribute.
 * `resolveForwardedClientIp` walks `X-Forwarded-For` right to left and discards
 * every hop that is loopback or listed in `gateway.trustedProxies`; whatever is
 * left is the client, and if nothing is left the answer is 403.
 *
 * **These cases asserted the wrong rule until 2026-09-16.** They were written
 * around *width* — a wide list refused, a narrow one accepted — and both
 * observations were real. The rule behind them is not width but **membership**:
 * the list must not contain the client. On Docker Desktop a request from the host
 * arrives as 192.168.65.1, which is inside the old wide list (192.168.0.0/16) and
 * outside the stack's own subnet, so narrowing the list happened to fix it. Same
 * mechanism, opposite coincidence.
 *
 * What the old shape could not see, measured here on 2026-09-16 with
 * trustedProxies naming the whole subnet:
 *
 *   from the host            192.168.65.1  outside the list  -> 200
 *   from a stack container   10.99.0.11    inside the list   -> 403
 *
 * Every agent in this stack that reaches the gateway through the proxy is the
 * second case. On rootless docker with the builtin port driver the host itself
 * arrives as 10.99.0.1 and a browser gets the same 403 — which is how the defect
 * was found, on a host this repository had never run on.
 *
 * Given  the running stack, and two clients: one inside the stack network and
 *        one on the host
 * When   the Control UI is requested through nginx by each
 * Then   both are attributed and answer 200, because trustedProxies names the
 *        proxy's own address and nothing else
 * And    putting the client's own range back into the list answers 403, which is
 *        what makes the address a decision rather than a decoration
 *
 * OC-14 restores the configuration it changed, whatever the assertions do.
 *
 * Requirements covered: OC-G4, FEATURE-openclaw-2026-9-1.md §5.4.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { compose } from '../lib/stack';
import { stackGuard } from '../lib/guard';

stackGuard(['openclaw-gateway', 'proxy', 'opencode']);

const CONFIG = join(repoRoot, 'volumes/_openclaw/openclaw.json');

function envValue(key: string, fallback: string): string {
  const env = readFileSync(join(repoRoot, '.env'), 'utf8');
  const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return (m ? m[1] : fallback).replace(/["']/g, '').trim();
}

const PORT = envValue('SYSTEM_HTTP_PORT', '8888');
const SUBNET = envValue('SYSTEM_NETWORK_SUBNET', '10.99.0.0/24');
const PROXY_IP = envValue('SYSTEM_PROXY_IP', '10.99.0.2');

/** From the host: on Docker Desktop this client is outside the stack subnet. */
function fromHost(): { status: string; body: string } {
  const r = sh([
    'curl', '-s', '-o', '/dev/stdout', '-w', '\\n%{http_code}',
    '-H', 'Host: openclaw.localhost', `http://127.0.0.1:${PORT}/`
  ]);
  const lines = r.output.trimEnd().split('\n');
  return { status: lines[lines.length - 1], body: lines.slice(0, -1).join('\n') };
}

/** From a container on the stack network: this client is always inside it. */
function fromInside(): { status: string; body: string } {
  const r = compose([
    'exec', '-T', 'opencode', 'curl', '-s', '-o', '/dev/stdout', '-w', '\\n%{http_code}',
    '-H', 'Host: openclaw.localhost', `http://proxy:${PORT}/`
  ]);
  const lines = r.output.trimEnd().split('\n');
  return { status: lines[lines.length - 1], body: lines.slice(0, -1).join('\n') };
}

function setTrustedProxies(list: string[]): void {
  const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
  cfg.gateway.trustedProxies = list;
  // Synchronous: Bun.write returns a promise, and the restart below blocks the
  // JS thread without draining it, so the gateway could boot on the old config.
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  compose(['restart', 'openclaw-gateway']);
  sh(['sh', '-c', 'for i in $(seq 1 60); do docker inspect openclaw-gateway --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy && break; sleep 1; done']);
}

const original: string[] = JSON.parse(readFileSync(CONFIG, 'utf8')).gateway.trustedProxies;

afterAll(() => {
  setTrustedProxies(original);
});

describe('OC-13 the list names the proxy, and both kinds of client are attributed', () => {
  test('OC-13 what the start script wrote is loopback plus the proxy address, as a /32', () => {
    // Read from the live config, not retyped: this asserts what the stack
    // configured. A /32 and not a range, because a trusted hop is discarded --
    // anything the gateway trusts can never be the client.
    expect(original).toEqual(['127.0.0.1/32', `${PROXY_IP}/32`]);
  });

  test('OC-13 a client inside the stack network is attributed', () => {
    // The case the old shape could not express. This client's address is inside
    // SUBNET and outside the trusted /32, so it survives the walk and the request
    // is attributed. Measured at 403 on 2026-09-16 while the whole subnet was
    // trusted, which is every container in this stack talking to the gateway.
    expect(fromInside().status).toBe('200');
  });

  test('OC-13 and so is a client on the host', () => {
    expect(fromHost().status).toBe('200');
  });
});

describe('OC-14 a client the list contains cannot be attributed', () => {
  test('OC-14 trusting the whole subnet answers 403 to the client inside it', () => {
    // Exactly the configuration this repository wrote until 2026-09-16, and the
    // reason it looked correct: on this host the *host* client sits outside the
    // subnet and still answered 200. The client inside does not.
    setTrustedProxies(['127.0.0.1/32', SUBNET]);
    const r = fromInside();
    expect(r.status).toBe('403');
    expect(r.body).toContain('proxy_attribution_required');
  });

  test('OC-14 and the gateway says why, in its log', () => {
    const logs = compose(['logs', '--tail', '200', 'openclaw-gateway']);
    expect(logs.output).toContain('unattributable proxy-shaped traffic');
  });
});
