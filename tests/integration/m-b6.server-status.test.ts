/**
 * B6-45 · Integration · The build server says which kind of no it is
 *
 * Purpose:  `build.sh` returned 2 both for a bundle refused on merit and for one
 *           nothing could judge, and `BuildServer` answers 2 with 422, so a
 *           caller reading the status was told its bundle was unprocessable when
 *           the checker or the index was unavailable. Since 2026-10-21 the
 *           cannot-judge arms return 5, which the server answers with 500, a
 *           fault of the installation, through its default -- `BuildServer.java`
 *           needs no change, and this file pins its whole map so a later one is
 *           seen. Not 503: that already means "two builds are already running",
 *           which a caller may retry, and a build nothing can judge comes back the
 *           same however often it is sent. The gate's half -- which status
 *           `judge_and_place` returns, and the case that goes red when 5 goes back
 *           to 2 -- is in tests/integration/m-b6.narcheck-unavailable.test.ts.
 * Given:    `BuildServer.java` from this checkout, compiled and run inside the
 *           builder image built from the tree under test, with a stub
 *           `/opt/builder/build.sh` that exits whatever `/tmp/next-exit` holds --
 *           the shape B5-10 to B5-12 use, so the call reaches the server and
 *           nothing else.
 * When:     `POST /build` is sent as the agents' client sends it, with
 *           `X-Liquid-Agent: 1` and no `Origin`, once per exit status 0, 2, 3, 4,
 *           5, 1 and 7.
 * Then:     0 -> 200, 2 -> 422, 3 -> 409, 4 -> 400, 5 -> 500, and 1 and 7 -> 500.
 * Covers:   B6-45, FR36a as amended 2026-10-21
 * Negative: 5 -> 500 rather than 422 is the case; the rest of the map is its
 *           counterpart, so a change that moved another row, or answered
 *           everything with 500, cannot pass.
 *
 * Test data: the stub `#!/bin/sh` / `exit "$(cat /tmp/next-exit)"`; the port
 * 8773, which no other case here uses; the request body `probe`, which the stub
 * ignores.
 */
import { test, expect, describe, beforeAll } from 'bun:test';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const IMAGE = builderImage();
const SERVER = join(repoRoot, 'config/nar_builder/BuildServer.java');
const STATUSES = [0, 2, 3, 4, 5, 1, 7];

let out = '';

beforeAll(() => {
  out = sh([
    'docker', 'run', '--rm',
    '-v', `${SERVER}:/probe/BuildServer.java:ro`,
    '--entrypoint', 'sh', IMAGE, '-c',
    `
    set -e
    mkdir -p /opt/builder
    printf '#!/bin/sh\\nexit "$(cat /tmp/next-exit)"\\n' > /opt/builder/build.sh
    chmod +x /opt/builder/build.sh
    javac -d /tmp/cls /probe/BuildServer.java
    NAR_BUILDER_PORT=8773 java -cp /tmp/cls BuildServer >/tmp/server.log 2>&1 &
    for i in $(seq 1 40); do curl -fsS http://127.0.0.1:8773/health >/dev/null 2>&1 && break; sleep 0.25; done
    for n in ${STATUSES.join(' ')}; do
      echo "$n" > /tmp/next-exit
      printf 'exit%s=%s\\n' "$n" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'X-Liquid-Agent: 1' --data-binary probe http://127.0.0.1:8773/build)"
    done
    `
  ]).output;
}, 900_000);

describe('B6-45 the build server answers "nothing could judge it" as its own fault', () => {
  test('B6-45 the negative: exit 5 is 500, not the refusal\'s 422', () => {
    expect(out).toContain('exit5=500');
  });

  test('B6-45 and the rest of the map is unchanged: 0, 2, 3, 4 and anything else', () => {
    const got = Object.fromEntries([...out.matchAll(/^exit(\d+)=(\d+)$/gm)].map((m) => [m[1], m[2]]));
    expect(got).toEqual({ '0': '200', '2': '422', '3': '409', '4': '400', '5': '500', '1': '500', '7': '500' });
  });
});
