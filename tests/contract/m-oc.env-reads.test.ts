/**
 * N9 — the two start scripts read .env the same way, and a missing key does not
 * end the start.
 *
 * Purpose: `start.sh` and `config/scripts/start/openclaw.sh` now derive the same
 * docker network name from `SYSTEM_HTTP_PORT`, so they have to agree on what
 * that value is. They did not: `openclaw.sh` stripped both quote kinds,
 * `start.sh` only double ones, and compose's dotenv parser accepts either. A
 * hand-written `SYSTEM_HTTP_PORT='8080'` made start.sh create and label
 * `..._'8080'` while openclaw.sh inspected `..._8080`, which did not exist —
 * so the wide RFC1918 fallback was written and the quoted stray survived every
 * down with its compose labels.
 *
 * And a second failure, introduced on 2026-09-11 while pinning the subnet and
 * caught by starting the stack: `V="$(grep -E '^KEY=' "$ENV_FILE" | ...)"` under
 * `set -euo pipefail` ends the script when the key is absent, because grep exits
 * 1 and pipefail passes it through. Every .env written before a new key exists —
 * that is, every existing installation — hit it, silently, after down.sh had
 * already emptied the stack. It is the same shape as the state-probe abort this
 * branch fixed one commit earlier.
 *
 * Given  the two start scripts as text, and their get_env helpers
 * When   every .env read is examined, and the helper is run
 * Then   each read goes through get_env, and get_env strips both quote kinds and
 *        returns empty for a key that is not there
 *
 * Requirements covered: OC-G3, N9 of the #11 second review.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPTS = ['scripts/linux/start.sh', 'config/scripts/start/openclaw.sh'];

describe('N9 both start scripts read .env through one tolerant helper', () => {
  test('each defines get_env', () => {
    for (const f of SCRIPTS) {
      const body = readFileSync(join(repoRoot, f), 'utf8');
      expect({ file: f, has: /^get_env\(\) \{|^  get_env\(\) \{/m.test(body) }).toEqual({
        file: f,
        has: true
      });
    }
  });

  test('and no raw grep reads .env beside it', () => {
    const offenders: string[] = [];
    for (const f of SCRIPTS) {
      readFileSync(join(repoRoot, f), 'utf8')
        .split('\n')
        .forEach((text, i) => {
          if (/^\s*(#|\/\/|\*)/.test(text)) return;
          if (/=\s*"\$\(grep -E ['"]\^[A-Z_]+=/.test(text)) offenders.push(`${f}:${i + 1}  ${text.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  test('get_env strips both quote kinds and tolerates a missing key', () => {
    // Run the helper as each script actually holds it, rather than a copy: a test
    // carrying its own copy stops testing the thing the moment the two drift.
    const dir = mkdtempSync(join(tmpdir(), 'lu-env-'));
    const env = join(dir, '.env');
    writeFileSync(env, "SYSTEM_HTTP_PORT='8080'\nLIQUID_USERNAME=\"liquid\"\nBARE=9000\n");
    for (const f of SCRIPTS) {
      const probe = join(dir, 'probe.sh');
      const body = readFileSync(join(repoRoot, f), 'utf8');
      const start = body.split('\n').findIndex((l) => /^\s*get_env\(\) \{/.test(l));
      const end = body.split('\n').findIndex((l, i) => i > start && /^\s*\}/.test(l));
      const helper = body.split('\n').slice(start, end + 1).join('\n');
      writeFileSync(
        probe,
        `set -euo pipefail\nENV_FILE=${env}\nCONFIG_JSON=${env}\n${helper}\n` +
          `echo "[$(get_env SYSTEM_HTTP_PORT)][$(get_env LIQUID_USERNAME)]` +
          `[$(get_env BARE)][$(get_env ABSENT)]reached"\n`
      );
      const r = sh(['bash', probe]);
      expect({ file: f, out: r.output.trim() }).toEqual({
        file: f,
        out: '[8080][liquid][9000][]reached'
      });
    }
  });
});

/**
 * R1/OC-41 — one default range, written in four places.
 *
 * The value lives in `.env.example` (what an installation gets), `compose.yml`'s
 * ipam fallback (what creates the network), and both start scripts (what they
 * assume when the key is absent). Three of them disagreeing is invisible until a
 * gateway trusts a range no container is in, which is N3 in a new costume.
 */
describe('R1 the default subnet is one value', () => {
  test('.env.example, compose.yml and both start scripts agree on it', () => {
    const read = (f: string) => readFileSync(join(repoRoot, f), 'utf8');
    const found = {
      env: read('.env.example').match(/^SYSTEM_NETWORK_SUBNET=(\S+)/m)?.[1],
      compose: read('compose.yml').match(/subnet:\s*\$\{SYSTEM_NETWORK_SUBNET:-([^}]+)\}/)?.[1],
      start: read('scripts/linux/start.sh').match(/LU_SUBNET_CIDR:-([^}]+)\}/)?.[1],
      openclaw: read('config/scripts/start/openclaw.sh').match(/LU_NETWORK_SUBNET:-([^}]+)\}/)?.[1]
    };
    const distinct = [...new Set(Object.values(found))];
    expect({ distinct, found }).toEqual({ distinct: [distinct[0]], found });
    expect(distinct[0]).toBeTruthy();
  });

  test('and it is outside the ranges docker hands out by itself', () => {
    // Docker's default pools are 172.17-172.31 as /16s and 192.168.0.0/16 as
    // /20s. A default inside them collides with whatever docker allocated first
    // — which is exactly how main's leftover network broke this branch's start.
    const value = readFileSync(join(repoRoot, '.env.example'), 'utf8').match(
      /^SYSTEM_NETWORK_SUBNET=(\S+)/m
    )?.[1];
    expect(value).toBeTruthy();
    const octets = (value as string).split('/')[0].split('.').map(Number);
    const inDockerPool =
      (octets[0] === 172 && octets[1] >= 17 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168);
    expect({ value, inDockerPool }).toEqual({ value, inDockerPool: false });
  });
});

/**
 * OC-42 — the proxy address is one value, and it lies where it has to.
 *
 * `gateway.trustedProxies` names the proxy by address, so that address has to be
 * fixed before anything starts: compose gives it to the container, openclaw.sh
 * writes it into the gateway's configuration, and neither can look it up because
 * the container does not exist yet. Two keys therefore have to agree —
 * SYSTEM_PROXY_IP must fall inside SYSTEM_NETWORK_SUBNET — and compose refuses
 * the pair only at `up`, with a message that names neither key and after down.sh
 * has emptied the stack.
 */
describe('OC-42 the proxy address', () => {
  const read = (f: string) => readFileSync(join(repoRoot, f), 'utf8');

  test('is one default, written the same in every place that carries it', () => {
    const found = {
      env: read('.env.example').match(/^SYSTEM_PROXY_IP=(\S+)/m)?.[1],
      compose: read('compose.yml').match(/ipv4_address:\s*\$\{SYSTEM_PROXY_IP:-([^}]+)\}/)?.[1],
      start: read('scripts/linux/start.sh').match(/LU_PROXY_IP:-([^}]+)\}/)?.[1],
      openclaw: read('config/scripts/start/openclaw.sh').match(/LU_PROXY_IP:-([^}]+)\}/)?.[1]
    };
    const distinct = [...new Set(Object.values(found))];
    expect({ distinct, found }).toEqual({ distinct: [distinct[0]], found });
    expect(distinct[0]).toBeTruthy();
  });

  test('and lies outside the range docker allocates from', () => {
    // The first attempt pinned .2 with no pool declared. Docker allocates from
    // the bottom up and the proxy starts last -- everything else is its
    // dependency -- so eurooffice had taken .2 by the time the proxy asked for
    // it, and the start failed with "Address already in use". Found by starting,
    // not by reading.
    const ip = read('.env.example').match(/^SYSTEM_PROXY_IP=(\S+)/m)?.[1] as string;
    const pool = read('.env.example').match(/^SYSTEM_NETWORK_POOL=(\S+)/m)?.[1] as string;
    const r = sh([
      'bash', '-c',
      `eval "$(sed -n '/^lu_ip_in_cidr() {/,/^}/p' scripts/linux/start.sh)"; lu_ip_in_cidr ${ip} ${pool}`
    ]);
    expect({ ip, pool, insidePool: r.code === 0 }).toEqual({ ip, pool, insidePool: false });
  });

  test('and compose hands docker that range and no more', () => {
    expect(read('compose.yml')).toMatch(/ip_range:\s*\$\{SYSTEM_NETWORK_POOL:-/);
  });

  test('and the default lies inside the default subnet', () => {
    const ip = read('.env.example').match(/^SYSTEM_PROXY_IP=(\S+)/m)?.[1] as string;
    const cidr = read('.env.example').match(/^SYSTEM_NETWORK_SUBNET=(\S+)/m)?.[1] as string;
    const r = sh([
      'bash', '-c',
      `eval "$(sed -n '/^lu_ip_in_cidr() {/,/^}/p' scripts/linux/start.sh)"; lu_ip_in_cidr ${ip} ${cidr}`
    ]);
    expect({ ip, cidr, inside: r.code === 0 }).toEqual({ ip, cidr, inside: true });
  });

  test('and the start refuses a pair that does not agree, before anything is stopped', () => {
    // The guard, run against values that do not match. Ordering matters as much
    // as the check: compose would refuse the same pair at `up`, by which time
    // down.sh has already removed every container.
    const r = sh([
      'bash', '-c',
      `eval "$(sed -n '/^lu_ip_in_cidr() {/,/^}/p' scripts/linux/start.sh)"; lu_ip_in_cidr 10.99.1.2 10.99.0.0/24`
    ]);
    expect(r.code).not.toBe(0);
    const start = read('scripts/linux/start.sh');
    const guard = start.indexOf('lu_ip_in_cidr "$LU_PROXY_IP"');
    const down = start.indexOf('scripts/linux/down.sh"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(down);
  });

  test('and trustedProxies is written as that address, not as the range around it', () => {
    // The defect this replaces: trusting the subnet trusts the client, and a
    // trusted hop is discarded. Measured 2026-09-16 -- a container in the stack
    // got 403 while the host got 200, on the same configuration.
    const oc = read('config/scripts/start/openclaw.sh');
    expect(oc).toContain('c.gateway.trustedProxies = ["127.0.0.1/32", process.env.LU_PROXY_IP + "/32"]');
    expect(oc).not.toContain('process.env.LU_NETWORK_SUBNET');
  });
});
