/**
 * M-SR · Unit · http://liquid.localhost redirects to the port Liquid is served on
 *
 * Purpose:  The last server block of `config/nginx/templates/nginx.conf` answered
 *           `return 301 https://liquid.localhost:8889;`, a port written literally since `f2b9806`
 *           (2026-06-19) and one nothing listens on. Liquid is served on `SYSTEM_HTTPS_PORT`,
 *           8833 by default, and `nginx.sh` replaces that placeholder everywhere in the
 *           template, so the redirect now names the placeholder (SR-FR4).
 * Given:    `config/scripts/start/nginx.sh` and `lib/components.sh`, copied into a fresh
 *           `mktemp -d` tree with today's template and run there, as
 *           `tests/integration/m-cs.nginx-starts.test.ts` renders it.
 * When:     It renders once with `SYSTEM_HTTPS_PORT=9443` and once with `8833`.
 * Then:     The HTTP server block for `liquid.localhost` answers
 *           `return 301 https://liquid.localhost:9443;` and `...:8833;` respectively.
 * Covers:   SR-3, SR-FR4
 * Negative: neither rendering contains `8889` anywhere.
 * Counterpart: the two renderings, which show that the port follows the setting.
 *
 * Test data: `.env` is `exampleEnv()` with `ENABLE_LIQUID=0`, which spares the keystore and
 * its need for Docker or `keytool`, `SYSTEM_HTTP_PORT=8888`, and `SYSTEM_HTTPS_PORT` set to
 * `9443` or `8833`. `9443` is neither the default nor the old literal, so only the placeholder
 * can produce it. The HTTP block for `liquid.localhost` is rendered either way.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { exampleEnv } from '../lib/startfixture';

const made: string[] = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

function rendered(httpsPort: string): string {
  const root = mkdtempSync(join(tmpdir(), 'lu-sr3-'));
  made.push(root);
  mkdirSync(join(root, 'config/scripts/start/lib'), { recursive: true });
  mkdirSync(join(root, 'config/nginx/templates'), { recursive: true });
  cpSync(join(repoRoot, 'config/scripts/start/nginx.sh'), join(root, 'config/scripts/start/nginx.sh'));
  cpSync(join(repoRoot, 'config/scripts/start/lib/components.sh'), join(root, 'config/scripts/start/lib/components.sh'));
  cpSync(join(repoRoot, 'config/nginx/templates/nginx.conf'), join(root, 'config/nginx/templates/nginx.conf'));
  writeFileSync(
    join(root, '.env'),
    exampleEnv({ ENABLE_LIQUID: '0', SYSTEM_HTTP_PORT: '8888', SYSTEM_HTTPS_PORT: httpsPort })
  );
  const r = sh(['bash', join(root, 'config/scripts/start/nginx.sh')], root);
  if (r.code !== 0) throw new Error(`nginx.sh failed: ${r.output}`);
  return readFileSync(join(root, 'config/nginx/nginx.conf'), 'utf8');
}

// The return line of the server block that listens on the HTTP port for liquid.localhost.
function redirect(conf: string): string {
  const block = conf
    .split(/\n(?=server\s*\{)/)
    .find((b) => /listen 8888;/.test(b) && /server_name liquid\.localhost;/.test(b));
  return block?.match(/^\s*(return 301 [^\n]*)$/m)?.[1] ?? '';
}

const at9443 = rendered('9443');
const at8833 = rendered('8833');

describe('SR-3 the redirect from http://liquid.localhost', () => {
  test('SR-3 rendered with SYSTEM_HTTPS_PORT=9443, it redirects to port 9443', () => {
    expect(redirect(at9443)).toBe('return 301 https://liquid.localhost:9443;');
  });

  test('SR-3 and with SYSTEM_HTTPS_PORT=8833, to port 8833', () => {
    expect(redirect(at8833)).toBe('return 301 https://liquid.localhost:8833;');
  });

  test('SR-3 the negative: neither rendering contains 8889', () => {
    expect(at9443).not.toContain('8889');
    expect(at8833).not.toContain('8889');
  });
});
