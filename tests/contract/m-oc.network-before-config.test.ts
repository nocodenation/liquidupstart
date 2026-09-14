/**
 * OC-32, OC-35 — the configuration does not depend on a network being there,
 * and no network the start touches is one nothing joins.
 *
 * History, because these cases have outlived two designs:
 *
 * F2 (first review) — `down.sh` removed the compose network and `openclaw.sh`
 * then read that network to write `gateway.trustedProxies`. The read came back
 * empty, the wide RFC1918 list was written, and a block after `docker compose up`
 * rewrote the configuration and restarted the gateway, racing the gateway's own
 * startup write. The repair created the network early, with compose's labels.
 *
 * R2 (third review) — that pre-creation existed *only* for the lookup. The range
 * is now read from `.env`, which is the same value compose declares as ipam, so
 * the lookup, the early creation, the labels, the unlabelled-network self-heal
 * and the ordering dependency between the two scripts are all gone. What the
 * original cases protected is unchanged; what they were written against is not,
 * so they are re-founded here rather than adjusted until they pass.
 *
 * Given  the two start scripts and compose.yml as text
 * When   they are read for who creates a network and who reads one
 * Then   openclaw.sh reads no network at all, start.sh leaves the creation to
 *        compose, nothing rewrites trustedProxies after `up`, and any name
 *        compose does not declare is only ever removed, never created
 *
 * Requirements covered: OC-G3, F2 and F5 of the first review, R1 and R2 of the third.
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

describe('OC-32 the configuration is written without consulting a network', () => {
  test('openclaw.sh inspects no network, and reads the range from .env', () => {
    // The lookup is what forced the ordering: it needed the network to exist
    // before this script ran, and answered "" when it did not — silently, which
    // is how the wide list got written.
    expect(openclaw).not.toContain('docker network inspect');
    expect(openclaw).toMatch(/LU_NETWORK_SUBNET="\$\(get_env SYSTEM_NETWORK_SUBNET\)"/);
  });

  test('and refuses a value that is not a CIDR rather than writing it', () => {
    // trustedProxies is matched by the gateway, not parsed by us: a malformed
    // range is a 403 on every proxied request with nothing to read.
    expect(openclaw).toMatch(/SYSTEM_NETWORK_SUBNET in .* is not a CIDR/);
  });

  test('start.sh leaves the compose network to compose', () => {
    // Nothing pre-creates it any more, so nothing has to label it like compose,
    // and the unlabelled-network trap of 2026-09-10 cannot recur.
    const creates = start
      .split('\n')
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /docker network create/.test(text) && !text.trim().startsWith('#'))
      .filter(({ text }) => !/"\$probe"/.test(text))
      .map(({ line, text }) => `${START}:${line}  ${text.trim()}`);
    expect(creates).toEqual([]);
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
});

describe('OC-35 a network compose does not declare is removed, never created', () => {
  const declared = [...compose.matchAll(/name:\s*(\S*network\S*)/g)].map((m) =>
    m[1].replace(/\$\{[^}]*\}/g, '')
  );

  test('compose.yml declares a network to compare against', () => {
    // Guard against the whole case passing because a rename made the scan empty.
    expect(declared.length).toBeGreaterThan(0);
  });

  test('the stray names the start scripts mention appear only in a removal', () => {
    // The line F2 replaced created nocodenation_playground_network_<port> — a
    // name from an earlier name for this project, which nothing joins and which
    // no `down` removes. R1 showed what that leftover costs: it holds the range
    // this stack pins. So the name is still here, and must be, but only to take
    // it away.
    const offenders = `${start}\n${openclaw}`
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .filter((l) => /nocodenation_[A-Za-z0-9_]*network/.test(l))
      .filter((l) => {
        const name = l.match(/nocodenation_[A-Za-z0-9_]*network/)![0];
        const isDeclared = declared.some((d) => d.replace(/_$/, '') === name);
        if (isDeclared) return false;
        return !/network rm|network inspect|lu_drop_legacy_network|^\s*LEGACY/.test(l);
      })
      .map((l) => l.trim());
    expect(offenders).toEqual([]);
  });

  test('and the only network the start creates itself is removed in the same helper', () => {
    // The subnet probe: created to ask docker whether the range is free, removed
    // immediately. A probe that survives its own function is a leftover like any
    // other — and would hold the very range it was checking.
    const fn = start.slice(
      start.indexOf('lu_require_free_subnet() {'),
      start.indexOf('\n}', start.indexOf('lu_require_free_subnet() {'))
    );
    expect(fn).toContain('docker network create --subnet "$cidr" "$probe"');
    expect(fn).toContain('docker network rm "$probe"');
  });
});
