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
 *
 *           A0-9 and A0-10 were added for F1 of the 2026-10-16 review, which
 *           found two faults in the value's handling rather than in the binding.
 *           `SYSTEM_BIND_ADDRESS=localhost` is the value an operator reaches for
 *           first; compose refuses it — `invalid IP address: localhost` — and it
 *           did so at `up`, after `down.sh` had already emptied the stack, while
 *           the start had just reported "this machine only". And `::1` was
 *           reported as "Reachable from: your network", which is the opposite of
 *           what it is. Both decisions now live in
 *           `config/scripts/start/lib/bind-address.sh`, because neither could be
 *           measured while it sat inline in a script that stops the stack — which
 *           is why the wrong one stayed wrong.
 * Covers:   A0-7, A0-8, A0-9, A0-10
 * Unhappy:  A0-8 is the counterpart, and it is the half that keeps this honest: a
 *           default nobody can change is not a default, and a switch nobody
 *           checked is a line that only looks like one. The README is asserted
 *           too — a reworded promise with the old behaviour, or the reverse, is
 *           the defect this case exists for and neither half catches it alone.
 *
 *           A0-9's and A0-10's counterparts carry the same weight. A guard that
 *           refused every address would pass the `localhost` scenario perfectly,
 *           so the four forms compose does accept are asserted beside it; and a
 *           classifier that called everything loopback would keep the promise
 *           silent, so `0.0.0.0` and a LAN address are asserted to be reported as
 *           the network.
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
    // F2 of the 2026-10-16 review: the cost list named OpenCode and the Swagger
    // UI, and left out the gateway -- whose node bridge is the reason given for
    // opening the port, and which trusts the identity nginx asserts for whoever
    // arrives. The most expensive item was the missing one.
    expect(env).toMatch(/OpenClaw gateway with admin rights/);
  });
});

// The helper is sourced rather than start.sh run: a start stops the stack, which
// is why neither of these decisions had ever been measured.
function bindHelper(fn: string, arg: string) {
  return sh(['bash', '-c', `. "${LIB}"; ${fn} "${arg}"`], repoRoot);
}

const LIB = join(repoRoot, 'config/scripts/start/lib/bind-address.sh');

describe('A0-9 the value is judged by compose before anything is stopped', () => {
  test('A0-9 the negative: compose refuses `localhost`, and says so in those words', () => {
    // The value that reads as correct and is not. Before F1 the start called it
    // "this machine only" and then `up` failed -- after down.sh had emptied the
    // stack, so the operator was left with nothing running.
    const r = sh(['bash', '-c', `. "${LIB}"; lu_bind_invalid_address "${repoRoot}"`], repoRoot, {
      SYSTEM_BIND_ADDRESS: 'localhost'
    });
    expect(r.stdout).toMatch(/invalid IP address: localhost/);
  });

  test.each(['127.0.0.1', '127.0.0.2', '::1', '[::1]', '0.0.0.0'])(
    'A0-9 the counterpart: %s is accepted, so the guard refuses one value and not a class',
    (address) => {
      const r = sh(['bash', '-c', `. "${LIB}"; lu_bind_invalid_address "${repoRoot}"`], repoRoot, {
        SYSTEM_BIND_ADDRESS: address
      });
      expect(r.stdout.trim(), `${address} was refused`).toBe('');
    }
  );
});

describe('A0-10 and the line the operator reads names the right side', () => {
  test.each(['', '127.0.0.1', '127.0.0.2', '::1', '[::1]'])(
    'A0-10 %s is reported as this machine only',
    (address) => {
      expect(bindHelper('lu_bind_is_loopback', address).code, `${address} not loopback`).toBe(0);
    }
  );

  test.each(['0.0.0.0', '192.168.1.5', '10.99.0.2'])(
    'A0-10 the counterpart: %s is reported as the network',
    (address) => {
      expect(bindHelper('lu_bind_is_loopback', address).code, `${address} called loopback`).toBe(1);
    }
  );

  test('A0-10 and `localhost` is not called loopback, because it cannot have started', () => {
    // It is not a literal address and compose refuses it, so the honest answer is
    // "not this machine only" rather than a promise about a stack that is not up.
    expect(bindHelper('lu_bind_is_loopback', 'localhost').code).toBe(1);
  });

  test('A0-10 and the warning names the gateway, not only the passwordless services', () => {
    const start = readFileSync(join(repoRoot, 'scripts/linux/start.sh'), 'utf8');
    expect(start).toMatch(/OpenClaw gateway with admin rights/);
  });
});
