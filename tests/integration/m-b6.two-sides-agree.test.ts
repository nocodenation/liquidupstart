/**
 * M-B6 · Integration · The two sides of the check give one answer
 *
 * Purpose:  S1 of the 2026-10-01 review, and it is the same finding as blocker 3
 *           of 2026-09-28 fixed on one side only. A NAR inherits its declared
 *           parent\u0027s classes at runtime, so a reference the parent provides
 *           resolves in Liquid and must resolve in the check. `check` was given
 *           the chain; `check-index` -- the mode `nar-build` runs, and therefore
 *           the one standing in the path of a deployment -- was given
 *           `frozenset()`.
 *
 *           Measured over the 118 NARs the stock image ships: `check` refused 0
 *           and `check-index` refused **11**, citing KerberosUserService and
 *           FlowFileFilters. The comment at `build.sh:8-11` promised a bundle
 *           gets the same answer on either side. B5-4 tested only `check`, which
 *           is how one side stayed wrong.
 *
 *           `index` mode now writes the chain out as well -- `nar-classes.txt`
 *           and `nar-parents.txt`, 910 lines and 106 links for the stock lib --
 *           and `check-index` walks it with the same matching rule
 *           `parent_chain_classes` uses: the parent is named by artifact id, and
 *           a NAR whose basename starts with that id and a hyphen is it.
 * Given:    `ghcr.io/nocodenation/liquid-nifi:latest`, with `narcheck.py` from
 *           this tree mounted over the image\u0027s own, so the subject is the file
 *           under review rather than whatever the image was built with.
 * When:     Both modes are run over each of the eleven bundles the reviewer
 *           measured, named by prefix so a version bump does not silence the
 *           case; and over a child whose parent has been left out of the library.
 * Then:     Both modes permit all eleven, and both refuse the child whose parent
 *           is missing.
 * Covers:   B6-12, B6-13, FR23, FR27, FR36
 * Unhappy:  B6-13 is the one that matters. Making `check-index` permissive enough
 *           to accept the eleven is trivial -- resolving against every class in
 *           the library would do it -- and it would reintroduce blocker 3 in the
 *           opposite direction, permitting a bundle whose parent is not there.
 *           The whole worth of B6-12 rests on B6-13 holding at the same time.
 *
 * The full 118-wide sweep is a recorded measurement rather than an assertion:
 * 236 narcheck runs per execution is minutes of a default-tier run, and the
 * eleven are the exact regression set. `total=118 refused_check=0
 * refused_check_index=0`, measured 2026-10-05; it was 11 before.
 */
import { test, expect, describe, beforeAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const LIQUID = 'ghcr.io/nocodenation/liquid-nifi:latest';
const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');

const work = mkdtempSync(join(tmpdir(), 'm-b6-two-sides-'));
const probe = join(work, 'both-modes.sh');

// Plain string literals, not a template literal.
const PROBE =
  [
    "#!/bin/sh",
    "set -u",
    "LIB=/opt/nifi/nifi-current/lib",
    "IDX=/tmp/idx",
    "mkdir -p \"$IDX\"",
    "echo \"index: $(python3 /narcheck.py index \"$LIB\" \"$IDX\")\"",
    "# The eleven the reviewer measured as refused by check-index while check",
    "# permitted them, named by prefix so a version bump does not silence the case.",
    "for pre in nifi-standard-nar nifi-kafka-nar nifi-dbcp-service-nar nifi-avro-nar \\",
    "          nifi-poi-nar nifi-airtable-nar nifi-network-processors-nar \\",
    "          nifi-kerberos-user-service-nar nifi-kafka-3-service-nar \\",
    "          nifi-kafka-service-aws-nar nifi-server-nar; do",
    "  n=\"$(ls \"$LIB\"/${pre}-*.nar 2>/dev/null | head -1)\"",
    "  if [ -z \"$n\" ]; then echo \"pair ${pre}: ABSENT\"; continue; fi",
    "  c=0; i=0",
    "  python3 /narcheck.py check \"$n\" \"$LIB\" >/dev/null 2>&1 || c=1",
    "  python3 /narcheck.py check-index \"$n\" \"$IDX\" >/dev/null 2>&1 || i=1",
    "  echo \"pair ${pre}: check=${c} check-index=${i}\"",
    "done",
    "# The other direction: a child whose parent is not in the library must still be",
    "# refused by both, or the chain index has become \"resolve against everything\".",
    "child=\"$(ls \"$LIB\"/nifi-kafka-3-service-nar-*.nar 2>/dev/null | head -1)\"",
    "NARROW=/tmp/narrow; mkdir -p \"$NARROW\"",
    "for f in \"$LIB\"/*.jar; do ln -sf \"$f\" \"$NARROW/\"; done",
    "for f in \"$LIB\"/*.nar; do",
    "  case \"$(basename \"$f\")\" in",
    "    nifi-standard-services-api-nar-*) : ;;",
    "    *) ln -sf \"$f\" \"$NARROW/\" ;;",
    "  esac",
    "done",
    "IDXN=/tmp/idxn; mkdir -p \"$IDXN\"",
    "python3 /narcheck.py index \"$NARROW\" \"$IDXN\" >/dev/null 2>&1",
    "oc=0; oi=0",
    "python3 /narcheck.py check \"$child\" \"$NARROW\" >/dev/null 2>&1 || oc=1",
    "python3 /narcheck.py check-index \"$child\" \"$IDXN\" >/tmp/o 2>&1 || oi=1",
    "echo \"orphan: check=${oc} check-index=${oi} lines=$(grep -c references /tmp/o 2>/dev/null || echo 0)\"",
  ].join('\n') + '\n';

writeFileSync(probe, PROBE, { mode: 0o755 });

let out = '';
beforeAll(() => {
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${NARCHECK}:/narcheck.py:ro`,
    '-v', `${probe}:/both-modes.sh:ro`,
    '--entrypoint', 'sh',
    LIQUID, '/both-modes.sh'
  ]);
  out = r.output;
  if (!out.includes('orphan:')) {
    throw new Error(`the probe did not finish (exit ${r.code}):\n${out}`);
  }
  rmSync(work, { recursive: true, force: true });
}, 1_800_000);

const PAIRS = [
  'nifi-standard-nar', 'nifi-kafka-nar', 'nifi-dbcp-service-nar', 'nifi-avro-nar',
  'nifi-poi-nar', 'nifi-airtable-nar', 'nifi-network-processors-nar',
  'nifi-kerberos-user-service-nar', 'nifi-kafka-3-service-nar',
  'nifi-kafka-service-aws-nar', 'nifi-server-nar'
];

describe('B6-12 both modes give one answer on the bundles that disagreed', () => {
  test('B6-12 the index was written, with a chain in it', () => {
    // The premise: without the two chain files there is nothing for the walk to
    // read, and check-index would refuse everything rather than permit it.
    expect(out).toMatch(/index: \d+ classes, \d+ api packages, [1-9]\d* parent links, [1-9]\d* chain classes/);
  });

  test('B6-12 all eleven are permitted by both modes', () => {
    const disagreed = PAIRS.filter((p) => !out.includes(`pair ${p}: check=0 check-index=0`));
    // Named rather than counted, so a failure says which bundle and not how many.
    expect({ disagreed }).toEqual({ disagreed: [] });
  });
});

describe('B6-13 the counterpart: a parent that is not there is still a refusal', () => {
  test('B6-13 a child whose parent is left out is refused by both modes', () => {
    // Without this, B6-12 is met by resolving against every class in the library,
    // which is blocker 3 of the 2026-09-28 review in the opposite direction:
    // a bundle compiled against an API this Liquid does not load would pass.
    const m = out.match(/orphan: check=(\d) check-index=(\d) lines=(\d+)/);
    expect(m).not.toBeNull();
    expect({ check: m?.[1], index: m?.[2] }).toEqual({ check: '1', index: '1' });
  });

  test('B6-13 and it names the references it could not resolve', () => {
    // A refusal with no lines is a refusal the author cannot act on.
    const m = out.match(/orphan: .* lines=(\d+)/);
    expect(Number(m?.[1] ?? 0)).toBeGreaterThan(0);
  });
});
