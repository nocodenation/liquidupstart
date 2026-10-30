/**
 * M-CS · Contract · The nginx template resolves every upstream when a request needs it
 *
 * Purpose:  Every `proxy_pass` used to name its host literally, and nginx resolves a
 *           literal host when it starts, so one missing container stopped the proxy and with
 *           it every `*.localhost`. That was not hypothetical: with `PRIVACY_PROXY_ENABLE=0`,
 *           the default, 0.8.0's nginx exited on `privacy-proxy:8080` and restarted in a
 *           loop (the update test of 2026-10-29, BACKLOG). One literal left behind brings it
 *           back. And a vhost of a service that can be switched off has to say so, while the
 *           others must not claim a switch they do not have.
 * Given:    `config/nginx/templates/nginx.conf` and the ingress heredoc in
 *           `config/scripts/start/nginx.sh`, read as text; `lu_proxy_identity` from
 *           `config/scripts/start/lib/proxy-identity.sh`; and, for the negative, both files
 *           as `da4e2d1` has them: `tests/fixtures/da4e2d1/nginx.conf` and `nginx.sh`. They
 *           were read with `git show` until the review on #56, which found that a shallow
 *           clone or the release archive has no history, so the case failed there.
 * When:     Every uncommented `proxy_pass` line is collected; the `resolver` line is looked
 *           for; each server block is read for `error_page 502 @lu_unavailable` and the page
 *           its named location returns; `lu_proxy_identity` runs on the template.
 * Then:     Every `proxy_pass` passes through `$lu_upstream`, and is followed by the
 *           `proxy_redirect` nginx derived from the literal form, because a variable turns that
 *           default off (the local review of 2026-10-29); the resolver is docker's; each
 *           switchable vhost carries its page, naming the service and where to switch it;
 *           the always-on vhosts carry none; and the identity nginx vouches for is the one
 *           it vouched for before. The ingress heredoc's block carries a page of its own,
 *           naming its port, Liquid, *Which apps to run* and a flow that does not listen
 *           (added on 2026-10-30). Where the history holds `da4e2d1`, the fixtures are that
 *           commit's files byte for byte.
 * Covers:   CS-9, CS-FR6
 * Negative: `da4e2d1`'s template has 15 literal `proxy_pass` lines and its heredoc one, and
 *           the predicate names each of them; the always-on vhosts carry no page.
 * Counterpart: today's files have none, so a predicate that refused every `proxy_pass` cannot
 *           pass; and the seven switchable server blocks carry the page.
 *
 * Test data: switchable vhosts and what each page names: `opencode.localhost` → `OpenCode`;
 * `nar-builder.localhost` → `The NAR builder`; `openclaw.localhost`,
 * `bridge.openclaw.localhost`, `msteams.openclaw.localhost` → `OpenClaw`; the HTTPS
 * `liquid.localhost` → `Liquid`, each with `Which apps to run`; `privacy.localhost` →
 * `Privacy proxy`, where the privacy proxy's switch is. **Must not carry the page:**
 * `pgadmin.localhost`, `postgrest.localhost`, `swagger.localhost`, `app.localhost`,
 * `openproject.localhost`, `nextcloud.localhost`, `eurooffice.localhost`. The resolver line:
 * `resolver 127.0.0.11 valid=10s ipv6=off;`. The identity, as `da4e2d1`'s template gives it:
 * `user@nocodenation.org`. The ingress page: `Liquid does not answer on port ${port}: it is
 * either switched off under Which apps to run in Configuration, or not running, or no flow
 * listens on this port.`, with `${port}` the heredoc's variable, so each block names its own.
 * Precondition for the fixture row only: `git cat-file -e da4e2d1` succeeds. Where it does not,
 * that row is skipped, and its name says what it needs; every other row reads the fixtures.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const TEMPLATE = 'config/nginx/templates/nginx.conf';
const NGINX_SH = 'config/scripts/start/nginx.sh';
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');
const FIXTURES = join(repoRoot, 'tests/fixtures/da4e2d1');
const atMain = (p: string) => readFileSync(join(FIXTURES, basename(p)), 'utf8');
const HAS_DA4E2D1 = sh(['git', 'cat-file', '-e', 'da4e2d1^{commit}']).code === 0;
const INGRESS_PAGE =
  'return 502 "Liquid does not answer on port ${port}: it is either switched off under Which apps to run in Configuration, or not running, or no flow listens on this port.\\n";';

/** `proxy_pass` lines that name a host instead of passing through `$lu_upstream`. */
const literal = (text: string) =>
  text
    .split('\n')
    .filter((l) => /^\s*proxy_pass\s/.test(l) && !/^\s*proxy_pass https?:\/\/\\?\$lu_upstream;\s*$/.test(l))
    .map((l) => l.trim());

/** The server blocks of the template, by `server_name`, in order. */
function serverBlocks(text: string): { name: string; ssl: boolean; body: string }[] {
  return text
    .split(/^server \{$/m)
    .slice(1)
    .map((body) => ({
      name: body.match(/^\s*server_name\s+([^;]+);/m)?.[1] ?? '',
      ssl: /^\s*listen\s+\S+\s+ssl/m.test(body),
      body
    }));
}

const PAGES: [string, boolean, string, string][] = [
  ['opencode.localhost', false, 'OpenCode', 'Which apps to run'],
  ['nar-builder.localhost', false, 'The NAR builder', 'Which apps to run'],
  ['openclaw.localhost', false, 'OpenClaw', 'Which apps to run'],
  ['bridge.openclaw.localhost', false, 'OpenClaw', 'Which apps to run'],
  ['msteams.openclaw.localhost', false, 'OpenClaw', 'Which apps to run'],
  ['liquid.localhost', true, 'Liquid', 'Which apps to run'],
  ['privacy.localhost', false, 'privacy proxy', 'Privacy proxy in Configuration']
];
const ALWAYS_ON = ['pgadmin.localhost', 'postgrest.localhost', 'swagger.localhost', 'app.localhost', 'openproject.localhost', 'nextcloud.localhost', 'eurooffice.localhost'];

describe('CS-9 the template resolves at request time', () => {
  test('CS-9 no proxy_pass names a host, the ingress heredoc included', () => {
    const template = read(TEMPLATE);
    expect(template.split('\n').filter((l) => /^\s*proxy_pass\s/.test(l)).length).toBe(15);
    expect(literal(template)).toEqual([]);
    expect(read(NGINX_SH)).toContain('proxy_pass https://\\$lu_upstream;');
    expect(literal(read(NGINX_SH))).toEqual([]);
  });

  test('CS-9 and each one states the redirect rewrite the literal form had', () => {
    for (const [file, text] of [[TEMPLATE, read(TEMPLATE)], [NGINX_SH, read(NGINX_SH)]]) {
      const lines = text.split('\n');
      const passes = lines.flatMap((l, i) => (/^\s*proxy_pass\s/.test(l) ? [i] : []));
      expect(passes.length, file).toBeGreaterThan(0);
      for (const i of passes) {
        const scheme = lines[i].match(/proxy_pass (https?):/)?.[1];
        const upstream = lines[i - 1].match(/^\s*set \\?\$lu_upstream (\S+);$/)?.[1];
        expect(`${file}:${i + 1} ${lines[i + 1].trim()}`).toBe(`${file}:${i + 1} proxy_redirect ${scheme}://${upstream}/ /;`);
      }
    }
  });

  test('CS-9 the negative: the same predicate names every literal one main had', () => {
    expect(literal(atMain(TEMPLATE)).length).toBe(15);
    expect(literal(atMain(NGINX_SH))).toEqual(['proxy_pass https://liquid:${port};']);
  });

  test('CS-9 and it declares docker\'s resolver', () => {
    expect(read(TEMPLATE)).toMatch(/^resolver 127\.0\.0\.11 valid=10s ipv6=off;$/m);
  });

  test('CS-9 each switchable vhost carries its 502 page, naming the service and its switch', () => {
    const blocks = serverBlocks(read(TEMPLATE));
    for (const [name, ssl, service, where] of PAGES) {
      const block = blocks.find((b) => b.name === name && b.ssl === ssl);
      expect(block, name).toBeDefined();
      expect(block!.body, name).toMatch(/^\s*error_page 502 @lu_unavailable;$/m);
      const page = block!.body.match(/location @lu_unavailable \{[^}]*return 502 "([^"]*)";/)?.[1] ?? '';
      expect(page, name).toContain(service);
      expect(page, name).toContain(where);
      expect(page, name).toContain('not running');
    }
  });

  test('CS-9 the negative: the always-on vhosts carry no such page', () => {
    const blocks = serverBlocks(read(TEMPLATE));
    for (const name of ALWAYS_ON) {
      const block = blocks.find((b) => b.name === name);
      expect(block, name).toBeDefined();
      expect(block!.body, name).not.toContain('@lu_unavailable');
    }
  });

  test('CS-9 and each ingress block carries a 502 page naming its port, Liquid and Which apps to run', () => {
    const heredoc = read(NGINX_SH).split('cat >> "$ingress_blocks" <<EOF')[1]?.split('\nEOF\n')[0] ?? '';
    expect(heredoc).toContain('server_name ${port}.liquid.localhost;');
    expect(heredoc).toMatch(/^\s*error_page 502 @lu_unavailable;$/m);
    expect(heredoc).toContain('location @lu_unavailable {');
    expect(heredoc).toContain(INGRESS_PAGE);
  });

  test.skipIf(!HAS_DA4E2D1)('CS-9 and the fixtures are da4e2d1\'s files, byte for byte (needs that commit in the history)', () => {
    for (const p of [TEMPLATE, NGINX_SH]) {
      expect(atMain(p), p).toBe(sh(['git', 'show', `da4e2d1:${p}`]).stdout);
    }
  });

  test('CS-9 and lu_proxy_identity reads the same single identity from it', () => {
    const lib = join(repoRoot, 'config/scripts/start/lib/proxy-identity.sh');
    const r = sh(['bash', '-c', '. "$1"; lu_proxy_identity "$2"', 'cs9', lib, join(repoRoot, TEMPLATE)]);
    expect({ code: r.code, stdout: r.stdout.trim() }).toEqual({ code: 0, stdout: 'user@nocodenation.org' });
  });
});
