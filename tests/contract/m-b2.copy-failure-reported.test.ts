/**
 * M-B2 · Contract · unhappy · A failed copy into lib/ is reported, not swallowed
 *
 * Purpose:  FR31. The copy ended in `|| true`, so a failure — a full disk, a
 *           permission, an unreadable file — was discarded: Liquid started, the
 *           processor was absent, and the log said only how many NARs had been
 *           *found*. An operator would look for the mistake in the build, in the
 *           pom, in the descriptor: everywhere except the one step that reported
 *           success by saying nothing. That is the failure class this feature has
 *           spent seven milestones removing, sitting in the last step of the very
 *           path M-B2 documents.
 * Given:    config/liquid/entrypoint.sh run against the same sandbox as B2-5,
 *           with one difference that makes the copy fail for every user and on
 *           every host: nifi-current/lib is a regular file holding the line
 *           `not a directory`, so `cp` fails with ENOTDIR regardless of uid — a
 *           permission bit would not, since the operator's own Docker is
 *           rootless and the host user maps to root. The drop directory holds
 *           b2-probe.nar and b2-second.nar, each holding the line `probe`.
 * When:     The entrypoint is executed with NIFI_BASE_DIR and NIFI_HOME pointing
 *           into that sandbox.
 * Then:     The failure is named on the log with the file it concerns and with
 *           lib/ as the destination it did not reach, a next step is given, and
 *           the source carries no `|| true` that would discard it. Liquid is
 *           still launched: that is the decision this case records rather than
 *           assumes — the engine hosts every other running flow, and refusing to
 *           start over one unreadable extension would take all of them down and,
 *           under `restart: unless-stopped`, loop the container so fast that the
 *           message the operator needs scrolls away. What FR31 requires is that
 *           the failure be visible, not that it be fatal.
 * Covers:   B2-6, FR31, U10
 * Unhappy:  This is the negative case; B2-5 is its positive counterpart — the
 *           same entrypoint, a writable lib/, the NARs arriving and reported.
 */
import { test, expect, afterAll } from 'bun:test';
import {
  sandbox,
  runEntrypoint,
  launchSaw,
  discard,
  entrypointText,
  NAR_NAMES
} from '../lib/entrypointfixture';
import type { Result } from '../lib/shell';

const sb = sandbox({ nars: NAR_NAMES, libIsFile: true });
const text = entrypointText();
let run: Result;

test('B2-6 the entrypoint runs against a destination it cannot write', () => {
  run = runEntrypoint(sb);
  expect(run.output).toBeTruthy();
});

afterAll(() => discard(sb));

test('B2-6 the failure is named, with the file it concerns', () => {
  expect(run.output.toLowerCase()).toMatch(/fail/);
  for (const nar of NAR_NAMES) expect(run.output).toContain(nar);
});

test('B2-6 it names the destination the NAR did not reach', () => {
  expect(run.output).toContain(`${sb.home}/lib`);
});

test('B2-6 it names a next step', () => {
  expect(run.output).toMatch(/docker compose restart liquid/);
});

test('B2-6 nothing in the entrypoint discards a failure with || true', () => {
  expect(text).not.toContain('|| true');
});

test('B2-6 Liquid is still launched, which is the recorded decision', () => {
  expect(launchSaw(sb)).not.toBe('');
});
