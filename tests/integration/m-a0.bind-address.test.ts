/**
 * M-A0 · Integration · The stack is published where the README says it is
 *
 * Purpose:  `README.md` has said since 2026-07-17, under "Sandbox by design",
 *           that *"All services bind to `localhost` … without exposing anything
 *           to your network"*, and `compose.yml` published the proxy's two ports
 *           on every interface from that same commit until 2026-10-02. A
 *           security claim in the words a reader uses to decide whether to run
 *           agent tools in the stack, false for two and a half months, and
 *           nothing noticed — not three reviews, not a 560-case suite, and not
 *           the two of us until the operator asked where the requirement had
 *           come from.
 *
 *           That is what this case is for. Not the binding, which is one string
 *           in one file: the **pair**. A promise in prose and a default in a
 *           configuration cannot be kept together by anybody remembering.
 * Given:    `docker compose config` resolved twice from this checkout, which is
 *           what compose will actually use — not the file read as text, because a
 *           variable with a default is exactly where reading the text goes wrong.
 *           Once with no `SYSTEM_BIND_ADDRESS` in the environment, which is every
 *           installation that predates the key, and once with `0.0.0.0`.
 * When:     The `proxy` service's published ports are read out of each.
 * Then:     Loopback by default on both ports, `0.0.0.0` when it is asked for,
 *           and no service other than `proxy` publishing anything.
 * Covers:   A0-7, A0-8, NFR3
 * Unhappy:  A0-8 is the counterpart, and it is the half that keeps this honest: a
 *           default nobody can change is not a default, and a switch nobody
 *           checked is a line that only looks like one. The README is asserted
 *           too — a reworded promise with the old behaviour, or the reverse, is
 *           the defect this case exists for and neither half catches it alone.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const LOOPBACK = '127.0.0.1';

// `docker compose config` resolves the variables, so this is the published
// address compose will use rather than the one the file appears to name.
function publishedPorts(env: Record<string, string>): string[] {
  const r = sh(['docker', 'compose', 'config', '--format', 'json'], repoRoot, env);
  if (r.code !== 0) throw new Error(`docker compose config failed: ${r.output}`);
  const cfg = JSON.parse(r.stdout) as {
    services: Record<string, { ports?: { published?: string | number; host_ip?: string }[] }>;
  };
  const lines: string[] = [];
  for (const [name, svc] of Object.entries(cfg.services)) {
    for (const p of svc.ports ?? []) {
      lines.push(`${name} ${p.host_ip ?? '0.0.0.0'}:${p.published ?? '?'}`);
    }
  }
  return lines.sort();
}

describe('A0-7 by default the stack is reachable from this machine only', () => {
  test('A0-7 both proxy ports are bound to loopback with no key set', () => {
    // No SYSTEM_BIND_ADDRESS is the state of every installation that predates the
    // key, so the default is what they get on their next start.
    const ports = publishedPorts({ SYSTEM_BIND_ADDRESS: '' });
    expect(ports.length).toBeGreaterThan(0);
    for (const line of ports) expect(line).toContain(`${LOOPBACK}:`);
  });

  test('A0-7 and only the proxy publishes anything', () => {
    // A second service publishing a port would be an exposure this case would
    // otherwise pass straight over.
    const ports = publishedPorts({ SYSTEM_BIND_ADDRESS: '' });
    for (const line of ports) expect(line.split(' ')[0]).toBe('proxy');
  });

  test('A0-7 and the README says it is a default rather than a fact', () => {
    // The pair is the point. The prose promised what the configuration did not do
    // for two and a half months; asserting one without the other would leave the
    // same gap on the other side.
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(readme).toContain('bind to `localhost` by default');
    expect(readme).toContain('SYSTEM_BIND_ADDRESS');
  });
});

describe('A0-8 while an operator who needs the network can have it', () => {
  test('A0-8 the counterpart: 0.0.0.0 really opens both ports', () => {
    // The OpenClaw node bridge takes a connection from a remote node, and the
    // Teams endpoint is called from outside. A default nobody can change is not a
    // default, and a switch nobody checked is a line that only looks like one.
    const ports = publishedPorts({ SYSTEM_BIND_ADDRESS: '0.0.0.0' });
    expect(ports.length).toBeGreaterThan(0);
    for (const line of ports) expect(line).toContain('0.0.0.0:');
  });

  test('A0-8 and .env.example says what that costs', () => {
    const env = readFileSync(join(repoRoot, '.env.example'), 'utf8');
    expect(env).toContain('SYSTEM_BIND_ADDRESS=127.0.0.1');
    expect(env).toMatch(/no password/);
  });
});
