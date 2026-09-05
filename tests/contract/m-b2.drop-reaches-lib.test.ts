/**
 * M-B2 · Contract · The drop directory reaches Liquid's load path
 *
 * Purpose:  FR30, and the mechanism that makes nar_extensions mean anything.
 *           M-B1 produces an artifact and writes it into the drop directory;
 *           that directory is only a directory until Liquid's entrypoint copies
 *           out of it, ahead of the launch, and nothing has ever asserted that
 *           it does. The case runs the entrypoint rather than reading it, so a
 *           copy step that is present in the text but does not work is a
 *           failure here.
 * Given:    config/liquid/entrypoint.sh, run against a sandbox instead of the
 *           image: a temporary NIFI_BASE_DIR holding nifi-current/nar_extensions
 *           with two files, b2-probe.nar and b2-second.nar, each holding the
 *           single line `probe` — the entrypoint copies files and never opens
 *           them, so a real archive would prove nothing a byte would not — an
 *           empty nifi-current/lib, and scripts/start.sh standing in for
 *           Liquid's launcher, which records the listing of lib/ at the moment
 *           it is executed. That recording is what makes "before the launch"
 *           assertable rather than assumed.
 * When:     The entrypoint is executed with NIFI_BASE_DIR and NIFI_HOME pointing
 *           into the sandbox.
 * Then:     Both NARs are in lib/, the launcher ran, and the listing it recorded
 *           already holds both — so the copy happened before Liquid launched,
 *           not after. The output names each file it copied, and the file itself
 *           reads nar_extensions before lib and copies before it execs.
 * Covers:   B2-5, FR30, U10
 * Unhappy:  B2-6 is the counterpart, and the pair is the point: the same
 *           entrypoint against a destination it cannot write must report the
 *           failure instead of discarding it.
 */
import { test, expect, afterAll } from 'bun:test';
import {
  sandbox,
  runEntrypoint,
  libContents,
  launchSaw,
  discard,
  entrypointText,
  NAR_NAMES
} from '../lib/entrypointfixture';
import type { Result } from '../lib/shell';

const sb = sandbox({ nars: NAR_NAMES });
const text = entrypointText();
let run: Result;

afterAll(() => discard(sb));

test('B2-5 the entrypoint runs against the sandbox', () => {
  run = runEntrypoint(sb);
  expect(run.code).toBe(0);
});

test('B2-5 every NAR in the drop directory is now in lib/', () => {
  expect(libContents(sb)).toEqual([...NAR_NAMES].sort());
});

test('B2-5 the copy happened before Liquid launched', () => {
  const seen = launchSaw(sb);
  expect(seen).not.toBe('');
  for (const nar of NAR_NAMES) expect(seen).toContain(nar);
});

test('B2-5 the output names what it copied', () => {
  for (const nar of NAR_NAMES) expect(run.output).toContain(nar);
});

test('B2-5 the file copies out of nar_extensions into lib before the launch', () => {
  const copy = text.indexOf('nar_extensions');
  const lib = text.indexOf('lib');
  const launch = text.indexOf('exec ');
  expect(copy).toBeGreaterThan(-1);
  expect(lib).toBeGreaterThan(copy);
  expect(launch).toBeGreaterThan(lib);
});
