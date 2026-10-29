/**
 * M-CS · Integration · nginx starts with nothing behind it, and finds what is there per request
 *
 * Purpose:  CS-9 reads the template as text; this runs nginx on it. `nginx -t` resolves
 *           literal upstreams while it checks, so it meets exactly the failure a start met
 *           when one upstream was absent -- `host not found in upstream`, the loop 0.8.0's
 *           proxy was in with the privacy proxy off. Request-time resolution has a second
 *           half that text cannot show: a service that *is* there has to be found through
 *           docker's DNS, including a name with an underscore, which half the stack's
 *           services have. And two things the local review of 2026-10-29 found: a name docker
 *           does not know is passed to the host's DNS unless the proxy's `dns` setting stops
 *           it, and a variable in `proxy_pass` turns off nginx's default redirect rewrite.
 * Given:    `nginx:latest`, the image the proxy runs, against the configuration
 *           `config/scripts/start/nginx.sh` renders from the real template in a temporary
 *           tree, with the certificate it writes; and `da4e2d1`'s template rendered the same
 *           way, for the negative.
 * When:     (1) `nginx -t` in a container with `--network none`; (2) the same with
 *           `da4e2d1`'s template; (3) on a new network `lu-cs10-<pid>`, nginx runs beside one
 *           upstream answering as `bun_runner`, with the `dns` setting `compose.yml` gives the
 *           proxy, and a third container asks for `opencode.localhost`, `pgadmin.localhost`,
 *           `app.localhost` and `app.localhost/redirect`; a container with the same `dns`
 *           setting asks the network's DNS for `uz` and for `bun_runner`; (4) everything made
 *           is removed.
 * Then:     (1) rc 0 and `test is successful`. (2) refused with `host not found in
 *           upstream`. (3) `opencode.localhost` answers 502 with the page naming OpenCode
 *           and *Which apps to run*; `pgadmin.localhost` answers nginx's own 502, without
 *           that page; `app.localhost` answers 200 from the `bun_runner` upstream, and the
 *           redirect it sends to `http://bun_runner:3000/target` reaches the browser as
 *           `http://app.localhost:8888/target`, as the literal form rewrote it. With the proxy's `dns` setting `uz` does not resolve, while
 *           `bun_runner` does.
 * Covers:   CS-10, CS-FR6, CS-NFR1
 * Negative: `da4e2d1`'s configuration does not start; `pgadmin.localhost`, which cannot be
 *           switched off, does not claim it was; `uz` does not resolve with the proxy's `dns`
 *           setting. Without it, the same lookup came back with the domain's public address,
 *           measured by hand on 2026-10-29 -- not asserted, since it needs the internet.
 * Counterpart: today's configuration starts with no upstream at all, and it reaches the one
 *           upstream that exists. The last row was measured by hand on 2026-10-29 before it
 *           was written down: it is the property decision 5 rests on.
 * Precondition: docker and `nginx:latest`. It uses `docker run` and `docker network`, not
 *           compose, so it stays in the default tier, as `tests/run.sh` allows a bare
 *           `docker run`; nothing it makes outlives it.
 *
 * Test data: `.env` is `.env.example` with `ENABLE_LIQUID=0`, so no keystore tool is
 * needed, and `SYSTEM_HTTP_PORT=8888`, `SYSTEM_HTTPS_PORT=8833`. **Must not exist:** a
 * container named `opencode` or `pgadmin` on `lu-cs10-<pid>`, a network this file creates
 * and that holds only its own three containers. The upstream is `nginx:latest` listening on
 * 3000 under the alias `bun_runner`; its welcome page carries `Welcome to nginx!`, and
 * `/redirect` answers `301` to `http://bun_runner:3000/target`. `uz` is a top-level domain
 * with an address of its own, so it is a single-label name the internet can answer, and no
 * container is called that. The `dns` setting is read from the proxy's block in `compose.yml`.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { exampleEnv } from '../lib/startfixture';
import { serviceBlock } from '../lib/compose-file';

const NET = `lu-cs10-${process.pid}`;
const PROXY = `${NET}-proxy`;
const UPSTREAM = `${NET}-up`;
const made: string[] = [];
afterAll(() => {
  sh(['docker', 'rm', '-f', PROXY, UPSTREAM]);
  sh(['docker', 'network', 'rm', NET]);
  made.forEach((d) => rmSync(d, { recursive: true, force: true }));
});

function rendered(template: string): { conf: string; certs: string } {
  const root = mkdtempSync(join(tmpdir(), 'lu-cs10-'));
  made.push(root);
  mkdirSync(join(root, 'config/scripts/start/lib'), { recursive: true });
  mkdirSync(join(root, 'config/nginx/templates'), { recursive: true });
  cpSync(join(repoRoot, 'config/scripts/start/nginx.sh'), join(root, 'config/scripts/start/nginx.sh'));
  cpSync(join(repoRoot, 'config/scripts/start/lib/components.sh'), join(root, 'config/scripts/start/lib/components.sh'));
  writeFileSync(join(root, 'config/nginx/templates/nginx.conf'), template);
  writeFileSync(
    join(root, '.env'),
    exampleEnv({ ENABLE_LIQUID: '0', SYSTEM_HTTP_PORT: '8888', SYSTEM_HTTPS_PORT: '8833' })
  );
  const r = sh(['bash', join(root, 'config/scripts/start/nginx.sh')], root);
  if (r.code !== 0) throw new Error(`nginx.sh failed: ${r.output}`);
  chmodSync(join(root, 'config/nginx/nginx.conf'), 0o644);
  return { conf: join(root, 'config/nginx/nginx.conf'), certs: join(root, 'volumes/nginx/certs') };
}

const mounts = (c: { conf: string; certs: string }) => [
  '-v', `${c.conf}:/etc/nginx/conf.d/default.conf:ro`,
  '-v', `${c.certs}:/etc/nginx/certs:ro`
];

const today = rendered(sh(['cat', join(repoRoot, 'config/nginx/templates/nginx.conf')]).stdout);
const main = rendered(sh(['git', 'show', 'da4e2d1:config/nginx/templates/nginx.conf']).stdout);

function ask(host: string): { status: number; body: string } {
  const r = sh([
    'docker', 'run', '--rm', '--network', NET, 'nginx:latest',
    'curl', '-s', '-m', '5', '-w', '\n%{http_code}', '-H', `Host: ${host}`, `http://${PROXY}:8888/`
  ]);
  const lines = r.stdout.split('\n');
  return { status: Number(lines.pop()), body: lines.join('\n') };
}

const LONG = 120_000;
const DNS = serviceBlock('proxy').match(/^ {4}dns: \["([^"]+)"\]$/m)?.[1] ?? '';
const UPSTREAM_CONF =
  "server { listen 3000; location = /redirect { return 301 http://bun_runner:3000/target; } location / { root /usr/share/nginx/html; index index.html; } }";

function location(host: string, path: string): string {
  const r = sh(['docker', 'run', '--rm', '--network', NET, 'nginx:latest', 'curl', '-s', '-m', '5', '-o', '/dev/null', '-D', '-', '-H', `Host: ${host}`, `http://${PROXY}:8888${path}`]);
  return r.stdout.match(/^location:\s*(\S+)/im)?.[1] ?? '';
}

const lookup = (name: string) =>
  sh(['docker', 'run', '--rm', '--network', NET, '--dns', DNS, 'nginx:latest', 'getent', 'ahosts', name]).stdout.trim();

describe('CS-10 nginx starts with nothing behind it', () => {
  test('CS-10 today\'s configuration passes nginx -t on a network with no upstream', () => {
    const r = sh(['docker', 'run', '--rm', '--network', 'none', ...mounts(today), 'nginx:latest', 'nginx', '-t']);
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('test is successful');
  }, LONG);

  test('CS-10 the negative: main\'s template, rendered the same way, does not', () => {
    const r = sh(['docker', 'run', '--rm', '--network', 'none', ...mounts(main), 'nginx:latest', 'nginx', '-t']);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('host not found in upstream');
  }, LONG);

  describe('CS-10 a running nginx, on a network of its own', () => {
    let ready = false;
    const start = () => {
      if (ready) return;
      expect(sh(['docker', 'network', 'create', NET]).code).toBe(0);
      const up = sh([
        'docker', 'run', '-d', '--name', UPSTREAM, '--network', NET, '--network-alias', 'bun_runner',
        'nginx:latest', 'sh', '-c', `printf '%s' '${UPSTREAM_CONF}' > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'`
      ]);
      expect(up.code, up.output).toBe(0);
      expect(DNS).toBe('127.0.0.1');
      const px = sh(['docker', 'run', '-d', '--name', PROXY, '--network', NET, '--dns', DNS, ...mounts(today), 'nginx:latest']);
      expect(px.code, px.output).toBe(0);
      for (let i = 0; i < 30 && ask('pgadmin.localhost').status === 0; i++) Bun.sleepSync(500);
      ready = true;
    };

    test('CS-10 opencode.localhost answers the 502 page naming Which apps to run', () => {
      start();
      const r = ask('opencode.localhost');
      expect(r.status).toBe(502);
      expect(r.body).toContain('OpenCode does not answer');
      expect(r.body).toContain('Which apps to run');
    }, LONG);

    test('CS-10 the negative: pgadmin.localhost answers nginx\'s own 502, not that page', () => {
      start();
      const r = ask('pgadmin.localhost');
      expect(r.status).toBe(502);
      expect(r.body).toContain('502 Bad Gateway');
      expect(r.body).not.toContain('Which apps to run');
    }, LONG);

    test('CS-10 the counterpart: app.localhost reaches the upstream named bun_runner, per request', () => {
      start();
      const r = ask('app.localhost');
      expect(r.status).toBe(200);
      expect(r.body).toContain('Welcome to nginx!');
    }, LONG);

    test('CS-10 and a redirect naming the upstream reaches the browser rewritten, as before', () => {
      start();
      expect(location('app.localhost', '/redirect')).toBe('http://app.localhost:8888/target');
    }, LONG);

    test('CS-10 the negative: with the proxy\'s dns setting a name docker does not know does not resolve', () => {
      start();
      expect(lookup('uz')).toBe('');
    }, LONG);

    test('CS-10 the counterpart: while the stack\'s own names still do', () => {
      start();
      expect(lookup('bun_runner')).toContain('bun_runner');
    }, LONG);
  });
});
