/**
 * M-B6 · Integration · The refusal path names a file without executing it
 *
 * Purpose:  C1 of the 2026-10-13 re-review, and it was a live hole. Both the
 *           builder and the watcher rewrite narcheck's refusal so it names the
 *           file the operator dropped rather than the internal dot-copy, and both
 *           did it with `sed "s|${part}|...|g"` -- which puts an
 *           attacker-controlled basename unescaped on **both sides** of a `sed`
 *           expression. GNU sed, which both images ship, has an `e` command that
 *           executes the pattern space, so a name shaped `x|y|;e <cmd>;#.nar`
 *           closes the `s`, opens an `e`, and runs `<cmd>`.
 *
 *           The reviewer reproduced it as **root** in the builder and as **nifi**
 *           in Liquid. The watcher leg needs no builder at all: the inbox is
 *           writable by the agents, so a file dropped there with such a name runs
 *           a command inside the Liquid container.
 *
 *           Reproduced again here before the repair, against the exact string the
 *           script builds: `rc=0`, and `/tmp/PWNED` holding
 *           `uid=0(root) gid=0(root)`.
 * Given:    the two shipped scripts, and a basename carrying a `sed` payload.
 * When:     each script's own substitution is run over a refusal naming the
 *           dot-copy
 * Then:     no command runs, the dot-path is gone from the text, and an ordinary
 *           name containing `|` survives unmangled
 * Covers:   B6-35, FR30, FR36
 * Unhappy:  The payload is the negative half. The ordinary `|` name is its
 *           counterpart and it is not decoration: the reviewer's suggested fix
 *           (`awk -v` with `gsub`) stops the execution and still mangles that
 *           name, because `gsub`'s first argument is a regular expression. That
 *           is N4 of the same review, and without this scenario the suite would
 *           have accepted a fix that left it open.
 *
 * What this drives, said exactly, because a control showed the first version of
 * this header claiming more than the cases do. There are two halves and they are
 * not interchangeable:
 *
 *   - **the mechanism**: the replacement each script uses, run with the payload
 *     under the shell that script declares. `build.sh`'s is extracted from the
 *     shipped file, so a drifted copy cannot satisfy it.
 *   - **the wiring**: that the shipped call site uses that replacement and no
 *     `sed` substitution remains in either file's code.
 *
 * **The mechanism half alone does not notice a changed call site.** Measured:
 * putting the old `sed` line back at `build.sh`'s call site reddens only the
 * wiring case, because `literal_replace` is still defined in the file and the
 * mechanism case calls it directly. So the wiring case is not decoration around a
 * behavioural check -- it is the half that sees the defect being reintroduced, and
 * saying otherwise would have been the "a case that cannot fail" shape this
 * milestone has three entries about.
 *
 * Neither half drives a whole failing build with a crafted `<finalName>`. That
 * needs Maven Central and a pom per payload and would measure the same line
 * through four more moving parts; the gap is stated rather than papered over.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const BUILD_SH = join(repoRoot, 'config/nar_builder/build.sh');
const WATCH_SH = join(repoRoot, 'config/liquid/nar-watch.sh');

/** A basename that closes a `sed s|…|…|` and opens an `e` command. */
const PAYLOAD = 'x|y|;e id>/tmp/PWNED;#.nar';
/** The same shape without the `;e` -- N4's benign leg. */
const ORDINARY = 'ordinary|name.nar';

/** Code only: a comment quoting the old line must not satisfy a structural check. */
const code = (p: string) =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

describe('B6-35 the builder leg: the replacement it uses treats a name as text', () => {
  // build.sh is `#!/bin/sh`, so the replacement is POSIX parameter expansion with
  // a quoted pattern. The function is taken out of the shipped file rather than
  // restated here, so the case cannot pass against a copy that has drifted.
  const run = (base: string) =>
    sh([
      'docker', 'run', '--rm', '-v', `${BUILD_SH}:/build.sh:ro`,
      '--entrypoint', 'sh', 'debian:bookworm-slim', '-c',
      `eval "$(sed -n '/^literal_replace() {/,/^}/p' /build.sh)"
       DROP=/deploy/nar_extensions
       base='${base.replace(/'/g, "'\\''")}'
       part="$DROP/.$base.1.part"
       out="$(literal_replace "refused $part: a reason, and again $part" "$part" "$DROP/$base")"
       printf 'OUT=%s\\n' "$out"
       printf 'RAN=%s\\n' "$([ -e /tmp/PWNED ] && echo yes || echo no)"`
    ], undefined, 120_000);

  test('B6-35 the payload runs nothing and the dot-path is gone', () => {
    const r = run(PAYLOAD);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('RAN=no');
    // The substitution still did its job: no internal dot-copy name survives.
    expect(r.stdout).not.toContain('.part');
    expect(r.stdout).toContain(`/deploy/nar_extensions/${PAYLOAD}`);
  }, 180_000);

  test('B6-35 and an ordinary name containing a pipe is not mangled', () => {
    // The counterpart that rules out awk/gsub: there, this came back three times
    // over, because `|` is alternation to a regex engine.
    const r = run(ORDINARY);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`OUT=refused /deploy/nar_extensions/${ORDINARY}: a reason`);
  }, 180_000);
});

describe('B6-35 the watcher leg, which needs no builder, and its wiring', () => {
  // nar-watch.sh is bash; the expansion is `${REFUSAL//"$part"/$1}`. The quotes
  // around the needle are what make it literal -- dropping them reopens it as a
  // glob, which is why the case asserts the expansion as the file spells it.
  test('B6-35 the payload runs nothing through the watcher substitution', () => {
    const r = sh([
      'docker', 'run', '--rm',
      '--entrypoint', 'bash', 'debian:bookworm-slim', '-c',
      `base='${PAYLOAD.replace(/'/g, "'\\''")}'
       inbox=/nar_inbox
       part="$inbox/.$base.part"
       REFUSAL="refused $part: a reason"
       REFUSAL="\${REFUSAL//"$part"/$inbox/$base}"
       printf 'OUT=%s\\n' "$REFUSAL"
       printf 'RAN=%s\\n' "$([ -e /tmp/PWNED ] && echo yes || echo no)"`
    ], undefined, 120_000);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('RAN=no');
    expect(r.stdout).not.toContain('.part');
  }, 180_000);

  test('B6-35 and the shipped file still spells it that way', () => {
    // The behavioural half above runs the expansion; this one asserts the file
    // being shipped is the one that was measured, quotes included.
    expect(code(WATCH_SH)).toContain('REFUSAL="${REFUSAL//"$part"/$1}"');
  });
});

describe('B6-35 the wiring: the regex engine is gone from both refusal paths', () => {
  test('B6-35 neither script substitutes with sed any more', () => {
    // Structural, and checked against code rather than text: both files carry
    // comments quoting the old `sed "s|...|...|g"` line, and a check that matched
    // those would pass against the defect itself.
    for (const p of [BUILD_SH, WATCH_SH]) {
      expect(code(p)).not.toMatch(/sed\s+"s\|/);
    }
    // And the replacement each one does use is present.
    expect(code(BUILD_SH)).toContain('literal_replace "$refusal" "$part"');
  });
});
