/**
 * M-B2 · Contract · The inbox reaches Liquid's load path
 *
 * Purpose:  FR30, and the mechanism that makes nar_extensions mean anything.
 *           M-B1 produces an artifact and writes it into the drop directory;
 *           that directory is only a directory until Liquid's entrypoint copies
 *           out of it, ahead of the launch, and nothing has ever asserted that
 *           it does. The case runs the entrypoint rather than reading it, so a
 *           copy step that is present in the text but does not work is a
 *           failure here.
 * Given:    config/liquid/entrypoint.sh, run against a sandbox instead of the
 *           image: a temporary NIFI_BASE_DIR holding nifi-current/nar_inbox
 *           with two files, b2-probe.nar and b2-second.nar, each a real archive
 *           carrying one entry, probe.txt, holding the single line `probe`.
 *           Until M-B4 those were the bare bytes, because the entrypoint copied
 *           files and never opened one; FR36's check does open them, and a file
 *           that is not an archive is now refused rather than copied. There is
 *           no class in either, so there is nothing for that check to judge and
 *           the copy is what is left being asserted. Beside them an
 *           empty nifi-current/nar_extensions -- the load directory --
 *           and scripts/start.sh standing in for Liquid's launcher, which
 *           records that directory's listing at the moment it is executed. That recording is what makes "before the launch"
 *           assertable rather than assumed.
 * When:     The entrypoint is executed with NIFI_BASE_DIR and NIFI_HOME pointing
 *           into the sandbox.
 * Then:     Both NARs are in the load directory, the launcher ran, and the listing it recorded
 *           already holds both — so the copy happened before Liquid launched,
 *           not after. The output names each file it copied, and the file itself
 *           reads the inbox before the load directory and copies before it execs.
 * Covers:   B2-5, FR30, U10
 * Unhappy:  B2-6 is the counterpart, and the pair is the point: the same
 *           entrypoint against a destination it cannot write must report the
 *           failure instead of discarding it.
 */
import { test, expect, afterAll } from 'bun:test';
import {
  sandbox,
  runEntrypoint,
  loadContents,
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

test('B2-5 every NAR in the inbox is now in the load directory', () => {
  // **Corrected 2026-09-29.** This read "is now in lib/". Approved bundles went
  // to lib/ while the drop directory was itself NiFi's auto-load directory, so
  // the copy was the redundant half of two load paths. The two directories are
  // separate now -- the inbox is judged, the load directory is what NiFi reads
  // -- and lib/ is the image's own, untouched. Item 11 of the 2026-09-28 review.
  expect(loadContents(sb)).toEqual([...NAR_NAMES].sort());
});

test('B2-5 the copy happened before Liquid launched', () => {
  const seen = launchSaw(sb);
  expect(seen).not.toBe('');
  for (const nar of NAR_NAMES) expect(seen).toContain(nar);
});

test('B2-5 the output names what it copied', () => {
  for (const nar of NAR_NAMES) expect(run.output).toContain(nar);
});

test('B2-5 the file copies out of the inbox into the load directory before the launch', () => {
  const inbox = text.indexOf('nar_inbox');
  const load = text.indexOf('LOAD_DIR');
  const launch = text.indexOf('exec ');
  expect(inbox).toBeGreaterThan(-1);
  expect(load).toBeGreaterThan(inbox);
  expect(launch).toBeGreaterThan(load);
});
