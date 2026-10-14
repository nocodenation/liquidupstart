/**
 * M-OC · Unit · What the pairing script reads out of .env
 *
 * Purpose:  A minor of the 2026-09-29 review. `get_env` stripped double quotes
 *           and not single ones, so `SYSTEM_HTTP_PORT='9999'` in `.env` gave the
 *           docker network name `nocodenation_liquid_upstart_network_'9999'` and
 *           the host `openclaw.localhost:'9999'` — a network that does not exist
 *           and a Host nothing answers on, from a value compose and
 *           `start/openclaw.sh` both read correctly. The card would then report
 *           that the gateway did not answer, which is the one message this card
 *           exists to avoid being wrong about.
 * Given:    `config/scripts/openclaw-pairing.sh` run with a temporary project
 *           directory and a stub `docker` on PATH that prints its arguments
 *           instead of running anything. Three `.env` files, same key, three
 *           quotings: `SYSTEM_HTTP_PORT='9999'`, `SYSTEM_HTTP_PORT="9999"` and
 *           `SYSTEM_HTTP_PORT=9999`, each with `SYSTEM_PROXY_IP='10.99.0.5'`.
 * When:     The script is called with `list`.
 * Then:     All three derive the same network, host and added address, with no
 *           quote anywhere in them.
 * Covers:   OC-58, R2
 * Unhappy:  The unquoted form is the counterpart: a repair that stripped a
 *           leading character unconditionally would break it, which is the usual
 *           way this is written wrong.
 */
import { test, expect, describe } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const SCRIPT = join(repoRoot, 'config/scripts/openclaw-pairing.sh');

/**
 * Like `derived`, but the stub `docker` answers `inspect` with what a real one
 * would: `"<network> <ip>"` on one line. Everything else is echoed as before, so
 * the assertions can still read the `run` argv.
 */
function derivedWithProxy(envBody: string, inspectAnswer: string) {
  const root = mkdtempSync(join(tmpdir(), 'lu-oc-pair-obs-'));
  writeFileSync(join(root, '.env'), envBody);
  const bin = join(root, 'bin');
  sh(['mkdir', '-p', bin]);
  writeFileSync(
    join(bin, 'docker'),
    '#!/bin/sh\nif [ "$1" = inspect ]; then printf "%s\\n" ' +
      JSON.stringify(inspectAnswer) +
      '; exit 0; fi\nprintf "%s\\n" "$*"\nexit 0\n'
  );
  chmodSync(join(bin, 'docker'), 0o755);
  const r = sh(['bash', SCRIPT, root, 'list'], root, { PATH: `${bin}:${process.env.PATH}` });
  rmSync(root, { recursive: true, force: true });
  return r.output;
}

/** Like `derived`, but the exit status is what the case is about. */
function runVerb(args: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'lu-oc-pair-guard-'));
  writeFileSync(join(root, '.env'), 'SYSTEM_HTTP_PORT=8888\nSYSTEM_PROXY_IP=10.99.0.2\n');
  const bin = join(root, 'bin');
  sh(['mkdir', '-p', bin]);
  // Echoes, so a call that got through is visible in the output.
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\nprintf "RAN %s\\n" "$*"\nexit 0\n');
  chmodSync(join(bin, 'docker'), 0o755);
  const r = sh(['bash', SCRIPT, root, ...args], root, { PATH: `${bin}:${process.env.PATH}` });
  rmSync(root, { recursive: true, force: true });
  return r;
}

function derived(envBody: string) {
  const root = mkdtempSync(join(tmpdir(), 'lu-oc-pair-'));
  writeFileSync(join(root, '.env'), envBody);
  const bin = join(root, 'bin');
  sh(['mkdir', '-p', bin]);
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\nprintf "%s\\n" "$*"\nexit 0\n');
  chmodSync(join(bin, 'docker'), 0o755);
  const r = sh(['bash', SCRIPT, root, 'list'], root, { PATH: `${bin}:${process.env.PATH}` });
  rmSync(root, { recursive: true, force: true });
  return r.output;
}

const EXPECTED_NETWORK = 'nocodenation_liquid_upstart_network_9999';
const EXPECTED_HOST = 'openclaw.localhost:9999';
const EXPECTED_ADDRESS = 'openclaw.localhost:10.99.0.5';

describe('OC-58 a quoted value in .env is read the way compose reads it', () => {
  for (const [name, body] of [
    ['single quotes', "SYSTEM_HTTP_PORT='9999'\nSYSTEM_PROXY_IP='10.99.0.5'\n"],
    ['double quotes', 'SYSTEM_HTTP_PORT="9999"\nSYSTEM_PROXY_IP="10.99.0.5"\n'],
    ['no quotes', 'SYSTEM_HTTP_PORT=9999\nSYSTEM_PROXY_IP=10.99.0.5\n']
  ] as [string, string][]) {
    test(`OC-58 ${name}: the network, the host and the address carry no quote`, () => {
      const out = derived(body);
      expect(out).toContain(`--network ${EXPECTED_NETWORK}`);
      expect(out).toContain(`--add-host ${EXPECTED_ADDRESS}`);
      expect(out).toContain(`ws://${EXPECTED_HOST}`);
      expect(out).not.toContain("'9999'");
      expect(out).not.toContain('"9999"');
    });
  }
});

describe('OC-69 the running stack is the authority, and .env is the fallback', () => {
  // A5 of the 2026-10-01 review. `./run.sh` rebuilds the dashboard without
  // restarting the stack, so `.env` can describe a stack that is not the one
  // running: change the port or the proxy address and this script joined a
  // network that does not exist, or added a host entry pointing at nothing, and
  // the CLI failed with a transport error that said nothing about why.
  const STALE = 'SYSTEM_HTTP_PORT=9999\nSYSTEM_PROXY_IP=10.99.0.5\n';

  test('OC-69 the observed network, address and port win over .env', () => {
    const out = derivedWithProxy(STALE, 'nocodenation_liquid_upstart_network_8888 10.99.0.2');
    expect(out).toContain('--network nocodenation_liquid_upstart_network_8888');
    expect(out).toContain('--add-host openclaw.localhost:10.99.0.2');
    // The port comes out of the observed network's own name, so one fact carries
    // both rather than one being read and the other remembered.
    expect(out).toContain('ws://openclaw.localhost:8888');
    expect(out).not.toContain('9999');
    expect(out).not.toContain('10.99.0.5');
  });

  test('OC-69 and an answer that is not an observation is ignored', () => {
    // The counterpart, and it is the one that earns its place: `OC-58` drives
    // this script with a stub `docker` that echoes its arguments, so the first
    // version of the repair took `inspect` for a network name and broke all
    // three of those scenarios. Noise is not an observation.
    const out = derivedWithProxy(STALE, 'inspect proxy --format {{.Nonsense}}');
    expect(out).toContain('--network nocodenation_liquid_upstart_network_9999');
    expect(out).toContain('--add-host openclaw.localhost:10.99.0.5');
    expect(out).toContain('ws://openclaw.localhost:9999');
  });

  test('OC-69 and with no proxy at all the .env values stand', () => {
    // There is nothing to pair against when the proxy is down, so this falls back
    // rather than refusing: the refusal the operator then sees comes from the CLI
    // and says the gateway did not answer, which is true and is the point.
    const out = derivedWithProxy(STALE, '');
    expect(out).toContain('--network nocodenation_liquid_upstart_network_9999');
    expect(out).toContain('ws://openclaw.localhost:9999');
  });
});

describe('OC-45 the request id is guarded at the last point before a command line', () => {
  // B5 of the 2026-10-01 review: with the script's `exit 2` replaced by `true`,
  // `m-oc.pairing-card` and `m-oc.pairing-env` stayed 21 / 21. The guard was
  // untested, and the reviewer named this harness as the place to hold it.
  //
  // It is guarded here as well as in the route because this is the last point
  // before the value reaches a command line, and the route is not the only thing
  // that will ever call the script.
  const UUID = '09cc464f-690a-4a51-9ac9-c97b7011eb34';

  test('OC-45 a value that is not a request id is refused with exit 2', () => {
    const r = runVerb(['approve', 'abc']);
    expect(r.code).toBe(2);
    expect(r.output).toContain('not a request id: abc');
    // And nothing reached docker.
    expect(r.output).not.toContain('RAN');
  });

  test('OC-45 and a missing id is refused the same way', () => {
    const r = runVerb(['approve']);
    expect(r.code).toBe(2);
    expect(r.output).toContain('needs a request id');
    expect(r.output).not.toContain('RAN');
  });

  test('OC-45 and something shaped like a shell is refused, not run', () => {
    // The shape that makes the guard worth having rather than tidy.
    const r = runVerb(['approve', '$(id>/tmp/oc45);#']);
    expect(r.code).toBe(2);
    expect(r.output).not.toContain('RAN');
  });

  test('OC-45 the counterpart: a real request id gets through to the CLI', () => {
    // Without this the guard could be met by refusing everything, which is the
    // same defect with the other sign.
    const r = runVerb(['approve', UUID]);
    expect(r.code).toBe(0);
    expect(r.output).toContain(`RAN`);
    expect(r.output).toContain(`devices approve ${UUID}`);
  });

  test('OC-45 and an unknown verb is refused', () => {
    const r = runVerb(['frobnicate']);
    expect(r.code).toBe(2);
    expect(r.output).toContain('unknown verb: frobnicate');
  });
});
