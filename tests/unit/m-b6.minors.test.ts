/**
 * M-B6 · Unit · Three minors of the 2026-10-01 review
 *
 * Purpose:  M7, M8 and M3. They share nothing but their size, and they are in one
 *           file because each is a few lines and a reviewer reads them together.
 *
 *           **M7 — narcheck held a whole bundle in memory with no cap.**
 *           `bundle_classes` keeps every class file's bytes at once so the
 *           constant pool can be parsed, and a bundle could ask the process for
 *           as much as its central directory declared. It fails closed on a
 *           crash, so this is a resource question rather than a correctness one.
 *           Measured over the stock image, the largest real bundle declares
 *           **187.2 MB** of classes — `nifi-aws-nar-2.11.0.nar` — so the limit is
 *           512 MiB, 2.7 times the worst thing this stack ships. A lower number
 *           would refuse that bundle, and a false refusal is what the documents
 *           call worse than no check at all.
 *
 *           **M8 — `--data-binary` reads a leading `@` as a file reference.** A
 *           directory under `/repos` named `@something` was sent to the builder
 *           as that file's contents rather than as the path. One word:
 *           `--data-raw`.
 *
 *           **M3 — `NAR_BUILDER_TEST_HOOKS` was declared only in `compose.yml`.**
 *           `.env.example` is the contract, and a key a test run may flip belongs
 *           in it. At 1 the builder honours `X-Liquid-Host` and
 *           `X-Nifi-Api-Probe-Version` from any caller that gets past the vhost,
 *           so a run that leaves it set lets a later caller point the version
 *           probe at another host.
 * Given:    A bundle that **declares** 600 MB of classes and costs 597 KB on
 *           disk — 600 MB of zero bytes, deflated — so the budget can be reached
 *           without a 600 MB fixture; a library holding one nifi-api jar, so
 *           there is something to judge against; and the three files themselves.
 * When:     narcheck checks the oversized bundle; curl is handed a payload
 *           beginning with `@`; and the two declarations are compared.
 * Then:     The bundle is refused with the limit named and nothing unpacked; curl
 *           sends the literal rather than a file; and the key is in both places.
 * Covers:   B6-24, B6-25, B6-26, NFR2
 * Unhappy:  B6-24's refusal is the unhappy case and its counterpart is in the
 *           same test: the largest bundle the stock image ships is still
 *           permitted, measured in the image. Without that, the limit could be
 *           met by refusing everything.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { guard, fakeApiJar, scratch, discardScratch } from '../lib/narcheckfixture';

const work = join(scratch(), 'b6-minors');
mkdirSync(work, { recursive: true });
afterAll(() => discardScratch());

const lib = join(work, 'lib');
fakeApiJar(lib, 'nifi-api-0.0.0-probe.jar', ['org/apache/nifi/processor/Processor.class']);

// 600 MB declared, a few hundred KB stored. The budget is read off the central
// directory, so this is the whole fixture a 512 MiB limit needs.
const huge = join(work, 'huge.nar');
const made = sh([
  'python3', '-c',
  'import zipfile,sys\n' +
    'z = zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED)\n' +
    'z.writestr("org/probe/Big.class", b"\\0" * (600 << 20))\n' +
    'z.close()',
  huge
]);
if (made.code !== 0) throw new Error(`could not write the oversized fixture: ${made.output}`);

describe('B6-24 a bundle is refused unread when it declares more than the limit', () => {
  test('B6-24 the fixture declares far more than it costs', () => {
    // The premise, and the reason this case is cheap: the limit is reached from
    // the central directory, so the bytes never have to exist.
    const onDisk = statSync(huge).size;
    expect(onDisk).toBeLessThan(5 << 20);
    const declared = sh([
      'python3', '-c',
      'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\n' +
        'print(sum(i.file_size for i in z.infolist()))',
      huge
    ]);
    expect(Number(declared.stdout.trim())).toBe(600 << 20);
  });

  test('B6-24 it is refused, and the message names the limit', () => {
    const r = guard(huge, lib);
    expect(r.code).toBe(1);
    expect(r.output).toContain('629145600 bytes, past the 536870912-byte limit');
    expect(r.output).toContain('nothing here will unpack it');
  });

  test('B6-24 the counterpart: the largest bundle the image ships still passes', () => {
    // 187.2 MB declared, measured over all 118 NARs. Without this the limit could
    // be met by refusing everything, which the documents call worse than no
    // check -- and it is the reason the number is 512 MiB and not 256.
    const r = sh([
      'docker', 'run', '--rm',
      '-v', `${join(repoRoot, 'config/liquid/narcheck.py')}:/narcheck.py:ro`,
      '--entrypoint', 'sh', 'ghcr.io/nocodenation/liquid-nifi:latest',
      '-c', 'python3 /narcheck.py check /opt/nifi/nifi-current/lib/nifi-aws-nar-2.11.0.nar ' +
            '/opt/nifi/nifi-current/lib'
    ]);
    expect(r.code).toBe(0);
  }, 600_000);
});

describe('B6-25 a path beginning with @ is sent as a path', () => {
  test('B6-25 the premise: curl reads a leading @ as a file with --data-binary', () => {
    // Measured rather than assumed, because the whole minor rests on it -- and it
    // needs a receiver: without a connection curl sends nothing and a trace shows
    // nothing, which is how the first version of this came back green-for-nothing.
    // A one-request server writes down what each flag actually put on the wire.
    const dir = join(work, 'at');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'acme'), 'LEAKED\n');
    const r = sh([
      'python3', '-c',
      [
        'import http.server, os, subprocess, threading, sys',
        'seen = []',
        'class H(http.server.BaseHTTPRequestHandler):',
        '    def do_POST(self):',
        '        n = int(self.headers.get("Content-Length", 0))',
        '        seen.append(self.rfile.read(n))',
        '        self.send_response(200); self.end_headers()',
        '    def log_message(self, *a): pass',
        'srv = http.server.HTTPServer(("127.0.0.1", 0), H)',
        'port = srv.server_address[1]',
        'threading.Thread(target=srv.serve_forever, daemon=True).start()',
        'url = "http://127.0.0.1:%d/" % port',
        'for flag in ("--data-binary", "--data-raw"):',
        '    subprocess.run(["curl", "-s", "-o", os.devnull, flag, "@acme", url],',
        '                   cwd=sys.argv[1], check=True)',
        'print("binary=%r" % seen[0])',
        'print("raw=%r" % seen[1])'
      ].join('\n'),
      dir
    ]);
    expect(r.code).toBe(0);
    expect({
      binaryReadTheFile: r.stdout.includes("binary=b'LEAKED"),
      rawSentTheLiteral: r.stdout.includes("raw=b'@acme'")
    }).toEqual({ binaryReadTheFile: true, rawSentTheLiteral: true });
  });

  test('B6-25 and nar-build uses the one that does not', () => {
    const script = readFileSync(join(repoRoot, 'config/agents/bin/nar-build.sh'), 'utf8');
    expect({
      raw: script.includes('--data-raw "$payload"'),
      binary: script.includes('--data-binary "$payload"')
    }).toEqual({ raw: true, binary: false });
  });
});

describe('B6-26 a key a test run may flip is in the contract', () => {
  test('B6-26 NAR_BUILDER_TEST_HOOKS is in .env.example as well as compose.yml', () => {
    const env = readFileSync(join(repoRoot, '.env.example'), 'utf8');
    const compose = readFileSync(join(repoRoot, 'compose.yml'), 'utf8');
    expect({
      inContract: /^NAR_BUILDER_TEST_HOOKS=0$/m.test(env),
      inCompose: compose.includes('NAR_BUILDER_TEST_HOOKS: ${NAR_BUILDER_TEST_HOOKS:-0}')
    }).toEqual({ inContract: true, inCompose: true });
  });

  test('B6-26 and it is kept out of the configuration view', () => {
    // It is documentation, not a setting anyone should reach for: the marker in
    // the banner is what the dashboard turns into a hidden entry.
    const env = readFileSync(join(repoRoot, '.env.example'), 'utf8');
    const section = env.slice(env.indexOf('NAR_BUILDER_TEST_HOOKS') - 1200);
    expect(section).toContain('DO NOT SHOW UI');
  });
});
