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
 *
 *           Two things the stand-in has to supply since the 2026-10-01 review was
 *           answered. The TLS stand-in now needs a `nifi` path to answer, because
 *           M4 gave the reachability probe `curl -f` and a 404 is a refusal; and
 *           the probe supplies a checker that permits with an empty
 *           `/liquid/api/lib-classes.txt`, because D2 made an unjudgeable build a
 *           refusal. Without either, every build here refuses and the stale
 *           artefact this file is about is never reached. B6-29 and B6-30 measure
 *           the gate itself, with the real checker.
 * When:     `build.sh build <dir>` runs against each.
 * Then:     The stale artefact is gone before the build, several are refused by
 *           name, and a single one is still deployed.
 * Covers:   B5-22, B5-23, B5-24, FR30
 * Unhappy:  B5-22 and B5-23 are the refusals. B5-24 is the counterpart -- an
 *           ordinary build still deploys, so neither guard can be met by
 *           refusing everything.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const IMAGE = builderImage();
const BUILD = join(repoRoot, 'config/nar_builder/build.sh');

let out = '';

beforeAll(() => {
  out = sh([
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '--entrypoint', 'sh', IMAGE, '-c',
    `
    mkdir -p /liquid/logs /liquid/api /repos /deploy/nar_extensions
    printf 'nifi_version=2.11.0\\njava_version=21.0.12+10-LTS\\n' > /liquid/api/runtime
    # The deployment gate, stood down on purpose. Since D2 build.sh refuses with 2
    # when it cannot judge a bundle, instead of deploying it with a warning; the gate
    # runs when /opt/builder/narcheck.py and the load index are both there, which in
    # the stack they are (narcheck mounted by compose.yml, the index written by Liquid
    # on every start) and in a throwaway container neither is. This case is about a
    # stale artefact in the source tree, not about narcheck, so it supplies a checker
    # that permits and an empty index: an EMPTY file, because build.sh runs the
    # checker as python3 narcheck.py, under which an empty file exits 0. B6-29 and
    # B6-30 are where the real gate is measured, against the real checker.
    : > /opt/builder/narcheck.py
    : > /liquid/api/lib-classes.txt
    openssl req -x509 -newkey rsa:2048 -keyout /tmp/k.pem -out /tmp/c.pem -days 1 \\
      -nodes -subj /CN=liquid >/dev/null 2>&1
    # The reachability probe sends curl -f .../nifi since M4, so a 404 from the
    # stand-in is a refusal now rather than a pass, and every build in this file
    # refused with "Liquid does not answer". SimpleHTTPRequestHandler serves its own
    # working directory, so the path has to exist there; a directory answers 301,
    # which is what the running Liquid answers to the same request.
    mkdir -p "$PWD/nifi"
    python3 - >/tmp/srv.log 2>&1 <<PY &
import http.server, ssl
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain("/tmp/c.pem", "/tmp/k.pem")
s = http.server.HTTPServer(("127.0.0.1", 9443), http.server.SimpleHTTPRequestHandler)
s.socket = ctx.wrap_socket(s.socket, server_side=True)
s.serve_forever()
PY
    # Waited on the stand-in answering, and said so when it never does. The loop
    # here was a bare && break with nothing after it, so when 12s was not enough --
    # under eight test files sharing a machine it is not -- it fell through in
    # silence and build.sh then refused with "Liquid does not answer", which reads
    # like a product refusal and is a fixture that did not wait. Corrected
    # 2026-10-07; the budget is 60s and a failure is named.
    standin=no
    for i in $(seq 1 200); do
      curl -sk -o /dev/null https://127.0.0.1:9443/ 2>/dev/null && { standin=yes; break; }
      sleep 0.3
    done
    echo "standin=$standin"
    export NAR_BUILD_LIQUID_HOST=127.0.0.1 SYSTEM_HTTPS_PORT=9443

    # An author pom that keeps its artefacts in nar/target, with one left over.
    mk() {
      rm -rf "/repos/$1"; mkdir -p "/repos/$1/nar/target"
      # nar/ carries a pom of its own, because that is the only way Maven can put
      # an artefact in nar/target. The fixture had none until 2026-10-05, which
      # made it a shape no real project has: since S7a the builder removes and
      # searches only a target/ sitting beside a pom.xml, so a pom-less
      # nar/target is neither cleaned nor counted and this whole scenario went
      # silent. Item 10 stays closed by the clean-up, where it was closed before.
      # No backticks in here: this block is a template literal, and one closed it.
      printf '<project><modelVersion>4.0.0</modelVersion><parent><groupId>g</groupId><artifactId>%s</artifactId><version>1.0.0</version></parent><artifactId>nar</artifactId></project>\n' "$1" > "/repos/$1/nar/pom.xml"
      printf '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>%s</artifactId><version>1.0.0</version><packaging>pom</packaging></project>\\n' "$1" > "/repos/$1/pom.xml"
      printf 'stale bundle from the source tree\\n' > "/repos/$1/nar/target/old-stale-0.9.nar"
    }
    # The stub is written OVER the real mvn, not placed first on PATH.
    #
    # run_maven goes through su, and su resets PATH to the system default
    # even without a dash, so a stub in /stub was never found and the REAL Maven ran
    # -- which then died as the unprivileged build user with
    # AccessDeniedException on /m2/org and took the whole scenario
    # with it, long before the code these cases are about. Corrected 2026-10-07.
    #
    # **And this file was green for a reason that had nothing to do with it being
    # right:** the host's nar-builder image predated the builder user, so
    # run_maven took its direct branch and the PATH worked. The image was rebuilt
    # on 2026-10-06 and the fixture stopped working the same day. A locally built
    # image can belong to another branch, and this is what that costs.
    #
    # The 755 is load-bearing: the build user has to be able to execute it.
        # No backticks in here: this block is a template literal, and they close it.
MVN_PATH="$(command -v mvn)"
    cat > "$MVN_PATH" <<'MVN'
#!/bin/sh
# A stand-in for maven: it compiles nothing and creates what MVN_MAKES names.
proj=""
for a in "$@"; do case "$a" in */pom.xml) proj="$(dirname "$a")";; esac; done
for n in \${MVN_MAKES:-}; do mkdir -p "\${proj}/nar/target"; printf 'built\\n' > "\${proj}/nar/target/$n"; done
exit 0
MVN
    chmod 755 "$MVN_PATH"

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

