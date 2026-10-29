/**
 * M-CS · Integration · nginx.sh keeps the certificate and drops Liquid's keystore when Liquid is off
 *
 * Purpose:  Every HTTPS server block of nginx names `liquid.localhost.crt`, Liquid or not,
 *           while the PKCS#12 keystore and truststore exist only for Liquid. Writing those
 *           without Liquid needs `LIQUID_KEYSTORE_PASSWORD`, which the configuration page
 *           hides while Liquid is off (CS-FR12). So the start keeps the one and skips the
 *           other, and the configuration it renders must not depend on the switch.
 * Given:    `config/scripts/start/nginx.sh`, `lib/components.sh` and the real nginx
 *           template, copied at their real relative paths into a temporary tree; the real
 *           `openssl` (LibreSSL on macOS counts); stub `keytool` and `docker` first on
 *           `PATH`, each writing the file named after `-keystore`.
 * When:     `nginx.sh` runs with `ENABLE_LIQUID=0`, and in a fresh tree with `ENABLE_LIQUID=1`.
 * Then:     Off writes the certificate and its key and no `.p12`; on writes all four. The
 *           rendered `config/nginx/nginx.conf` is byte-identical between the two, and holds
 *           the 100 ingress blocks.
 * Covers:   CS-6, CS-FR4
 * Negative: the off run writes neither `liquid.keystore.p12` nor `liquid.truststore.p12`.
 * Counterpart: the on run writes both, so a script that never wrote them cannot pass; and
 *           the off run still writes the certificate every HTTPS block needs.
 *
 * Test data: `.env` is `.env.example` with `LIQUID_KEYSTORE_PASSWORD=cs6-keystore-pass` in
 * both runs, so the off run shows the password is not used rather than that it is missing,
 * and `ENABLE_LIQUID` at `0` or `1`. Files looked for under `volumes/nginx/certs/`:
 * `liquid.localhost.crt`, `liquid.localhost.key`, `liquid.keystore.p12`,
 * `liquid.truststore.p12`. The ingress blocks are counted by `server_name 89NN.liquid.localhost;`.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { exampleEnv } from '../lib/startfixture';

const made: string[] = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

const FILES = ['liquid.localhost.crt', 'liquid.localhost.key', 'liquid.keystore.p12', 'liquid.truststore.p12'];

// Writes the file it is asked to write, wherever the -keystore argument points.
const STORE_STUB = `#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in -keystore) shift; mkdir -p "$(dirname "$1")"; printf 'stub\\n' > "$1" ;; esac
  shift
done
exit 0
`;

function render(liquid: '0' | '1') {
  const root = mkdtempSync(join(tmpdir(), 'lu-cs6-'));
  made.push(root);
  mkdirSync(join(root, 'config/scripts/start/lib'), { recursive: true });
  mkdirSync(join(root, 'config/nginx/templates'), { recursive: true });
  mkdirSync(join(root, 'bin'), { recursive: true });
  cpSync(join(repoRoot, 'config/scripts/start/nginx.sh'), join(root, 'config/scripts/start/nginx.sh'));
  cpSync(join(repoRoot, 'config/scripts/start/lib/components.sh'), join(root, 'config/scripts/start/lib/components.sh'));
  cpSync(join(repoRoot, 'config/nginx/templates/nginx.conf'), join(root, 'config/nginx/templates/nginx.conf'));
  for (const tool of ['keytool', 'docker']) {
    writeFileSync(join(root, 'bin', tool), STORE_STUB);
    chmodSync(join(root, 'bin', tool), 0o755);
  }
  writeFileSync(join(root, '.env'), exampleEnv({ LIQUID_KEYSTORE_PASSWORD: 'cs6-keystore-pass', ENABLE_LIQUID: liquid }));
  const r = sh(['bash', join(root, 'config/scripts/start/nginx.sh')], root, {
    PATH: `${join(root, 'bin')}:${process.env.PATH}`
  });
  const certs = join(root, 'volumes/nginx/certs');
  const conf = join(root, 'config/nginx/nginx.conf');
  return {
    ...r,
    written: FILES.filter((f) => existsSync(join(certs, f))),
    conf: existsSync(conf) ? readFileSync(conf, 'utf8') : ''
  };
}

describe('CS-6 nginx.sh keeps the certificate and drops the keystore', () => {
  const off = render('0');
  const on = render('1');

  test('CS-6 the negative: with Liquid off, the certificate and no keystore or truststore', () => {
    expect(off.code).toBe(0);
    expect(off.written).toEqual(['liquid.localhost.crt', 'liquid.localhost.key']);
    expect(off.stdout).not.toContain('cs6-keystore-pass');
  });

  test('CS-6 the counterpart: with Liquid on, all four', () => {
    expect(on.code).toBe(0);
    expect(on.written).toEqual(FILES);
  });

  test('CS-6 and the rendered configuration is the same both ways, with its 100 ingress blocks', () => {
    expect(off.conf.length).toBeGreaterThan(0);
    expect(off.conf).toBe(on.conf);
    expect(off.conf.match(/server_name 89\d\d\.liquid\.localhost;/g)?.length).toBe(100);
  });
});
