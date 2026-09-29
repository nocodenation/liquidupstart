/**
 * M-B5 · Integration · A refused bundle that could not be moved says so
 *
 * Purpose:  Blocker 4 of the 2026-09-28 review. On Linux rootless Docker the
 *           drop directory is owned by container root while Liquid runs as
 *           `nifi` (uid 1000), so the entrypoint could not create `refused/`:
 *           the bundle stayed in `nar_extensions`, where the auto-loader picks
 *           it up within seconds — and the summary told the operator it was in
 *           `refused/`, out of the load path. The message was the opposite of
 *           what had happened.
 *
 *           Two changes. `start/liquid.sh` creates and chmods the quarantine
 *           beside the drop directory, as it already does for `api/`, so the
 *           move has somewhere to go. And when it still fails the summary says
 *           so separately, because "it is out of the load path" and "it is
 *           still in the load path" are not variations of one sentence.
 * Given:    `ghcr.io/nocodenation/liquid-nifi:latest`, a temporary NiFi home
 *           whose `lib` is the image's own, a drop directory holding a bundle
 *           `narcheck` refuses — a NAR with its `Nar-Dependency-*` manifest
 *           lines stripped, which B5-5 establishes is refused — and `refused`
 *           created as a **file**, so `mkdir -p` cannot succeed.
 *
 *           The permission failure itself cannot be produced on macOS: Docker
 *           Desktop ignores bind-mount ownership, which is why the original
 *           verification missed it. A `refused` that is a file reaches the same
 *           branch by the same route.
 * When:     The entrypoint's deployment section runs.
 * Then:     It reports the bundle as still in place, names the count, and does
 *           not claim it is in `refused/`.
 * Covers:   B5-8, B5-9, FR30, FR36
 * Unhappy:  B5-8 is the stuck bundle. B5-9 is the counterpart — with a writable
 *           quarantine the move happens and the message is the ordinary one, so
 *           the fix cannot be met by always warning.
 */
import { test, expect, describe } from 'bun:test';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const IMAGE = 'ghcr.io/nocodenation/liquid-nifi:latest';
const ENTRY = join(repoRoot, 'config/liquid/entrypoint.sh');
const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');

function runDeployment(quarantine: 'file' | 'directory') {
  const make =
    quarantine === 'file'
      ? 'touch "$HOME_DIR/nar_extensions/refused"'
      : 'mkdir -p "$HOME_DIR/nar_extensions/refused"';
  return sh([
    'docker', 'run', '--rm',
    '-v', `${ENTRY}:/probe/entrypoint.sh:ro`,
    '-v', `${NARCHECK}:/probe/narcheck.py:ro`,
    '--entrypoint', 'sh', IMAGE, '-c',
    `
    set -e
    HOME_DIR=/tmp/home
    mkdir -p "$HOME_DIR/nar_extensions"
    ln -s /opt/nifi/nifi-current/lib "$HOME_DIR/lib"
    python3 - <<'EOF'
import zipfile
src = "/opt/nifi/nifi-current/lib/nifi-kafka-nar-2.11.0.nar"
with zipfile.ZipFile(src) as zin, zipfile.ZipFile("/tmp/home/nar_extensions/orphan.nar", "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "META-INF/MANIFEST.MF":
            text = data.decode("utf-8", "replace")
            kept = [l for l in text.splitlines() if not l.lower().startswith("nar-dependency")]
            data = ("\\n".join(kept) + "\\n").encode()
        zout.writestr(item, data)
EOF
    ${make}
    cp /probe/narcheck.py /probe/entrypoint.sh /tmp/
    # The entrypoint runs its deployment section and then tries to start NiFi,
    # which this fixture has no configuration for; the first 80 lines are the
    # part under test.
    NIFI_HOME="$HOME_DIR" bash /tmp/entrypoint.sh 2>&1 | sed -n "1,80p"
    `
  ]);
}

describe('B5-8 a bundle that could not be quarantined is reported as still in place', () => {
  const r = runDeployment('file');

  test('B5-8 the summary names it, and does not say it was moved out', () => {
    expect(r.output).toContain('STILL IN PLACE');
    expect(r.output).toMatch(/auto-loader will load/);
  }, 900_000);

  test('B5-8 and it says why it usually happens', () => {
    expect(r.output).toContain('owned by root while Liquid runs as nifi');
  });
});

describe('B5-9 while a quarantine it can write is used quietly', () => {
  test('B5-9 the counterpart: the ordinary refusal message, and no warning', () => {
    const r = runDeployment('directory');
    expect(r.output).toMatch(/Moved to .*refused/);
    expect(r.output).not.toContain('STILL IN PLACE');
  }, 900_000);
});
