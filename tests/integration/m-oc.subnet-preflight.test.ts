/**
 * R1 — the pinned range is checked before anything is stopped.
 *
 * Purpose: `main`'s start script creates `nocodenation_playground_network_<port>`
 * with no `--subnet`, so docker hands it the first free range — 172.18.0.0/16 on
 * an ordinary host, which is what this stack pinned on 2026-09-11. Nothing joins
 * that network and nothing removes it, so any host that ever ran `main` carried a
 * collision. Measured 2026-09-14: `docker network create --subnet` on a range
 * already in use answers *"invalid pool request: Pool overlaps with other one on
 * this address space"* and creates nothing.
 *
 * The old block created the network at start.sh:191 with no error handling, and
 * down.sh had already emptied the stack at line 16 — so the failure left the
 * machine with no stack and a raw docker error that never named the key to change.
 *
 * Given  a range another network already holds
 * When   lu_require_free_subnet is asked for it
 * Then   it refuses, names SYSTEM_NETWORK_SUBNET, and leaves no probe behind
 * And    a free range passes, leaving nothing behind either
 * And    lu_drop_legacy_network removes main's leftover only when unattached
 *
 * Requirements covered: OC-G5, R1 of the #11 third review.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const SCRIPT = 'scripts/linux/start.sh';
// Ranges nothing here uses; the decoy holds the first, the second stays free.
const TAKEN = '10.123.45.0/24';
const FREE = '10.123.46.0/24';
const DECOY = 'lu-r1-decoy';
const LEGACY = 'nocodenation_playground_network_65535';

function call(fn: string, ...args: string[]): { code: number; out: string } {
  const snippet = `
    set -uo pipefail
    eval "$(sed -n '/^lu_drop_legacy_network() {/,/^}/p;/^lu_require_free_subnet() {/,/^}/p' ${SCRIPT})"
    ${fn} ${args.map((a) => JSON.stringify(a)).join(' ')}
  `;
  const r = sh(['bash', '-c', snippet], repoRoot);
  return { code: r.code, out: r.output };
}

const networks = (): string[] =>
  sh(['docker', 'network', 'ls', '--format', '{{.Name}}']).stdout.trim().split('\n');

afterAll(() => {
  for (const n of [DECOY, LEGACY]) sh(['docker', 'network', 'rm', '-f', n]);
});

describe('R1 the subnet preflight', () => {
  test('refuses a range another network holds, and names the key to change', () => {
    sh(['docker', 'network', 'rm', '-f', DECOY]);
    const made = sh(['docker', 'network', 'create', '--subnet', TAKEN, DECOY]);
    expect({ decoy: made.code, hint: made.code === 0 ? '' : made.output }).toEqual({
      decoy: 0,
      hint: ''
    });

    const r = call('lu_require_free_subnet', 'lu-nonexistent-network', TAKEN);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('SYSTEM_NETWORK_SUBNET');
    expect(networks().filter((n) => n.startsWith('lu-subnet-probe-'))).toEqual([]);
  });

  test('passes a free range and leaves no probe network behind', () => {
    const r = call('lu_require_free_subnet', 'lu-nonexistent-network', FREE);
    expect({ code: r.code, out: r.out.trim() }).toEqual({ code: 0, out: '' });
    expect(networks().filter((n) => n.startsWith('lu-subnet-probe-'))).toEqual([]);
  });

  test('and says nothing when the stack already holds exactly that range', () => {
    // The ordinary start: our own network is up on the pinned range, and a probe
    // would report it as overlapping with itself.
    const r = call('lu_require_free_subnet', DECOY, TAKEN);
    expect({ code: r.code, out: r.out.trim() }).toEqual({ code: 0, out: '' });
  });
});

describe("R1 main's leftover network", () => {
  test('is removed when nothing is attached', () => {
    sh(['docker', 'network', 'rm', '-f', LEGACY]);
    expect(sh(['docker', 'network', 'create', LEGACY]).code).toBe(0);
    const r = call('lu_drop_legacy_network', LEGACY);
    expect({ code: r.code, gone: !networks().includes(LEGACY) }).toEqual({ code: 0, gone: true });
  });

  test('and is not claimed as removed while a container is attached', () => {
    // The half that matters, and narrower than it first looked: `docker network
    // rm` refuses while an endpoint is attached, so the network survives with or
    // without the guard. What the guard decides is whether the start announces a
    // removal that did not happen -- measured 2026-09-14, the guardless version
    // prints "Removing ..." and swallows the refusal through `|| true`.
    sh(['docker', 'network', 'rm', '-f', LEGACY]);
    expect(sh(['docker', 'network', 'create', LEGACY]).code).toBe(0);
    const img = 'liquidupstart/bun-runner:latest';
    expect(sh(['docker', 'image', 'inspect', img]).code).toBe(0);
    const cname = 'lu-r1-attached';
    sh(['docker', 'rm', '-f', cname]);
    const up = sh(['docker', 'run', '-d', '--init', '--name', cname, '--network', LEGACY, '--entrypoint', 'sleep', img, '30']);
    expect({ started: up.code, hint: up.code === 0 ? '' : up.output }).toEqual({ started: 0, hint: '' });
    try {
      const r = call('lu_drop_legacy_network', LEGACY);
      expect({
        code: r.code,
        stillThere: networks().includes(LEGACY),
        claimed: r.out.includes('Removing')
      }).toEqual({ code: 0, stillThere: true, claimed: false });
    } finally {
      sh(['docker', 'rm', '-f', cname]);
    }
  });
});
