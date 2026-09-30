/**
 * M-B5 · System · A bundle dropped by hand is judged before it loads
 *
 * Purpose:  Item 11 of the 2026-09-28 review. The image's own `start.sh` sets
 *           `nifi.nar.library.autoload.directory` to
 *           `${NIFI_HOME}/nar_extensions` on every start, and the operator's
 *           drop directory was mounted exactly there. So a bundle copied in by
 *           hand -- the path M-B4 exists for, and what SKILL.md step 2 tells
 *           agents to do -- was loaded within seconds without being judged.
 *           Measured by the reviewer and reproduced here: a bundle `narcheck`
 *           refuses, dropped into a running NiFi, `Loaded extensions for
 *           org.nocodenation.review:probe-refused-nar:1.0.0` about five seconds
 *           later. FR30 "judged before it lands" and FR36 "never enters the
 *           catalogue" held for `nar-build` alone.
 *
 *           The two directories are separate now. `nar_inbox` is the bind mount
 *           everyone writes to; `nar_extensions` is the load directory inside
 *           the container, and `nar-watch.sh` is the only thing that writes to
 *           it. A bundle reaches the catalogue by passing the check, on either
 *           route.
 * Given:    `ghcr.io/nocodenation/liquid-nifi:latest` booted for real with
 *           `entrypoint.sh`, `narcheck.py` and `nar-watch.sh` from this checkout
 *           and a host directory mounted at `nar_inbox`. Two bundles, both built
 *           in the image from its own `nifi-kafka-nar-2.11.0.nar` with the
 *           coordinates rewritten to `org.nocodenation.review`, so each is a new
 *           bundle NiFi has not already loaded:
 *           `probe-sound-1.0.0.nar` keeps its `Nar-Dependency-*` manifest lines
 *           and `narcheck` accepts it; `probe-refused-1.0.0.nar` has them
 *           stripped and `narcheck` refuses it, naming
 *           `org.apache.nifi.processor.util.FlowFileFilters` among others.
 * When:     Both are copied into the inbox after the auto-loader thread has
 *           started, and both are present in the inbox before a second
 *           container starts.
 * Then:     The refused bundle is in `nar_inbox/refused/`, is not in the load
 *           directory, and NiFi never reports loading it. The sound one is
 *           loaded on both routes.
 * Covers:   B5-28, B5-29, B5-30, FR30, FR36
 * Unhappy:  B5-28 is the refusal. B5-29 and B5-30 are its counterparts -- a
 *           split that loaded nothing would satisfy B5-28 perfectly, so a sound
 *           bundle has to reach the catalogue by both the hand drop and the
 *           boot pass.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, chmodSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const IMAGE = 'ghcr.io/nocodenation/liquid-nifi:latest';
const SOUND = 'probe-sound-1.0.0.nar';
const REFUSED = 'probe-refused-1.0.0.nar';

// Rewrites the coordinates so NiFi sees a bundle it has not already loaded, and
// optionally drops the parent declaration, which B5-5 establishes is refused.
const MAKE = `
import zipfile
src = "/opt/nifi/nifi-current/lib/nifi-kafka-nar-2.11.0.nar"
def rewrite(dst, artifact, drop_parent):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "META-INF/MANIFEST.MF":
                lines = []
                for l in data.decode("utf-8", "replace").splitlines():
                    low = l.lower()
                    if drop_parent and low.startswith("nar-dependency"):
                        continue
                    if low.startswith("nar-id:"):
                        l = "Nar-Id: " + artifact
                    elif low.startswith("nar-group:"):
                        l = "Nar-Group: org.nocodenation.review"
                    elif low.startswith("nar-version:"):
                        l = "Nar-Version: 1.0.0"
                    lines.append(l)
                data = ("\\n".join(lines) + "\\n").encode()
            zout.writestr(item, data)
rewrite("/out/${SOUND}", "probe-sound-nar", False)
rewrite("/out/${REFUSED}", "probe-refused-nar", True)
print("built both")
`;

const mounts = (inbox: string) => [
  '-v', `${join(repoRoot, 'config/liquid/entrypoint.sh')}:/opt/nifi/scripts/entrypoint.sh:ro`,
  '-v', `${join(repoRoot, 'config/liquid/narcheck.py')}:/opt/nifi/scripts/narcheck.py:ro`,
  '-v', `${join(repoRoot, 'config/liquid/nar-watch.sh')}:/opt/nifi/scripts/nar-watch.sh:ro`,
  '-v', `${inbox}:/opt/nifi/nifi-current/nar_inbox`,
  '-e', 'SINGLE_USER_CREDENTIALS_USERNAME=liquid',
  '-e', 'SINGLE_USER_CREDENTIALS_PASSWORD=liquidpassword1234',
  '-e', 'NIFI_WEB_HTTPS_PORT=8443'
];

function waitForLog(name: string, needle: string, seconds: number): boolean {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (sh(['docker', 'logs', name]).output.includes(needle)) return true;
    Bun.sleepSync(2000);
  }
  return false;
}

const work = mkdtempSync(join(tmpdir(), 'lu-b5-drop-'));
const bundles = join(work, 'bundles');
const inboxLive = join(work, 'inbox-live');
const inboxBoot = join(work, 'inbox-boot');
for (const d of [bundles, inboxLive, inboxBoot]) {
  sh(['mkdir', '-p', d]);
  chmodSync(d, 0o777);
}

let liveLog = '';
let liveInbox = '';
let bootLog = '';
let bootDirs = '';

beforeAll(() => {
  sh(['docker', 'run', '--rm', '-v', `${bundles}:/out`, '--entrypoint', 'sh', IMAGE, '-c',
    `python3 - <<'PY'\n${MAKE}\nPY`]);

  // Route one: dropped by hand into a Liquid that is already running.
  sh(['docker', 'rm', '-f', 'lu-b5-live']);
  sh(['docker', 'run', '-d', '--name', 'lu-b5-live', ...mounts(inboxLive),
    '--entrypoint', '/opt/nifi/scripts/entrypoint.sh', IMAGE]);
  expect(waitForLog('lu-b5-live', 'Starting NAR Auto-Loader Thread', 400)).toBe(true);
  for (const n of [SOUND, REFUSED]) copyFileSync(join(bundles, n), join(inboxLive, n));
  waitForLog('lu-b5-live', `Loaded extensions for org.nocodenation.review:probe-sound-nar`, 120);
  liveLog = sh(['docker', 'logs', 'lu-b5-live']).output;
  liveInbox = sh(['docker', 'exec', 'lu-b5-live', 'sh', '-c',
    'echo load=$(ls -A /opt/nifi/nifi-current/nar_extensions | tr "\\n" ",") ' +
    'refused=$(ls -A /opt/nifi/nifi-current/nar_inbox/refused | tr "\\n" ",")']).output;

  // Route two: both already in the inbox when the container starts.
  for (const n of [SOUND, REFUSED]) copyFileSync(join(bundles, n), join(inboxBoot, n));
  sh(['docker', 'rm', '-f', 'lu-b5-boot']);
  sh(['docker', 'run', '-d', '--name', 'lu-b5-boot', ...mounts(inboxBoot),
    '--entrypoint', '/opt/nifi/scripts/entrypoint.sh', IMAGE]);
  waitForLog('lu-b5-boot', 'Found 1 initial NARs from directory nar_extensions', 400);
  bootLog = sh(['docker', 'logs', 'lu-b5-boot']).output;
  bootDirs = sh(['docker', 'exec', 'lu-b5-boot', 'sh', '-c',
    'echo load=$(ls -A /opt/nifi/nifi-current/nar_extensions | tr "\\n" ",") ' +
    'refused=$(ls -A /opt/nifi/nifi-current/nar_inbox/refused | tr "\\n" ",")']).output;
}, 1_800_000);

afterAll(() => {
  sh(['docker', 'rm', '-f', 'lu-b5-live']);
  sh(['docker', 'rm', '-f', 'lu-b5-boot']);
  rmSync(work, { recursive: true, force: true });
});

describe('B5-28 a refused bundle never reaches the catalogue by either route', () => {
  test('B5-28 dropped by hand, it is quarantined and not loaded', () => {
    expect(liveLog).toContain(`REFUSED ${REFUSED}`);
    expect(liveInbox).toContain(`refused=${REFUSED}`);
    expect(liveInbox).not.toContain(`load=${REFUSED}`);
    // The whole of the finding: this line is what the reviewer measured.
    expect(liveLog).not.toContain('Loaded extensions for org.nocodenation.review:probe-refused-nar');
  });

  test('B5-28 and present at start, it is quarantined before NiFi runs', () => {
    expect(bootDirs).toContain(`refused=${REFUSED}`);
    expect(bootLog).not.toContain('Loaded extensions for org.nocodenation.review:probe-refused-nar');
  });
});

describe('B5-29 while a sound bundle still loads within seconds', () => {
  test('B5-29 the counterpart: the hand drop reaches the catalogue', () => {
    // Without this the split could be met by loading nothing at all.
    expect(liveLog).toContain('Loaded extensions for org.nocodenation.review:probe-sound-nar:1.0.0');
    expect(liveInbox).toContain(`load=${SOUND}`);
  });

  test('B5-29 and the auto-loader was never offered a partial copy', () => {
    // The promotion writes a dot-file and renames it, which is why the
    // auto-loader reports skipping one.
    expect(liveLog).toContain(`Skipping non-nar file .${SOUND}.part`);
  });
});

describe('B5-30 and the boot pass loads it too', () => {
  test('B5-30 the counterpart for the other route', () => {
    expect(bootLog).toContain('Loaded extensions for org.nocodenation.review:probe-sound-nar:1.0.0');
    expect(bootDirs).toContain(`load=${SOUND}`);
  });
});
