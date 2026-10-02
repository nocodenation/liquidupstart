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
