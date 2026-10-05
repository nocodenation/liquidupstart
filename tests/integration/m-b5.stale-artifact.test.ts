/**
 * M-B5 · Integration · What the build deploys is what the build produced
 *
 * Purpose:  Item 10 of the 2026-09-28 review. In author-pom mode the copy
 *           removed only the top-level `target/` and `.git`, and the deploy
 *           step took the first `<module>/target/` NAR in directory order. A
 *           multi-module author pom keeps its artefacts in `nar/target`, so a
 *           leftover `nar/target/old-stale-0.9.nar` from the source tree came
 *           back as `built old-stale-0.9.nar` / `wrote
 *           /deploy/nar_extensions/old-stale-0.9.nar` / HTTP 200 -- an artefact nobody
 *           built in this run, deployed into the live drop directory. A project
 *           that produces several silently deployed one of them.
 * Given:    `liquidupstart/nar-builder:latest` with `build.sh` mounted in from
 *           this checkout, a TLS stand-in on 127.0.0.1:9443 and
 *           `/liquid/api/runtime` holding `nifi_version=2.11.0` and
 *           `java_version=21.0.12+10-LTS`, so the target resolves without the
 *           stack. Maven is a stand-in on PATH that compiles nothing and
 *           creates exactly the files `MVN_MAKES` names, so what reaches the
 *           deploy step is decided by the fixture rather than by a real build.
 *
 *           Three source directories, each an author pom with
 *           `<packaging>pom</packaging>` and a stale
 *           `nar/target/old-stale-0.9.nar` holding the line
 *           `stale bundle from the source tree`:
 *           `stale-proj` where the stand-in produces nothing, `two-proj` where
 *           it produces `a-1.0.0.nar` and `b-1.0.0.nar`, and `one-proj` where
 *           it produces `fresh-1.0.0.nar`.
 * When:     `build.sh build <dir>` runs against each.
 * Then:     The stale artefact is gone before the build, several are refused by
 *           name, and a single one is still deployed.
 * Covers:   B5-22, B5-23, B5-24, FR30
 * Unhappy:  B5-22 and B5-23 are the refusals. B5-24 is the counterpart -- an
 *           ordinary build still deploys, so neither guard can be met by
 *           refusing everything.
 */
import { test, expect, describe, beforeAll } from 'bun:test';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const IMAGE = 'liquidupstart/nar-builder:latest';
const BUILD = join(repoRoot, 'config/nar_builder/build.sh');

let out = '';

beforeAll(() => {
  out = sh([
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '--entrypoint', 'sh', IMAGE, '-c',
    `
    mkdir -p /liquid/logs /liquid/api /repos /deploy/nar_extensions /stub
    printf 'nifi_version=2.11.0\\njava_version=21.0.12+10-LTS\\n' > /liquid/api/runtime
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
    for i in $(seq 1 40); do curl -sk -o /dev/null https://127.0.0.1:9443/ 2>/dev/null && break; sleep 0.3; done
    export NAR_BUILD_LIQUID_HOST=127.0.0.1 SYSTEM_HTTPS_PORT=9443

    # An author pom that keeps its artefacts in nar/target, with one left over.
    mk() {
      rm -rf "/repos/$1"; mkdir -p "/repos/$1/nar/target"
      printf '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>%s</artifactId><version>1.0.0</version><packaging>pom</packaging></project>\\n' "$1" > "/repos/$1/pom.xml"
      printf 'stale bundle from the source tree\\n' > "/repos/$1/nar/target/old-stale-0.9.nar"
    }
    cat > /stub/mvn <<'MVN'
#!/bin/sh
# A stand-in for maven: it compiles nothing and creates what MVN_MAKES names.
proj=""
for a in "$@"; do case "$a" in */pom.xml) proj="$(dirname "$a")";; esac; done
for n in \${MVN_MAKES:-}; do mkdir -p "\${proj}/nar/target"; printf 'built\\n' > "\${proj}/nar/target/$n"; done
exit 0
MVN
    chmod +x /stub/mvn
    export PATH=/stub:$PATH

    echo "== stale =="
    mk stale-proj; MVN_MAKES="" sh /probe/build.sh build stale-proj 2>&1
    echo "dropAfterStale=[$(ls -A /deploy/nar_extensions | tr '\\n' ' ')]"

    echo "== several =="
    mk two-proj; MVN_MAKES="a-1.0.0.nar b-1.0.0.nar" sh /probe/build.sh build two-proj 2>&1
    echo "dropAfterSeveral=[$(ls -A /deploy/nar_extensions | tr '\\n' ' ')]"

    echo "== one =="
    mk one-proj; MVN_MAKES="fresh-1.0.0.nar" sh /probe/build.sh build one-proj 2>&1
    echo "dropAfterOne=[$(ls -A /deploy/nar_extensions | tr '\\n' ' ')]"
    `
  ]).output;
}, 900_000);

const section = (name: string) => {
  const parts = out.split(/^== (\w+) ==$/m);
  const at = parts.indexOf(name);
  return at === -1 ? '' : parts[at + 1];
};

describe('B5-22 a stale artefact in the source tree is not a build result', () => {
  test('B5-22 a build that produced nothing says so', () => {
    const s = section('stale');
    expect(s).toContain('produced no .nar');
    expect(s).not.toContain('built old-stale-0.9.nar');
  });

  test('B5-22 and nothing was written to the drop directory', () => {
    // The whole of the finding: the file that landed there was never built.
    expect(section('stale')).toContain('dropAfterStale=[]');
  });
});

describe('B5-23 and several are refused rather than one picked', () => {
  test('B5-23 the refusal names how many and which', () => {
    const s = section('several');
    expect(s).toContain('produced 2 NAR files');
    expect(s).toContain('a-1.0.0.nar');
    expect(s).toContain('b-1.0.0.nar');
  });

  test('B5-23 and neither was deployed', () => {
    expect(section('several')).toContain('dropAfterSeveral=[]');
  });
});

describe('B5-24 while an ordinary build still deploys', () => {
  test('B5-24 the counterpart: one artefact goes through', () => {
    const s = section('one');
    expect(s).toContain('built fresh-1.0.0.nar');
    expect(s).toContain('wrote /deploy/nar_extensions/fresh-1.0.0.nar');
    expect(s).toContain('dropAfterOne=[fresh-1.0.0.nar ]');
  });
});
