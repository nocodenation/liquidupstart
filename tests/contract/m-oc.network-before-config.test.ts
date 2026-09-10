/**
 * OC-32, OC-35 — the network exists before anything reads it, and every network
 * the start creates is one the stack joins.
 *
 * Purpose: `scripts/linux/start.sh` runs `down.sh`, which removes the compose
 * network, and then `config/scripts/start/openclaw.sh`, which reads that
 * network to write `gateway.trustedProxies`. With the network gone the read is
 * empty, the wide RFC1918 list is written, and a block after `docker compose up`
 * rewrites the gateway's configuration and restarts it — a second writer racing
 * the gateway's own startup write. Measured on 2026-09-10: `Network ... Removed`,
 * then `trustedProxies = ["127.0.0.1/32","10.0.0.0/8","172.16.0.0/12",
 * "192.168.0.0/16"]`, then `Narrowing OpenClaw trustedProxies to 172.18.0.0/16`.
 *
 * Given  scripts/linux/start.sh and compose.yml as text
 * When   the order of the network creation, the openclaw.sh call and `up` is read
 * Then   the network is created first, under the name compose.yml declares, and
 *        no post-`up` narrowing block remains
 *
 * OC-35 is the second half and was not in the #11 review. The line this replaces
 * created `nocodenation_playground_network_${HTTP_PORT}` — a name from an earlier
 * name for this project, which nothing joins; on the host it was found on it held
 * zero containers. The intention was right and is what OC-32 needs; the name was
 * not. Asserting that every network named in the start scripts appears in
 * compose.yml is what finds the next stray one without anybody reading the line
 * for another reason.
 *
 * Test data: the exact strings. compose.yml declares
 * `nocodenation_liquid_upstart_network_${SYSTEM_HTTP_PORT:-8888}`; start.sh must
 * create that name and no other, before `config/scripts/start/openclaw.sh`.
 *
 * Requirements covered: OC-G3, F2 and F5 of the #11 review.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const START = 'scripts/linux/start.sh';
const COMPOSE = 'compose.yml';
const OPENCLAW = 'config/scripts/start/openclaw.sh';

const start = readFileSync(join(repoRoot, START), 'utf8');
const compose = readFileSync(join(repoRoot, COMPOSE), 'utf8');
const openclaw = readFileSync(join(repoRoot, OPENCLAW), 'utf8');

const lineOf = (body: string, needle: string) =>
  body.split('\n').findIndex((l) => l.includes(needle)) + 1;

describe('OC-32 the network is created before the configuration is written', () => {
  test('start.sh creates a network, calls openclaw.sh, and does so in that order', () => {
    const create = lineOf(start, 'docker network create');
    const call = lineOf(start, 'config/scripts/start/openclaw.sh');
    const up = lineOf(start, 'docker compose up -d');
    expect({ create: create > 0, call: call > 0, up: up > 0 }).toEqual({
      create: true,
      call: true,
      up: true
    });
    expect(create).toBeLessThan(call);
    expect(call).toBeLessThan(up);
  });

  test('the network it creates is labelled the way compose labels its own', () => {
    // Without these, every later compose command warns that the network "exists
    // but was not created by compose" — true, useless, and frequent enough to
    // train people past warnings. Found on 2026-09-10 as a side effect of the
    // repair above: creating the network by hand fixed one noise and made
    // another. The key is compose.yml's network key, not the port-suffixed name.
    const create = start.split('\n').find((l) => l.includes('docker network create'));
    const idx = start.split('\n').findIndex((l) => l.includes('docker network create'));
    const stmt = start.split('\n').slice(idx, idx + 5).join('\n');
    expect({ found: Boolean(create) }).toEqual({ found: true });
    expect(stmt).toContain('com.docker.compose.project=liquidupstart');
    expect(stmt).toContain('com.docker.compose.network=nocodenation_liquid_upstart_network');
  });

  test('and an existing network without those labels is replaced, not tolerated', () => {
    // The labels are not only about noise. Compose refuses to remove a network it
    // did not create, so an unlabelled one survives every `down` — while the
    // `create` above never runs, because `inspect` succeeds. The first version of
    // this repair produced exactly that on 2026-09-10: a stale network that
    // nothing could clean up, keeping its own warning alive. The start replaces
    // it, which is safe here because down.sh has already removed the containers.
    expect(start).toContain('com.docker.compose.network');
    expect(start).toMatch(/docker network rm "\$LU_NETWORK"/);
    const rm = start.split('\n').findIndex((l) => l.includes('docker network rm "$LU_NETWORK"'));
    const create = start.split('\n').findIndex((l) => l.includes('docker network create'));
    expect(rm).toBeGreaterThan(-1);
    expect(rm).toBeLessThan(create);
  });

  test('and no block after `up` rewrites trustedProxies a second time', () => {
    // The race this removes: the correction and the gateway's own startup write,
    // which stamps meta.lastTouchedVersion and modelPolicy. Whichever lands last
    // wins, and when it is the gateway the wide list is back.
    const up = lineOf(start, 'docker compose up -d');
    const after = start.split('\n').slice(up);
    const offenders = after
      .map((l, i) => ({ line: up + i + 1, text: l }))
      .filter(({ text }) => /trustedProxies|Narrowing/.test(text))
      .map(({ line, text }) => `${START}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  test('openclaw.sh inspects one network by its exact name, not by substring', () => {
    // `--filter name=` matches substrings, so a leftover network from another
    // port or a second checkout sorts first and its subnet is written instead.
    expect(openclaw).not.toContain('--filter name=nocodenation_liquid_upstart_network');
    expect(openclaw).toContain('docker network inspect "$LU_NETWORK_NAME"');
  });

  test('and takes one IPAM entry, because a dual-stack network has two', () => {
    // {{range .IPAM.Config}}{{.Subnet}}{{end}} concatenates with no separator:
    // 172.31.250.0/24fd00:dead:beef::/64 written verbatim into trustedProxies.
    expect(openclaw).toContain('{{(index .IPAM.Config 0).Subnet}}');
    expect(openclaw).not.toContain('{{range .IPAM.Config}}{{.Subnet}}{{end}}');
  });
});

describe('OC-35 every network the start creates is one the stack joins', () => {
  const declared = [...compose.matchAll(/name:\s*(\S*network\S*)/g)].map((m) =>
    m[1].replace(/\$\{[^}]*\}/g, '')
  );

  test('compose.yml declares a network to compare against', () => {
    // Guard against the whole case passing because a rename made the scan empty.
    expect(declared.length).toBeGreaterThan(0);
  });

  test('no start script creates or inspects a network compose.yml does not name', () => {
    const used = [...`${start}\n${openclaw}`.matchAll(/([A-Za-z0-9_]*network[A-Za-z0-9_]*)_?\$\{?[A-Z_]*/g)]
      .map((m) => m[1])
      .filter((n) => n.startsWith('nocodenation'));
    const stray = [...new Set(used)].filter(
      (n) => !declared.some((d) => d.startsWith(n) || n.startsWith(d.replace(/_$/, '')))
    );
    expect(stray).toEqual([]);
  });
});
