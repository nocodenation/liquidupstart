/**
 * M-B5 · Integration · Where the target versions come from
 *
 * Purpose:  Item 7 of the 2026-09-28 review. The NiFi and Java versions a
 *           bundle is compiled against were read from the
 *           `Starting NiFi <v> using Java <v>` line in `nifi-app*.log`. NiFi's
 *           stock logback rotates that file hourly and keeps 30, so roughly
 *           thirty hours after a start the line is gone and every `nar-build`
 *           and `--target` answered "ask the operator to restart Liquid" --
 *           against the promise that deploying a bundle needs no restart.
 *
 *           Liquid's entrypoint now records both versions in
 *           `volumes/liquid/api/runtime`, beside the load index it already
 *           writes there and already mounts read-only into the builder. The
 *           distribution carries both facts without the log: `lib/` names the
 *           NiFi version in its own jars, and the JVM reports its build.
 * Given:    `liquidupstart/nar-builder:latest` with `build.sh` mounted in from
 *           this checkout, an empty `/liquid/logs`, and a TLS stand-in on
 *           127.0.0.1:9443 so the reachability gate passes without the stack.
 *           The record holds the values the real image produces:
 *           `nifi_version=2.11.0`, `java_version=21.0.12+10-LTS` -- the same
 *           pair the log line of 2026-09-28 08:24:12 carried.
 *           And `ghcr.io/nocodenation/liquid-nifi:latest` with `entrypoint.sh`
 *           and `narcheck.py` mounted in, its own `lib` as the NiFi home's.
 * When:     `build.sh target` runs with the record alone, with the log alone,
 *           and with neither; and the entrypoint runs in the real image.
 * Then:     The record answers, the log still answers when the record is
 *           absent, nothing is guessed when both are, and the entrypoint writes
 *           the pair the log line would have carried.
 * Covers:   B5-15, B5-16, B5-17, B5-18, FR21, FR23
 * Unhappy:  B5-17 is the refusal. B5-15 and B5-16 are its counterparts -- a
 *           builder that refused everything would satisfy B5-17 on its own, and
 *           B5-16 keeps the fix from breaking an installation whose Liquid
 *           started before the record existed.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const BUILDER = builderImage();
const LIQUID = 'ghcr.io/nocodenation/liquid-nifi:latest';
const BUILD = join(repoRoot, 'config/nar_builder/build.sh');
const ENTRY = join(repoRoot, 'config/liquid/entrypoint.sh');
const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');

// The line as logback wrote it on 2026-09-28, which is where these values come
// from and what the record has to reproduce.
const START_LINE =
  '2026-09-28 08:24:12,141 INFO [main] org.apache.nifi.runtime.Application ' +
  'Starting NiFi 2.11.0 using Java 21.0.12+10-LTS with PID 80';

let out = '';

beforeAll(() => {
  out = sh([
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '--entrypoint', 'sh', BUILDER, '-c',
    `
    mkdir -p /liquid/logs /liquid/api
    openssl req -x509 -newkey rsa:2048 -keyout /tmp/k.pem -out /tmp/c.pem -days 1 \\
      -nodes -subj /CN=liquid >/dev/null 2>&1
    python3 - >/tmp/srv.log 2>&1 <<PY &
import http.server, ssl
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain("/tmp/c.pem", "/tmp/k.pem")
s = http.server.HTTPServer(("127.0.0.1", 9443), http.server.SimpleHTTPRequestHandler)
s.socket = ctx.wrap_socket(s.socket, server_side=True)
s.serve_forever()
PY
    for i in \$(seq 1 40); do curl -sk -o /dev/null https://127.0.0.1:9443/ 2>/dev/null && break; sleep 0.3; done
    export NAR_BUILD_LIQUID_HOST=127.0.0.1 SYSTEM_HTTPS_PORT=9443

    # Thirty hours after the start: the record is there, every log is gone.
    printf 'nifi_version=2.11.0\\njava_version=21.0.12+10-LTS\\n' > /liquid/api/runtime
    echo "== recordOnly =="
    sh /probe/build.sh target 2>&1

    # An installation whose Liquid started before the record existed.
    rm -f /liquid/api/runtime
    printf '%s\\n' "${START_LINE}" > /liquid/logs/nifi-app_2026-09-28_08.0.log
    echo "== logOnly =="
    sh /probe/build.sh target 2>&1

    echo "== neither =="
    rm -f /liquid/logs/nifi-app_2026-09-28_08.0.log
    sh /probe/build.sh target 2>&1
    `
  ]).output;
}, 900_000);

const section = (name: string) => {
  const parts = out.split(/^== (\w+) ==$/m);
  const at = parts.indexOf(name);
  return at === -1 ? '' : parts[at + 1];
};

describe('B5-15 the record answers when no log does', () => {
  test('B5-15 the versions are read with every nifi-app log gone', () => {
    const s = section('recordOnly');
    expect(s).toContain('nifi_version 2.11.0');
    expect(s).toContain('java_version 21.0.12+10-LTS');
    expect(s).toContain('java_major 21');
    expect(s).not.toContain('refused');
  });

  test('B5-15 and it says which source it read', () => {
    // The operator has to be able to tell the durable source from the one that
    // expires, because only one of them explains a refusal.
    expect(section('recordOnly')).toContain('read_from liquid at 127.0.0.1:9443 (runtime)');
  });
});

describe('B5-16 while a Liquid that predates the record still builds', () => {
  test('B5-16 the counterpart: the startup line is still read', () => {
    // Otherwise every installation would have to restart Liquid once to keep
    // building -- the exact demand item 7 is about.
    const s = section('logOnly');
    expect(s).toContain('nifi_version 2.11.0');
    expect(s).toContain('java_version 21.0.12+10-LTS');
    expect(s).toContain('(nifi-app_2026-09-28_08.0.log)');
  });
});

describe('B5-17 and nothing is guessed when neither is there', () => {
  test('B5-17 the build refuses and names both sources', () => {
    const s = section('neither');
    expect(s).toContain('nar-build refused');
    expect(s).toContain('/liquid/api/runtime');
    expect(s).toContain('/liquid/logs');
    expect(s).not.toContain('nifi_version 2');
  });
});

describe('B5-18 the record is written from the distribution itself', () => {
  let published = '';
  beforeAll(() => {
    published = sh([
      'docker', 'run', '--rm',
      '-v', `${ENTRY}:/probe/entrypoint.sh:ro`,
      '-v', `${NARCHECK}:/probe/narcheck.py:ro`,
      '--entrypoint', 'sh', LIQUID, '-c',
      `
      set -e
      export NIFI_HOME=/tmp/home
      mkdir -p "$NIFI_HOME/api" "$NIFI_HOME/nar_inbox" "$NIFI_HOME/nar_extensions"
      ln -s /opt/nifi/nifi-current/lib "$NIFI_HOME/lib"
      cp /probe/narcheck.py /probe/entrypoint.sh /tmp/
      bash /tmp/entrypoint.sh >/tmp/boot.log 2>&1 || true
      sed -n '1,80p' /tmp/boot.log | grep -i "runtime versions" || true
      echo "== record =="
      cat "$NIFI_HOME/api/runtime" 2>&1
      `
    ]).output;
  }, 900_000);

  test('B5-18 it names the versions the startup line carries', () => {
    // Tied to the line itself rather than to a constant: if the image is
    // upgraded, both move together and the case still says something.
    const logged = START_LINE.match(/Starting NiFi (\S+) using Java (\S+)/);
    expect(logged).not.toBeNull();
    expect(published).toContain(`nifi_version=${logged![1]}`);
    expect(published).toContain(`java_version=${logged![2]}`);
  });

  test('B5-18 and the start says so, so a missing record is visible', () => {
    expect(published).toContain('Published the runtime versions for the NAR builder');
  });
});

