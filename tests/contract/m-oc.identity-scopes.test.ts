/**
 * OC-39 / OC-40 — the identity is written once, or it is written wrong.
 *
 * Purpose: R1 of §9. On 2026-09-19 the operator's browser was locked out of the
 * Control UI and the remedy the interface prints could not be run, because
 * `gateway.auth.mode` is `trusted-proxy` and a CLI reaching the gateway directly
 * sends no identity header. Sent **through** nginx the same CLI is
 * authenticated — it answers `missing scope: operator.pairing`, not
 * `unauthorized` — so what was missing was a scope, and
 * `gateway.auth.identityScopes` supplies it.
 *
 * That grant only works while it names **exactly** the identity nginx injects.
 * Two files holding one string is the shape that goes wrong silently: the grant
 * stops matching, and the refusal reads as a scope problem rather than a
 * mismatch. So the start script does not carry the identity — it reads it out of
 * the nginx template, which is the file that actually sets the header.
 *
 * Given  `config/scripts/start/openclaw.sh` and `config/nginx/templates/nginx.conf`
 * When   both are read as text
 * Then   the identity appears as a literal in the nginx template only, the start
 *        script derives it from there, and passes it to the config writer
 * And    the grant is written only on the 2026.9 shape and removed on the 2026.7
 *        one, because `identityScopes` does not exist in 2026.7.1's schema and a
 *        key that version does not know fails validation at start — §5.1's lesson
 * And    the script refuses to start when the template holds no identity, or more
 *        than one, rather than picking whichever comes first
 *
 * OC-40 is the negative half and the one that earns its place: OC-39 alone is
 * satisfied by writing any identity at all, including one no request will ever
 * carry.
 *
 * Test data: the header as the template sets it today —
 * `proxy_set_header X-Forwarded-User "user@nocodenation.org";` — three times, on
 * `openclaw.localhost`, `bridge.openclaw.localhost` and
 * `msteams.openclaw.localhost`. The scope the recovery actually needs is
 * `operator.pairing`; the measured refusal without it is the exact string
 * `missing scope: operator.pairing`.
 *
 * Requirements covered: OC-G5, §9 R1, OC-39 and OC-40.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');
const script = readFileSync(join(repoRoot, 'config/scripts/start/openclaw.sh'), 'utf8');
const template = readFileSync(join(repoRoot, 'config/nginx/templates/nginx.conf'), 'utf8');

// Every identity the template actually sets, as nginx would read them: the
// directive lines only, never the prose above them.
const HEADER = /^[ \t]*proxy_set_header[ \t]+X-Forwarded-User[ \t]+"([^"]+)"[ \t]*;/gm;
const identities = [...template.matchAll(HEADER)].map((m) => m[1]);

describe('OC-39 the grant names the identity nginx sets', () => {
  test('the template sets one identity, on every OpenClaw host', () => {
    expect(identities.length).toBeGreaterThan(0);
    expect(new Set(identities).size).toBe(1);
  });

  test('the start script derives it from that template instead of repeating it', () => {
    expect(script).toContain('config/nginx/templates/nginx.conf');
    expect(script).toMatch(/LU_PROXY_IDENTITY=/);
    // The identity itself must not appear as a literal anywhere in the script:
    // that is the duplication this case exists to prevent.
    expect(script).not.toContain(identities[0]);
  });

  test('and hands it to the config writer, which grants it the pairing scope', () => {
    expect(script).toContain('-e LU_PROXY_IDENTITY=');
    expect(script).toContain('c.gateway.auth.identityScopes');
    expect(script).toContain('process.env.LU_PROXY_IDENTITY');
    const grant = script.slice(script.indexOf('c.gateway.auth.identityScopes'));
    // operator.pairing is the one that makes `devices approve` possible; without
    // it the recovery is exactly as unreachable as before.
    expect(grant.slice(0, 600)).toContain('operator.pairing');
  });
});

describe('OC-40 and a template it cannot read stops the start', () => {
  test('no identity at all is an error, not an empty grant', () => {
    expect(script).toContain('no X-Forwarded-User identity found');
  });

  test('two identities are an error, not a coin toss', () => {
    expect(script).toContain('sets more than one X-Forwarded-User identity');
  });

  test('the grant is written only on the 2026.9 shape, and removed on the other', () => {
    // 2026.7.1's schema has no identityScopes, and a key it does not know is a
    // validation failure at start rather than a warning.
    const newShape = script.indexOf('delete c.gateway.controlUi.dangerouslyDisableDeviceAuth');
    const grant = script.indexOf('c.gateway.auth.identityScopes = {');
    const oldShape = script.indexOf('c.gateway.controlUi.dangerouslyDisableDeviceAuth = true');
    expect(newShape).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(newShape);
    expect(grant).toBeLessThan(oldShape);
    expect(script).toContain('delete c.gateway.auth.identityScopes');
  });
});
