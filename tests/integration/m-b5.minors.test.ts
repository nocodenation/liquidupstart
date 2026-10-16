/**
 * M-B5 · Integration · Three small ways the tools answered badly
 *
 * Purpose:  The minors of the 2026-09-28 review that are decision logic rather
 *           than prose.
 *
 *           `narcheck.py` caught `zipfile.BadZipFile` and `OSError` but not
 *           `zlib.error` or `NotImplementedError`, so a corrupt deflate entry
 *           printed a traceback where every other refusal prints a sentence. It
 *           still failed closed; the operator was handed a stack trace instead
 *           of a reason.
 *
 *           `entrypoint.sh` counted with `find -name "*.nar"`, which matches
 *           dot-files that the `"$DROP_DIR"/*.nar` glob it then loops over
 *           skips: three files, two bundles, "1 of 3".
 *
 *           `build.sh` trapped INT and TERM only. `set -e` is on, so any
 *           command failing between `mktemp -d` and the end left the work
 *           directory in /tmp.
 * Given:    `ghcr.io/nocodenation/liquid-nifi:latest` and
 *           `liquidupstart/nar-builder:latest`, with `narcheck.py`,
 *           `entrypoint.sh` and `build.sh` mounted in from this checkout.
 *           The stand-in answers a `nifi` path, which it did not have to before:
 *           M4 gave the reachability probe `curl -f`, so the 404 it used to return
 *           is a refusal now, and every build in this file refused with "Liquid
 *           does not answer" until the path existed. A directory answers 301,
 *           which is what the running Liquid answers to the same request.
 *           The corrupt bundle is a copy of the image's own
 *           `nifi-kafka-nar-2.11.0.nar` whose first bundled jar is stored
 *           uncompressed while both headers claim deflate -- the directory
 *           still parses and the entry cannot inflate.
 *           The inbox holds `good.nar` (a copy of that same kafka
 *           bundle), `.x.nar` (the same bytes under a dot-name) and `bad.nar`
 *           (the kafka bundle with its `Nar-Dependency-*` manifest lines
 *           stripped, which B5-5 establishes is refused).
 *           The build fixture is an author pom whose drop directory is a
 *           regular file, so the deploy step fails and the script leaves under
 *           `set -e` -- a route no cleanup was written for, and one that does
 *           not depend on permissions, which root ignores.
 * When:     `narcheck check` runs over the corrupt bundle and over a sound one,
 *           the entrypoint runs over the three files, and a build runs against
 *           the unusable drop directory.
 * Then:     A sentence rather than a traceback, a count of 2, and no work
 *           directory left in /tmp.
 * Covers:   B5-25, B5-26, B5-27, FR36
 * Unhappy:  B5-25 is the corrupt bundle; its counterpart is the sound one,
 *           which must still be accepted, so the repair cannot be met by
 *           refusing everything.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const LIQUID = 'ghcr.io/nocodenation/liquid-nifi:latest';
const BUILDER = builderImage();
const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');
const ENTRY = join(repoRoot, 'config/liquid/entrypoint.sh');
const BUILD = join(repoRoot, 'config/nar_builder/build.sh');
const LIB = '/opt/nifi/nifi-current/lib';
const KAFKA = `${LIB}/nifi-kafka-nar-2.11.0.nar`;

// Marks one entry as deflated while its bytes are stored. Writing invalid
// compressed data is the only way to reach zlib.error, and zipfile will not
// write it directly.
const CORRUPT = `
import struct, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zin:
    target = [n for n in zin.namelist() if n.endswith(".jar")][0]
    with zipfile.ZipFile(dst, "w") as zout:
        for item in zin.infolist():
            zout.writestr(item.filename, zin.read(item.filename), zipfile.ZIP_STORED)
raw = bytearray(open(dst, "rb").read())
name = target.encode()
at = raw.find(b"PK\\x03\\x04")
while at != -1:
    n = struct.unpack_from("<H", raw, at + 26)[0]
    if raw[at + 30:at + 30 + n] == name:
        struct.pack_into("<H", raw, at + 8, 8)
        break
    at = raw.find(b"PK\\x03\\x04", at + 1)
at = raw.find(b"PK\\x01\\x02")
while at != -1:
    n = struct.unpack_from("<H", raw, at + 28)[0]
    if raw[at + 46:at + 46 + n] == name:
        struct.pack_into("<H", raw, at + 10, 8)
        break
    at = raw.find(b"PK\\x01\\x02", at + 1)
open(dst, "wb").write(bytes(raw))
print("corrupted " + target)
`;

describe('B5-25 a bundle that cannot be read is refused in a sentence', () => {
  let out = '';
  beforeAll(() => {
    out = sh([
      'docker', 'run', '--rm',
      '-v', `${NARCHECK}:/probe/narcheck.py:ro`,
      '--entrypoint', 'sh', LIQUID, '-c',
      `
      python3 - ${KAFKA} /tmp/corrupt.nar <<'PY'
${CORRUPT}
PY
      echo "== corrupt =="
      python3 /probe/narcheck.py check /tmp/corrupt.nar ${LIB} 2>&1
      echo "corruptExit=$?"
      echo "== sound =="
      python3 /probe/narcheck.py check ${KAFKA} ${LIB} 2>&1
      echo "soundExit=$?"
      `
    ]).output;
  }, 900_000);

  test('B5-25 it says what could not be read, with no traceback', () => {
    expect(out).toContain('REFUSED');
    expect(out).toContain('could not be read out of the archive');
    expect(out).not.toContain('Traceback');
    expect(out).toContain('corruptExit=1');
  });

  test('B5-25 the counterpart: the same bundle intact is still accepted', () => {
    // Otherwise the repair could be met by refusing every archive.
    expect(out).toContain('soundExit=0');
  });
});

describe('B5-26 the count and the loop see the same files', () => {
  test('B5-26 a dot-file is in neither', () => {
    const r = sh([
      'docker', 'run', '--rm',
      '-v', `${ENTRY}:/probe/entrypoint.sh:ro`,
      '-v', `${NARCHECK}:/probe/narcheck.py:ro`,
      '--entrypoint', 'sh', LIQUID, '-c',
      `
      set -e
      export NIFI_HOME=/tmp/home
      mkdir -p "$NIFI_HOME/nar_inbox" "$NIFI_HOME/nar_extensions" "$NIFI_HOME/api"
      ln -s ${LIB} "$NIFI_HOME/lib"
      cp ${KAFKA} "$NIFI_HOME/nar_inbox/good.nar"
      cp ${KAFKA} "$NIFI_HOME/nar_inbox/.x.nar"
      python3 - <<'PY'
import zipfile
src = "${KAFKA}"
with zipfile.ZipFile(src) as zin, zipfile.ZipFile("/tmp/home/nar_inbox/bad.nar", "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "META-INF/MANIFEST.MF":
            text = data.decode("utf-8", "replace")
            kept = [l for l in text.splitlines() if not l.lower().startswith("nar-dependency")]
            data = ("\\n".join(kept) + "\\n").encode()
        zout.writestr(item, data)
PY
      cp /probe/narcheck.py /probe/entrypoint.sh /tmp/
      bash /tmp/entrypoint.sh 2>&1 | sed -n '1,60p'
      `
    ]);
    expect(r.output).toContain('Found 2 NAR file(s)');
    expect(r.output).toContain('1 of 2');
    expect(r.output).not.toContain('of 3');
  }, 900_000);
});

describe('B5-27 a build that stops early takes its work directory with it', () => {
  test('B5-27 nothing is left in /tmp', () => {
    const r = sh([
      'docker', 'run', '--rm',
      '-v', `${BUILD}:/probe/build.sh:ro`,
      '--entrypoint', 'sh', BUILDER, '-c',
      `
      mkdir -p /liquid/api /repos
      printf 'nifi_version=2.11.0\\njava_version=21.0.12+10-LTS\\n' > /liquid/api/runtime
      openssl req -x509 -newkey rsa:2048 -keyout /tmp/k.pem -out /tmp/c.pem -days 1 \\
        -nodes -subj /CN=liquid >/dev/null 2>&1
      # The reachability probe sends curl -f .../nifi since M4, so a 404 from the
      # stand-in is a refusal now rather than a pass, and every build in this file
      # refused with "Liquid does not answer". SimpleHTTPRequestHandler serves its own
      # working directory, so the path has to exist there; a directory answers 301,
      # which is what the running Liquid answers to the same request.
      mkdir -p "$PWD/nifi"
      python3 - >/dev/null 2>&1 <<PY &
import http.server, ssl
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain("/tmp/c.pem", "/tmp/k.pem")
s = http.server.HTTPServer(("127.0.0.1", 9443), http.server.SimpleHTTPRequestHandler)
s.socket = ctx.wrap_socket(s.socket, server_side=True)
s.serve_forever()
PY
      for i in $(seq 1 40); do curl -sk -o /dev/null https://127.0.0.1:9443/ 2>/dev/null && break; sleep 0.3; done
      export NAR_BUILD_LIQUID_HOST=127.0.0.1 SYSTEM_HTTPS_PORT=9443
      mkdir -p /repos/p
      printf '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>p</artifactId><version>1.0.0</version><packaging>pom</packaging></project>\\n' > /repos/p/pom.xml
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
proj=""
for a in "$@"; do case "$a" in */pom.xml) proj="$(dirname "$a")";; esac; done
# Into the project's own target, beside its pom: since S7a a bundle counts only
# in a target/ next to a pom.xml, and a pom-less nar/target left this case
# refusing with 2 for "produced no .nar" before it ever reached the deploy step
# the sabotage below is about.
mkdir -p "\${proj}/target"; printf 'built\\n' > "\${proj}/target/fresh-1.0.0.nar"
exit 0
MVN
      chmod 755 "$MVN_PATH"
      # A drop directory that is a regular file: the deploy step fails and the
      # script leaves under set -e, which is the route with no cleanup.
      # /deploy is created by the image this case does not rebuild -- it runs
      # against liquidupstart/nar-builder:latest with build.sh mounted in, which
      # is S9a. Made here so the sabotage does not depend on the image's age.
      mkdir -p /deploy && rm -rf /deploy/nar_extensions && printf 'x\\n' > /deploy/nar_extensions
      before="$(ls -d /tmp/tmp.* 2>/dev/null | wc -l)"
      sh /probe/build.sh build p >/dev/null 2>&1
      echo "buildExit=$?"
      echo "leaked=$(( $(ls -d /tmp/tmp.* 2>/dev/null | wc -l) - before ))"
      `
    ]);
    // The build has to have failed, or "nothing left behind" is trivially true.
    expect(r.output).toContain('buildExit=1');
    expect(r.output).toContain('leaked=0');
  }, 900_000);
});

