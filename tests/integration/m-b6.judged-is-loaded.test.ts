/**
 * M-B6 · Integration · What the watcher judged is what loads
 *
 * Purpose:  S6 and M5 of the 2026-10-01 review -- one change to one function,
 *           because both rewrite `judge()`\u0027s refusal branch and both write the
 *           `seen` list.
 *
 *           **S6.** The watcher judged the file at its inbox path and then copied
 *           it by that same path. The inbox is writable by the agents
 *           (`compose.yml:339`, `817`, `926`) and by the builder, so the bytes
 *           that were judged and the bytes that loaded were two reads of a file
 *           somebody else can replace in between. `SKILL.md` section 6.4 and FR30
 *           say everything in the inbox is judged before anything is loaded; that
 *           was true of a read, not of a file. It judges the copy now: copy to the
 *           dot-name in the load directory, judge **that**, rename it into place.
 *
 *           And the hole moved one line down if nothing else changed: the sweep
 *           re-stamped the file *after* the judgement, so a swap would be recorded
 *           as judged under its new bytes and never looked at again. The stamp
 *           taken before the judgement is the one recorded.
 *
 *           **M5.** A zip\u0027s central directory is written last, so "could not be
 *           opened as an archive" is the one refusal an arriving file produces as
 *           readily as a broken one -- and the stability gate requires a single
 *           unchanged interval, which a copy that pauses mid-stream satisfies. A
 *           slow drop was refused and then finished inside `refused/`.
 *
 *           **The first repair for M5 was measured and failed.** It counted
 *           consecutive still passes and refused after three: at a 1s interval
 *           that is three seconds, and the copy under test paused for five. Any N
 *           is the same mistake one layer in -- a guess about how long a writer
 *           may pause, which holds until the machine is busy. So an unreadable
 *           archive is not refused at all: it stays in the inbox, which is not
 *           the load path, with one line in the log, and is judged again when it
 *           changes. What is given up is the move into `refused/` for that one
 *           case, and it is a category it never belonged to -- `refused/` means
 *           judged and found wrong, and this was never judged.
 * Given:    `ghcr.io/nocodenation/liquid-nifi:latest`, `nar-watch.sh` and
 *           `narcheck.py` from this tree copied into a writable directory inside
 *           it (NAR_WATCH and NAR_CHECK resolve beside the running script), a
 *           sandbox NIFI_HOME under /tmp with one nifi-api jar in `lib/`, and
 *           `NAR_WATCH_INTERVAL_SECONDS=1`. The bundle is a real archive carrying
 *           one entry, notes.txt holding `probe`, so it carries no class and the
 *           verdict turns on readability alone.
 * When:     A permitted bundle is replaced two seconds into a three-second
 *           judgement; a bundle is copied in with a five-second pause after its
 *           first 80 bytes; and a file that is not an archive at all is dropped.
 * Then:     The swapped bytes do not load and the file is judged again; the slow
 *           copy is never quarantined and loads once it is whole; and the file
 *           that is not an archive stays in the inbox, unloaded, with the reason
 *           in the log and no dot-file left in the load directory.
 * Covers:   B6-14, B6-15, B6-16, FR30, U10, NFR3
 * Unhappy:  B6-16 is the counterpart M5 needs. Not refusing an unreadable archive
 *           could be met by loading it, or by leaving a `.part` where the
 *           auto-loader will eventually be pointed at it; what it must mean is
 *           unloaded and said out loud. Without B6-16, M5\u0027s repair and a
 *           regression are the same observation.
 */
import { test, expect, describe, beforeAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const LIQUID = 'ghcr.io/nocodenation/liquid-nifi:latest';
const WATCH = join(repoRoot, 'config/liquid/nar-watch.sh');
const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');

const work = mkdtempSync(join(tmpdir(), 'm-b6-watcher-'));
const probe = join(work, 'watcher.sh');

// Plain string literals, not a template literal.
const PROBE =
  [
    "#!/bin/sh",
    "set -u",
    "export NIFI_HOME=/tmp/sb",
    "export NAR_WATCH_INTERVAL_SECONDS=1",
    "mkdir -p \"$NIFI_HOME/nar_inbox\" \"$NIFI_HOME/nar_extensions\" \"$NIFI_HOME/lib\"",
    "cp /opt/nifi/nifi-current/lib/nifi-api-*.jar \"$NIFI_HOME/lib/\" 2>/dev/null",
    "cp /nar-watch.sh /watch.d/nar-watch.sh && chmod 755 /watch.d/nar-watch.sh",
    "python3 -c \"",
    "import zipfile",
    "z = zipfile.ZipFile('/tmp/plain.nar','w')",
    "z.writestr('notes.txt','probe')",
    "z.close()\"",
    "",
    "echo \"=== S6: the bytes are swapped between judging and loading ===\"",
    "# A narcheck stand-in that permits, and takes long enough for the swap to land",
    "# inside the window between the judgement and the load.",
    "printf \"import sys, time\\ntime.sleep(3)\\nsys.exit(0)\\n\" > /watch.d/narcheck.py",
    "cp /tmp/plain.nar \"$NIFI_HOME/nar_inbox/swap.nar\"",
    "/watch.d/nar-watch.sh > /tmp/w1.log 2>&1 &",
    "wpid=$!",
    "sleep 2",
    "printf \"EVIL-PAYLOAD-NOT-AN-ARCHIVE\\n\" > \"$NIFI_HOME/nar_inbox/swap.nar\"",
    "# Read twice. At this point the first judgement has finished and renamed its",
    "# copy: what is in the load directory must be what was judged.",
    "sleep 4",
    "loaded=\"$NIFI_HOME/nar_extensions/swap.nar\"",
    "if [ -f \"$loaded\" ]; then",
    "  if grep -q EVIL-PAYLOAD \"$loaded\" 2>/dev/null; then echo \"s6-loaded=the-swapped-bytes\"; else echo \"s6-loaded=the-judged-bytes\"; fi",
    "else",
    "  echo \"s6-loaded=nothing\"",
    "fi",
    "# And again, far enough out for a second judgement to finish. The stand-in",
    "# permits everything, so the swapped bytes arriving here is the proof that",
    "# the replacement was judged again rather than recorded as already done.",
    "sleep 8",
    "kill $wpid 2>/dev/null; wait $wpid 2>/dev/null",
    "if [ -f \"$loaded\" ] && grep -q EVIL-PAYLOAD \"$loaded\" 2>/dev/null; then",
    "  echo \"s6-rejudged=yes\"",
    "else",
    "  echo \"s6-rejudged=no\"",
    "fi",
    "",
    "echo \"=== M5: a copy that pauses mid-stream ===\"",
    "cp /narcheck.py /watch.d/narcheck.py",
    "rm -rf \"$NIFI_HOME/nar_inbox\" \"$NIFI_HOME/nar_extensions\"",
    "mkdir -p \"$NIFI_HOME/nar_inbox\" \"$NIFI_HOME/nar_extensions\"",
    "/watch.d/nar-watch.sh > /tmp/w2.log 2>&1 &",
    "wpid=$!",
    "( head -c 80 /tmp/plain.nar; sleep 5; tail -c +81 /tmp/plain.nar ) > \"$NIFI_HOME/nar_inbox/slow.nar\"",
    "sleep 6",
    "kill $wpid 2>/dev/null; wait $wpid 2>/dev/null",
    "echo \"m5-refused=[$(ls -A \"$NIFI_HOME/nar_inbox/refused\" 2>/dev/null | tr \"\\n\" \" \")]\"",
    "echo \"m5-loaded=[$(ls -A \"$NIFI_HOME/nar_extensions\" | tr \"\\n\" \" \")]\"",
    "grep -q \"cannot be opened as an archive\" /tmp/w2.log && echo \"m5-said-unreadable=yes\" || echo \"m5-said-unreadable=no\"",
    "",
    "echo \"=== M5 counterpart: a bundle that is genuinely corrupt stays unloaded ===\"",
    "rm -rf \"$NIFI_HOME/nar_inbox\" \"$NIFI_HOME/nar_extensions\"",
    "mkdir -p \"$NIFI_HOME/nar_inbox\" \"$NIFI_HOME/nar_extensions\"",
    "printf \"NOT-AN-ARCHIVE-AT-ALL\\n\" > \"$NIFI_HOME/nar_inbox/junk.nar\"",
    "/watch.d/nar-watch.sh > /tmp/w3.log 2>&1 &",
    "wpid=$!",
    "sleep 5",
    "kill $wpid 2>/dev/null; wait $wpid 2>/dev/null",
    "echo \"corrupt-loaded=[$(ls -A \"$NIFI_HOME/nar_extensions\" | tr \"\\n\" \" \")]\"",
    "echo \"corrupt-in-inbox=$([ -f \"$NIFI_HOME/nar_inbox/junk.nar\" ] && echo yes || echo no)\"",
    "echo \"corrupt-lines=$(grep -c \"cannot be opened as an archive\" /tmp/w3.log)\"",
    "echo \"corrupt-part-left=[$(ls -A \"$NIFI_HOME/nar_extensions\" | grep -c part || true)]\"",
  ].join('\n') + '\n';

writeFileSync(probe, PROBE, { mode: 0o755 });

let out = '';
beforeAll(() => {
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${WATCH}:/nar-watch.sh:ro`,
    '-v', `${NARCHECK}:/narcheck.py:ro`,
    '-v', `${probe}:/watcher.sh:ro`,
    '--tmpfs', '/watch.d:exec',
    '--entrypoint', 'sh',
    LIQUID, '/watcher.sh'
  ]);
  out = r.output;
  if (!out.includes('corrupt-lines=')) {
    throw new Error(`the watcher probe did not finish (exit ${r.code}):\n${out}`);
  }
  rmSync(work, { recursive: true, force: true });
}, 900_000);

const field = (name) => (out.match(new RegExp(`${name}=([^\\n]*)`)) ?? [, ''])[1];

describe('B6-14 the bytes that were judged are the bytes that load', () => {
  test('B6-14 a bundle replaced during the judgement does not load', () => {
    // Before: the judged copy was taken from the inbox path after the verdict, so
    // `the-swapped-bytes` is what came back.
    expect(field('s6-loaded')).toBe('the-judged-bytes');
  });

  test('B6-14 and the replacement is judged again rather than recorded as done', () => {
    // The hole one line down: re-stamping *after* the judgement records the new
    // bytes as already judged, and the swap is then never looked at again. Read
    // eight seconds further out, with a stand-in that permits everything, so the
    // swapped bytes arriving in the load directory is the proof that they were
    // judged -- and the first assertion above is the proof they did not arrive
    // before that.
    expect(field('s6-rejudged')).toBe('yes');
  });
});

describe('B6-15 a copy that pauses is not a bundle that is wrong', () => {
  test('B6-15 it is not quarantined while it is arriving', () => {
    expect(field('m5-refused')).toBe('[]');
  });

  test('B6-15 and it loads once it is whole', () => {
    expect(field('m5-loaded')).toContain('slow.nar');
  });

  test('B6-15 and the watcher said why it waited', () => {
    expect(field('m5-said-unreadable')).toBe('yes');
  });
});

describe('B6-16 the counterpart: something that is not an archive stays unloaded', () => {
  test('B6-16 it does not reach the load directory', () => {
    // Not refusing is not permitting. Without this, B6-15 is satisfied by a
    // watcher that loads whatever it cannot read.
    expect(field('corrupt-loaded')).toBe('[]');
  });

  test('B6-16 it stays where the operator dropped it, and is named in the log', () => {
    expect({ inbox: field('corrupt-in-inbox'), lines: field('corrupt-lines') }).toEqual({
      inbox: 'yes',
      lines: '1'
    });
  });

  test('B6-16 and no dot-file is left in the load directory', () => {
    // The copy is made before the judgement now, so a refusal has something to
    // clean up that it did not have before.
    expect(field('corrupt-part-left')).toBe('[0]');
  });
});
